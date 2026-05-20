package com.ytlivetranslate.app

import android.util.Log
import okhttp3.Call
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

object Translator {
    private const val TAG = "YTLiveTranslator"
    private const val BATCH_SIZE = 20
    const val CONTEXT_WINDOW = 6

    data class Config(
        val baseUrl: String,
        val apiKey: String,
        val model: String,
        val targetLang: String
    )

    data class ContextPair(val source: String, val translation: String)

    class TranslateException(message: String, cause: Throwable? = null) : Exception(message, cause)

    private val client: OkHttpClient = OkHttpClient.Builder()
        .callTimeout(60, TimeUnit.SECONDS)
        .build()

    private val streamClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private fun streamSystemPrompt(targetLang: String, context: List<ContextPair>): String {
        val base = """You are a professional subtitle translator for live video streams.
Translate the user's next line into $targetLang.
Output ONLY the translated text — no quotes, no explanation, no echo of the source.
Preserve numbers, code, URLs, @handles, proper nouns. Keep well-known English terms (API, GPU, CEO) untranslated when natural.
If the line is already in $targetLang or is non-linguistic (e.g. "[music]", "..."), return it unchanged."""
        if (context.isEmpty()) return base
        val sb = StringBuilder(base)
        sb.append("\n\nRecent translated lines (terminology reference, do NOT repeat them):")
        context.forEach { p ->
            sb.append("\nEN: ").append(p.source)
            sb.append("\n").append(targetLang).append(": ").append(p.translation)
        }
        return sb.toString()
    }

    fun translateLineStream(
        text: String,
        context: List<ContextPair>,
        config: Config,
        callRef: (Call) -> Unit = {},
        onDelta: (String) -> Unit
    ): String {
        val base = config.baseUrl.trimEnd('/')
        val url = "$base/chat/completions"
        val body = JSONObject().apply {
            put("model", config.model)
            put("temperature", 0.3)
            put("stream", true)
            put("messages", JSONArray().apply {
                put(JSONObject().apply {
                    put("role", "system")
                    put("content", streamSystemPrompt(config.targetLang, context))
                })
                put(JSONObject().apply {
                    put("role", "user")
                    put("content", text)
                })
            })
        }.toString().toRequestBody("application/json".toMediaType())

        val request = Request.Builder()
            .url(url)
            .addHeader("Authorization", "Bearer ${config.apiKey}")
            .addHeader("Content-Type", "application/json")
            .addHeader("Accept", "text/event-stream")
            .post(body)
            .build()

        val call = streamClient.newCall(request)
        callRef(call)
        val sb = StringBuilder()
        try {
            call.execute().use { resp ->
                if (!resp.isSuccessful) {
                    val err = resp.body?.string().orEmpty()
                    Log.w(TAG, "stream HTTP ${resp.code}: $err")
                    when (resp.code) {
                        401, 403 -> throw TranslateException("API Key 无效或没有权限。")
                        429 -> throw TranslateException("请求过于频繁或配额已用尽。")
                        else -> throw TranslateException("翻译服务错误 (${resp.code})")
                    }
                }
                val source = resp.body?.source()
                    ?: throw TranslateException("流式响应为空。")
                while (true) {
                    val line = try {
                        source.readUtf8Line() ?: break
                    } catch (e: IOException) {
                        if (call.isCanceled()) throw TranslateException("已取消", e)
                        throw TranslateException("流读取失败: ${e.message}", e)
                    }
                    if (!line.startsWith("data:")) continue
                    val payload = line.removePrefix("data:").trim()
                    if (payload == "[DONE]" || payload.isEmpty()) {
                        if (payload == "[DONE]") break else continue
                    }
                    try {
                        val json = JSONObject(payload)
                        val choices = json.optJSONArray("choices") ?: continue
                        if (choices.length() == 0) continue
                        val delta = choices.getJSONObject(0).optJSONObject("delta") ?: continue
                        if (!delta.has("content") || delta.isNull("content")) continue
                        val content = delta.optString("content")
                        if (content.isNotEmpty()) {
                            sb.append(content)
                            onDelta(sb.toString())
                        }
                    } catch (_: Exception) {
                    }
                }
            }
        } catch (e: IOException) {
            throw TranslateException("网络错误: ${e.message}", e)
        }
        return sb.toString()
    }

    private fun systemPrompt(targetLang: String) =
        """You are a professional subtitle translator for live video streams.

Rules:
1. Translate each input line into $targetLang. Lines may be sentence fragments — translate them as-is without inventing context.
2. Output ONLY a JSON object of the form {"translations": ["...", "..."]} with the same length and order as the input. No prose, no markdown fences, no numbering.
3. Preserve numbers, code, URLs, @handles, and proper nouns. Keep well-known English terms (API, GPU, CEO) untranslated when natural.
4. Use natural spoken $targetLang, not literal word-for-word. Match the speaker's register (casual stays casual).
5. If a line is already in $targetLang or is non-linguistic (e.g. "...", "[music]"), return it unchanged.
6. Never refuse, never add explanations, never merge or split lines."""

