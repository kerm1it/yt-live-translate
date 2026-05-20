package com.ytlivetranslate.app

import android.app.*
import android.content.*
import android.graphics.*
import android.os.*
import android.util.Log
import android.view.*
import android.view.ViewOutlineProvider
import android.widget.TextView
import androidx.core.app.NotificationCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import okhttp3.Call
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

class FloatingWindowService : Service() {

    companion object {
        const val TAG = "YTLiveOverlaySvc"
        const val CHANNEL_ID = "overlay_channel"
        const val NOTIFICATION_ID = 1001
        const val EXTRA_BASE_URL = "base_url"
        const val EXTRA_API_KEY = "api_key"
        const val EXTRA_MODEL = "model"
        const val EXTRA_TARGET_LANG = "target_lang"
    }

    private lateinit var windowManager: WindowManager
    private lateinit var overlayView: View
    private lateinit var subtitleTextView: TextView

    private var config: Translator.Config? = null
    private var lastSrc = ""
    @Volatile private var context = listOf<Translator.ContextPair>()
    private val pending = AtomicReference<String?>(null)
    private val workerActive = AtomicBoolean(false)
    @Volatile private var currentCall: Call? = null
    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

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
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
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
        intent?.let { extras ->
            val baseUrl = extras.getStringExtra(EXTRA_BASE_URL)
            val apiKey = extras.getStringExtra(EXTRA_API_KEY)
            val model = extras.getStringExtra(EXTRA_MODEL)
            val targetLang = extras.getStringExtra(EXTRA_TARGET_LANG)
            if (!baseUrl.isNullOrBlank() && !apiKey.isNullOrBlank() && !model.isNullOrBlank()) {
                config = Translator.Config(
                    baseUrl = baseUrl,
                    apiKey = apiKey,
                    model = model,
                    targetLang = targetLang?.ifBlank { "中文" } ?: "中文"
                )
                Log.i(TAG, "config loaded model=$model targetLang=$targetLang")
            }
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
            text = "YT Translate 已启动，等待字幕…"
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
        override fun onReceive(ctx: Context, intent: Intent) {
            val text = intent.getStringExtra(
                SubtitleAccessibilityService.EXTRA_SUBTITLE_TEXT
            )?.trim().orEmpty()
            if (text.isEmpty() || text == lastSrc) return
            lastSrc = text
            if (config == null) {
                mainHandler.post { subtitleTextView.text = text }
                return
            }
            val prev = pending.getAndSet(text)
            Log.i(TAG, "receiver: text='$text' replaced=${prev != null}")
            if (prev != null) currentCall?.cancel()
            startWorker()
        }
    }

    private fun startWorker() {
        val cfg = config ?: return
        if (!workerActive.compareAndSet(false, true)) return
        executor.execute {
            try {
                while (true) {
                    val text = pending.getAndSet(null) ?: break
                    Log.i(TAG, "stream begin: '$text'")
                    try {
                        val out = Translator.translateLineStream(
                            text, context, cfg,
                            callRef = { currentCall = it },
                            onDelta = { partial ->
                                mainHandler.post { subtitleTextView.text = partial }
                            }
                        )
                        currentCall = null
                        Log.i(TAG, "stream done: '$out'")
                        if (out.isNotBlank()) {
                            context = (context + Translator.ContextPair(text, out))
                                .takeLast(Translator.CONTEXT_WINDOW)
                        }
                    } catch (e: Exception) {
                        currentCall = null
                        Log.w(TAG, "stream failed", e)
                        // 如果是被取消（pending 已经有新文本），不要覆盖
                        if (pending.get() == null) {
                            mainHandler.post { subtitleTextView.text = text }
                        }
                    }
                }
            } finally {
                workerActive.set(false)
                if (pending.get() != null) startWorker()
            }
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
            .setContentText("正在翻译 YouTube 字幕")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun dpToPx(dp: Int): Int =
        (dp * resources.displayMetrics.density).toInt()
}
