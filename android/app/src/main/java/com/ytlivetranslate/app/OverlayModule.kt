package com.ytlivetranslate.app

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.facebook.react.bridge.*
import java.util.concurrent.Executors

class OverlayModule(private val reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val TAG = "YTLiveOverlay"
    }

    private val translateExecutor = Executors.newSingleThreadExecutor()

    override fun getName() = "OverlayModule"

    @ReactMethod
    fun startOverlay(config: ReadableMap) {
        val context = reactApplicationContext
        if (!Settings.canDrawOverlays(context)) {
            Log.w(TAG, "startOverlay: missing overlay permission")
            return
        }
        val baseUrl = config.getString("baseUrl").orEmpty()
        val apiKey = config.getString("apiKey").orEmpty()
        val model = config.getString("model").orEmpty()
        val targetLang = if (config.hasKey("targetLang"))
            config.getString("targetLang").orEmpty() else "中文"
        val intent = Intent(context, FloatingWindowService::class.java).apply {
            putExtra(FloatingWindowService.EXTRA_BASE_URL, baseUrl)
            putExtra(FloatingWindowService.EXTRA_API_KEY, apiKey)
            putExtra(FloatingWindowService.EXTRA_MODEL, model)
            putExtra(FloatingWindowService.EXTRA_TARGET_LANG, targetLang)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
    }

    @ReactMethod
    fun stopOverlay() {
        val context = reactApplicationContext
        context.stopService(Intent(context, FloatingWindowService::class.java))
    }

    @ReactMethod
    fun translateAll(config: ReadableMap, texts: ReadableArray, promise: Promise) {
        val cfg = try {
            Translator.Config(
                baseUrl = config.getString("baseUrl").orEmpty(),
                apiKey = config.getString("apiKey").orEmpty(),
                model = config.getString("model").orEmpty(),
                targetLang = if (config.hasKey("targetLang"))
                    config.getString("targetLang")?.ifBlank { "中文" } ?: "中文"
                else "中文"
            )
        } catch (e: Exception) {
            promise.reject("E_CONFIG", e.message, e)
            return
        }
        if (cfg.baseUrl.isBlank() || cfg.apiKey.isBlank() || cfg.model.isBlank()) {
            promise.reject("E_CONFIG", "缺少 baseUrl / apiKey / model")
            return
        }
        val list = ArrayList<String>(texts.size())
        for (i in 0 until texts.size()) {
            list.add(texts.getString(i) ?: "")
        }
        translateExecutor.execute {
            try {
                val out = Translator.translateAll(list, cfg) { done, total ->
                    val params = Arguments.createMap().apply {
                        putInt("completed", done)
                        putInt("total", total)
                    }
                    reactContext
                        .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit("OnTranslateProgress", params)
                }
                val result = Arguments.createArray()
                out.forEach { result.pushString(it) }
                promise.resolve(result)
            } catch (e: Translator.TranslateException) {
                promise.reject("E_TRANSLATE", e.message, e)
            } catch (e: Exception) {
                Log.e(TAG, "translateAll unexpected", e)
                promise.reject("E_TRANSLATE", e.message ?: "unknown error", e)
            }
        }
    }

    @ReactMethod
    fun hasOverlayPermission(callback: Callback) {
        callback.invoke(Settings.canDrawOverlays(reactApplicationContext))
    }

    @ReactMethod
    fun isAccessibilityEnabled(callback: Callback) {
        val context = reactApplicationContext
        val enabled = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: ""
        val serviceId = "${context.packageName}/${SubtitleAccessibilityService::class.java.name}"
        callback.invoke(enabled.contains(serviceId))
    }

    @ReactMethod
    fun openAccessibilitySettings() {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        reactApplicationContext.startActivity(intent)
    }

    @ReactMethod
    fun openOverlayPermissionSettings() {
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:${reactApplicationContext.packageName}")
        ).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK }
        reactApplicationContext.startActivity(intent)
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
