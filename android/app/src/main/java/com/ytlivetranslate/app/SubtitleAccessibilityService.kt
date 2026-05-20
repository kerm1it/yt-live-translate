package com.ytlivetranslate.app

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Intent
import android.graphics.Rect
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import androidx.localbroadcastmanager.content.LocalBroadcastManager

class SubtitleAccessibilityService : AccessibilityService() {

    companion object {
        const val TAG = "YTLiveA11y"
        const val ACTION_SUBTITLE_UPDATE = "com.ytlivetranslate.app.SUBTITLE_UPDATE"
        const val EXTRA_SUBTITLE_TEXT = "subtitle_text"

        @Volatile
        var isRunning = false
    }

    private val handler = Handler(Looper.getMainLooper())
    private var lastSubtitle = ""
    private var debounceRunnable: Runnable? = null

    override fun onServiceConnected() {
        isRunning = true
        Log.i(TAG, "onServiceConnected")
        serviceInfo = serviceInfo.apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED or
                    AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = flags or
                    AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                    AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS
            notificationTimeout = 100
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event ?: return
        if (event.packageName != "com.google.android.youtube") return

        debounceRunnable?.let { handler.removeCallbacks(it) }
        val runnable = Runnable { processEvent() }
        debounceRunnable = runnable
        handler.postDelayed(runnable, 150L)
    }

    private fun processEvent() {
        val rootNode = rootInActiveWindow
        if (rootNode == null) {
            Log.d(TAG, "processEvent: rootInActiveWindow null")
            return
        }
        val subtitle = findSubtitleText(rootNode)
        rootNode.recycle()

        if (subtitle.isNullOrBlank()) {
            Log.d(TAG, "processEvent: no subtitle node matched")
            return
        }
        if (subtitle == lastSubtitle) return
        lastSubtitle = subtitle

        Log.i(TAG, "processEvent: captured subtitle: $subtitle")
        val intent = Intent(ACTION_SUBTITLE_UPDATE).apply {
            putExtra(EXTRA_SUBTITLE_TEXT, subtitle)
        }
        LocalBroadcastManager.getInstance(this).sendBroadcast(intent)
    }

    private fun findSubtitleText(root: AccessibilityNodeInfo): String? {
        val displayHeight = resources.displayMetrics.heightPixels
        val displayWidth = resources.displayMetrics.widthPixels
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)

        while (queue.isNotEmpty()) {
            val node = queue.removeFirst()

            val viewId = node.viewIdResourceName ?: ""
            if (viewId.contains("caption", ignoreCase = true) ||
                viewId.contains("subtitle", ignoreCase = true)
            ) {
                val text = node.text?.toString()
                if (!text.isNullOrBlank()) {
                    if (node !== root) node.recycle()
                    return text
                }
            }

            if (node.className == "android.widget.TextView") {
                val text = node.text?.toString()
                if (!text.isNullOrBlank()) {
                    val bounds = Rect()
                    node.getBoundsInScreen(bounds)
                    val inLowerHalf = bounds.top > displayHeight * 0.45f
                    val wideEnough = (bounds.right - bounds.left) > displayWidth * 0.35f
                    if (inLowerHalf && wideEnough) {
                        if (node !== root) node.recycle()
                        return text
                    }
                }
            }

            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { queue.add(it) }
            }
            if (node !== root) node.recycle()
        }
        return null
    }

    override fun onInterrupt() {
        lastSubtitle = ""
    }

    override fun onDestroy() {
        isRunning = false
        debounceRunnable?.let { handler.removeCallbacks(it) }
        super.onDestroy()
    }
}
