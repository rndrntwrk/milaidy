package ai.milady.plugins.mobilesignals

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.util.Log
import android.app.KeyguardManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "MobileSignals")
class MobileSignalsPlugin : Plugin() {
    private val tag = "MobileSignalsPlugin"
    private var monitoring = false
    private var receiver: BroadcastReceiver? = null

    @PluginMethod
    fun startMonitoring(call: PluginCall) {
        if (monitoring) {
            call.resolve(buildStartResult())
            return
        }

        receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                val action = intent.action ?: return
                if (!monitoring) return
                emitSignal("broadcast:$action")
            }
        }

        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_USER_PRESENT)
            addAction(Intent.ACTION_BATTERY_CHANGED)
            addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                addAction(PowerManager.ACTION_DEVICE_IDLE_MODE_CHANGED)
            }
        }

        try {
            context.registerReceiver(receiver, filter)
            monitoring = true
            val result = buildStartResult()
            call.resolve(result)
            val emitInitial = call.getBoolean("emitInitial") ?: true
            if (emitInitial) {
                emitSignal("start")
            }
        } catch (error: Throwable) {
            Log.e(tag, "Failed to start monitoring", error)
            call.reject("Failed to start monitoring: ${error.message}")
        }
    }

    @PluginMethod
    fun stopMonitoring(call: PluginCall) {
        stopInternal()
        call.resolve(JSObject().apply {
            put("stopped", true)
        })
    }

    @PluginMethod
    fun getSnapshot(call: PluginCall) {
        call.resolve(buildSnapshot("snapshot"))
    }

    private fun stopInternal() {
        if (receiver != null) {
            try {
                context.unregisterReceiver(receiver)
            } catch (_: Throwable) {
                // best-effort cleanup
            }
        }
        receiver = null
        monitoring = false
    }

    private fun buildStartResult(): JSObject {
        val snapshot = buildSnapshot("start")
        return JSObject().apply {
            put("enabled", monitoring)
            put("supported", true)
            put("platform", "android")
            put("snapshot", snapshot)
        }
    }

    private fun buildSnapshot(reason: String): JSObject {
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val keyguardManager = context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        val battery = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))

        val interactive = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT_WATCH) {
            powerManager.isInteractive
        } else {
            @Suppress("DEPRECATION")
            powerManager.isScreenOn
        }
        val locked = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            keyguardManager.isDeviceLocked
        } else {
            @Suppress("DEPRECATION")
            keyguardManager.isKeyguardLocked
        }
        val powerSaveMode = powerManager.isPowerSaveMode
        val deviceIdle = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            powerManager.isDeviceIdleMode
        } else {
            false
        }
        val state = when {
            locked -> "locked"
            !interactive -> "background"
            powerSaveMode || deviceIdle -> "idle"
            else -> "active"
        }
        val idleState = when {
            locked -> "locked"
            !interactive || powerSaveMode || deviceIdle -> "idle"
            else -> "active"
        }
        val batteryLevel = battery?.let {
            val level = it.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = it.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
            if (level >= 0 && scale > 0) {
                level.toDouble() / scale.toDouble()
            } else {
                null
            }
        }
        val plugged = battery?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0
        val isCharging = battery?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) in setOf(
            BatteryManager.BATTERY_STATUS_CHARGING,
            BatteryManager.BATTERY_STATUS_FULL,
        )

        return JSObject().apply {
            put("source", "mobile_device")
            put("platform", "android")
            put("state", state)
            put("observedAt", System.currentTimeMillis())
            put("idleState", idleState)
            put("idleTimeSeconds", null)
            put("onBattery", plugged == 0)
            put("metadata", JSObject().apply {
                put("reason", reason)
                put("isInteractive", interactive)
                put("isDeviceLocked", locked)
                put("isPowerSaveMode", powerSaveMode)
                put("isDeviceIdleMode", deviceIdle)
                put("isCharging", isCharging)
                put("batteryLevel", batteryLevel)
            })
        }
    }

    private fun emitSignal(reason: String) {
        if (!monitoring) return
        notifyListeners("signal", buildSnapshot(reason))
    }

    override fun handleOnDestroy() {
        stopInternal()
        super.handleOnDestroy()
    }
}
