package com.ytlivetranslate.app

import android.app.*
import android.content.*
import android.graphics.*
import android.os.*
import android.view.*
import android.view.ViewOutlineProvider
import android.widget.TextView
import androidx.core.app.NotificationCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.Executors

class FloatingWindowService : Service() {

    companion object {
        const val EXTRA_DEEPL_API_KEY = "deepl_api_key"
        const val CHANNEL_ID = "overlay_channel"
        const val NOTIFICATION_ID = 1001
    }

    private lateinit var windowManager: WindowManager
    private lateinit var overlayView: View
    private lateinit var subtitleTextView: TextView

    private var deeplApiKey: String = ""
    private var lastEnglishText: String = ""
    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    private val httpClient = OkHttpClient()

    private var initialX = 0
    private var initialY = 0
    private var initialTouchX = 0f
    private var initialTouchY = 0f

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID, buildNotification(),
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            )
        } else {
            startForeground(NOTIFICATION_ID, buildNotification())
        }
        setupOverlayView()
        LocalBroadcastManager.getInstance(this).registerReceiver(
            subtitleReceiver,
            IntentFilter(SubtitleAccessibilityService.ACTION_SUBTITLE_UPDATE)
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        intent?.getStringExtra(EXTRA_DEEPL_API_KEY)?.let { key ->
            if (key.isNotBlank()) deeplApiKey = key
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        LocalBroadcastManager.getInstance(this).unregisterReceiver(subtitleReceiver)
        if (::overlayView.isInitialized) {
            try {
                windowManager.removeView(overlayView)
            } catch (_: Exception) {
            }
        }
        executor.shutdown()
        super.onDestroy()
    }

    private fun setupOverlayView() {
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager

        val container = object : android.widget.FrameLayout(this) {}
        container.setBackgroundColor(Color.parseColor("#CC000000"))
        container.outlineProvider = object : ViewOutlineProvider() {
            override fun getOutline(view: View, outline: Outline) {
                outline.setRoundRect(0, 0, view.width, view.height, dpToPx(12).toFloat())
            }
        }
        container.clipToOutline = true

        subtitleTextView = TextView(this).apply {
            textSize = 18f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(dpToPx(12), dpToPx(8), dpToPx(12), dpToPx(8))
            maxLines = 3
            ellipsize = android.text.TextUtils.TruncateAt.END
            text = "YT Translate 已启动"
        }
        container.addView(subtitleTextView)
        overlayView = container

        val displayWidth = resources.displayMetrics.widthPixels
        val overlayWidth = (displayWidth * 0.9).toInt()

        @Suppress("DEPRECATION")
        val overlayType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else
            WindowManager.LayoutParams.TYPE_PHONE

        val params = WindowManager.LayoutParams(
            overlayWidth,
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            y = (resources.displayMetrics.heightPixels * 0.15).toInt()
        }

        windowManager.addView(overlayView, params)
        setupDrag(params)
    }

    private fun setupDrag(params: WindowManager.LayoutParams) {
        overlayView.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    params.x = initialX + (event.rawX - initialTouchX).toInt()
                    params.y = initialY + (event.rawY - initialTouchY).toInt()
                    windowManager.updateViewLayout(overlayView, params)
                    true
                }
                else -> false
            }
        }
    }

    private val subtitleReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val text = intent.getStringExtra(
                SubtitleAccessibilityService.EXTRA_SUBTITLE_TEXT
            ) ?: return
            if (text == lastEnglishText) return
            lastEnglishText = text
            translateAndDisplay(text)
        }
    }

    private fun translateAndDisplay(english: String) {
        if (deeplApiKey.isBlank()) {
            mainHandler.post { subtitleTextView.text = english }
            return
        }
        executor.execute {
            val chinese = callDeepL(english) ?: english
            mainHandler.post { subtitleTextView.text = chinese }
        }
    }

    private fun callDeepL(text: String): String? {
        val json = JSONObject().apply {
            put("text", JSONArray().put(text))
            put("target_lang", "ZH")
        }
        val body = json.toString().toRequestBody("application/json".toMediaType())
        val request = Request.Builder()
            .url("https://api-free.deepl.com/v2/translate")
            .addHeader("Authorization", "DeepL-Auth-Key $deeplApiKey")
            .post(body)
            .build()

        return try {
            httpClient.newCall(request).execute().use { resp ->
                if (!resp.isSuccessful) return null
                val respJson = JSONObject(resp.body!!.string())
                respJson.getJSONArray("translations")
                    .getJSONObject(0)
                    .getString("text")
            }
        } catch (_: IOException) {
            null
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "字幕翻译悬浮窗",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "字幕翻译悬浮窗运行中"
                setShowBadge(false)
            }
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("YT Translate 字幕翻译中")
            .setContentText("正在翻译 YouTube 字幕为中文")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun dpToPx(dp: Int): Int =
        (dp * resources.displayMetrics.density).toInt()
}
