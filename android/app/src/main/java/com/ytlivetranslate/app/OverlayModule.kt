package com.ytlivetranslate.app

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.*

class OverlayModule(private val reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "OverlayModule"

    @ReactMethod
    fun startOverlay(apiKey: String) {
        val context = reactApplicationContext
        if (!Settings.canDrawOverlays(context)) return
        val intent = Intent(context, FloatingWindowService::class.java).apply {
            putExtra(FloatingWindowService.EXTRA_DEEPL_API_KEY, apiKey)
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
}