    private fun buildUserPrompt(
        batch: List<String>,
        context: List<ContextPair>,
        targetLang: String
    ): String {
        val sb = StringBuilder()
        if (context.isNotEmpty()) {
            val arr = JSONArray()
            context.forEach { pair ->
                arr.put(JSONObject().apply {
                    put("src", pair.source)
                    put("tgt", pair.translation)
                })
            }
            sb.append("Previously translated lines (for terminology continuity, do NOT re-translate):\n")
            sb.append(arr.toString())
            sb.append("\n\n")
        }
        sb.append("Translate the following lines to $targetLang:\n")
        val batchArr = JSONArray()
        batch.forEach { batchArr.put(it) }
        sb.append(batchArr.toString())
        return sb.toString()
    }

    private fun parseTranslations(content: String, expectedLength: Int): List<String>? {
        var text = content.trim()
        val fenceRegex = Regex("```(?:json)?\\s*([\\s\\S]*?)```")
        fenceRegex.find(text)?.let { text = it.groupValues[1].trim() }
        return try {
            val json = JSONObject(text)
            val arr = json.optJSONArray("translations") ?: return null
            if (arr.length() != expectedLength) return null
            val out = ArrayList<String>(expectedLength)
            for (i in 0 until expectedLength) {
                val v = arr.opt(i) as? String ?: return null
                out.add(v)
            }
            out
        } catch (_: Exception) {
            null
        }
    }

    private fun callChatCompletion(
        config: Config,
        systemPrompt: String,
        userPrompt: String
    ): String {
        val base = config.baseUrl.trimEnd('/')
        val url = "$base/chat/completions"

        val body = JSONObject().apply {
            put("model", config.model)
            put("temperature", 0.3)
            put("response_format", JSONObject().apply { put("type", "json_object") })
            put("messages", JSONArray().apply {
                put(JSONObject().apply {
                    put("role", "system")
                    put("content", systemPrompt)
                })
                put(JSONObject().apply {
                    put("role", "user")
                    put("content", userPrompt)
                })
            })
        }.toString().toRequestBody("application/json".toMediaType())

        val request = Request.Builder()
            .url(url)
            .addHeader("Authorization", "Bearer ${config.apiKey}")
            .addHeader("Content-Type", "application/json")
            .post(body)
            .build()

        try {
            client.newCall(request).execute().use { resp ->
                if (!resp.isSuccessful) {
                    val errorBody = resp.body?.string().orEmpty()
                    Log.w(TAG, "HTTP ${resp.code}: $errorBody")
                    when (resp.code) {
                        401, 403 -> throw TranslateException("API Key 无效或没有权限。")
                        429 -> throw TranslateException("请求过于频繁或配额已用尽。")
                        else -> throw TranslateException("翻译服务错误 (${resp.code})")
                    }
                }
                val responseStr = resp.body?.string()
                    ?: throw TranslateException("翻译服务返回为空。")
                val json = JSONObject(responseStr)
                val choices = json.optJSONArray("choices")
                    ?: throw TranslateException("响应缺少 choices 字段。")
                if (choices.length() == 0) throw TranslateException("响应 choices 为空。")
                val message = choices.getJSONObject(0).optJSONObject("message")
                    ?: throw TranslateException("响应缺少 message 字段。")
                return message.optString("content").ifEmpty {
                    throw TranslateException("响应 content 为空。")
                }
            }
        } catch (e: IOException) {
            throw TranslateException("网络错误: ${e.message}", e)
        }
    }

    fun translateBatch(
        batch: List<String>,
        context: List<ContextPair>,
        config: Config
    ): List<String> {
        if (batch.isEmpty()) return emptyList()
        val content = callChatCompletion(
            config,
            systemPrompt(config.targetLang),
            buildUserPrompt(batch, context, config.targetLang)
        )
        val parsed = parseTranslations(content, batch.size)
        if (parsed != null) return parsed

        if (batch.size == 1) {
            Log.w(TAG, "single-line parse failed, returning raw")
            return listOf(content.trim().ifEmpty { batch[0] })
        }
        val mid = batch.size / 2
        val left = translateBatch(batch.subList(0, mid), context, config)
        val rightContext = (context + batch.subList(0, mid).mapIndexed { i, src ->
            ContextPair(src, left[i])
        }).takeLast(CONTEXT_WINDOW)
        val right = translateBatch(batch.subList(mid, batch.size), rightContext, config)
        return left + right
    }

    fun translateAll(
        texts: List<String>,
        config: Config,
        onProgress: ((Int, Int) -> Unit)? = null
    ): List<String> {
        if (texts.isEmpty()) return emptyList()
        val results = ArrayList<String>(texts.size)
        var context = listOf<ContextPair>()
        var i = 0
        while (i < texts.size) {
            val end = minOf(i + BATCH_SIZE, texts.size)
            val batch = texts.subList(i, end)
            val translations = translateBatch(batch, context, config)
            results.addAll(translations)
            context = (context + batch.mapIndexed { j, src ->
                ContextPair(src, translations[j])
            }).takeLast(CONTEXT_WINDOW)
            i = end
            onProgress?.invoke(i, texts.size)
        }
        return results
    }
}
