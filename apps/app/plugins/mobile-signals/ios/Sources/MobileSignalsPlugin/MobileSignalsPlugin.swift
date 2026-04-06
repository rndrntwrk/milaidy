import Foundation
import Capacitor
import UIKit

@objc(MobileSignalsPlugin)
public class MobileSignalsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MobileSignalsPlugin"
    public let jsName = "MobileSignals"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startMonitoring", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopMonitoring", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSnapshot", returnType: CAPPluginReturnPromise),
    ]

    private var monitoring = false
    private var observers: [NSObjectProtocol] = []

    public override func load() {
        UIDevice.current.isBatteryMonitoringEnabled = true
    }

    deinit {
        stopInternal()
        UIDevice.current.isBatteryMonitoringEnabled = false
    }

    @objc func startMonitoring(_ call: CAPPluginCall) {
        if monitoring {
            call.resolve(buildStartResult())
            return
        }

        monitoring = true
        registerObservers()
        call.resolve(buildStartResult())

        if call.getBool("emitInitial") ?? true {
            emitSignal(reason: "start")
        }
    }

    @objc func stopMonitoring(_ call: CAPPluginCall) {
        stopInternal()
        call.resolve(["stopped": true])
    }

    @objc func getSnapshot(_ call: CAPPluginCall) {
        call.resolve(buildSnapshot(reason: "snapshot"))
    }

    private func registerObservers() {
        let center = NotificationCenter.default
        let names: [Notification.Name] = [
            UIApplication.didBecomeActiveNotification,
            UIApplication.willResignActiveNotification,
            UIApplication.didEnterBackgroundNotification,
            UIApplication.willEnterForegroundNotification,
            UIApplication.protectedDataDidBecomeAvailableNotification,
            UIApplication.protectedDataWillBecomeUnavailableNotification,
            ProcessInfo.powerStateDidChangeNotification,
            UIDevice.batteryStateDidChangeNotification,
        ]

        for name in names {
            let observer = center.addObserver(
                forName: name,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.emitSignal(reason: name.rawValue)
            }
            observers.append(observer)
        }
    }

    private func stopInternal() {
        let center = NotificationCenter.default
        for observer in observers {
            center.removeObserver(observer)
        }
        observers.removeAll()
        monitoring = false
    }

    private func buildStartResult() -> [String: Any] {
        [
            "enabled": monitoring,
            "supported": true,
            "platform": "ios",
            "snapshot": buildSnapshot(reason: "start"),
        ]
    }

    private func buildSnapshot(reason: String) -> [String: Any] {
        let app = UIApplication.shared
        let protectedAvailable = app.isProtectedDataAvailable
        let lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled
        let batteryState = UIDevice.current.batteryState
        let batteryLevel = UIDevice.current.batteryLevel
        let onBattery: Bool? = {
            switch batteryState {
            case .charging, .full:
                return false
            case .unplugged:
                return true
            case .unknown:
                return nil
            @unknown default:
                return nil
            }
        }()
        let state: String = {
            if !protectedAvailable {
                return "locked"
            }
            switch app.applicationState {
            case .active:
                return lowPower ? "idle" : "active"
            case .inactive:
                return "idle"
            case .background:
                return "background"
            @unknown default:
                return "background"
            }
        }()
        let idleState: String = {
            if !protectedAvailable {
                return "locked"
            }
            if lowPower {
                return "idle"
            }
            return state == "active" ? "active" : "idle"
        }()
        let level = batteryLevel >= 0 ? Double(batteryLevel) : nil
        let onBatteryValue: Any = onBattery ?? NSNull()
        let levelValue: Any = level ?? NSNull()

        return [
            "source": "mobile_device",
            "platform": "ios",
            "state": state,
            "observedAt": Int64(Date().timeIntervalSince1970 * 1000),
            "idleState": idleState,
            "idleTimeSeconds": NSNull(),
            "onBattery": onBatteryValue,
            "metadata": [
                "reason": reason,
                "applicationState": app.applicationState.rawValue,
                "isProtectedDataAvailable": protectedAvailable,
                "isLowPowerModeEnabled": lowPower,
                "batteryState": batteryState.rawValue,
                "batteryLevel": levelValue,
            ],
        ]
    }

    private func emitSignal(reason: String) {
        guard monitoring else { return }
        notifyListeners("signal", data: buildSnapshot(reason: reason))
    }
}
