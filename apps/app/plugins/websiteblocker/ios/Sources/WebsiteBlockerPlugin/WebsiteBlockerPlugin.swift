import Foundation
import Capacitor
import UIKit

@objc(MiladyWebsiteBlockerPlugin)
public class MiladyWebsiteBlockerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MiladyWebsiteBlockerPlugin"
    public let jsName = "MiladyWebsiteBlocker"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startBlock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopBlock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
    ]

    private let unavailableReason =
        "This iOS build does not include the Network Extension entitlement required for system-wide website blocking yet."

    @objc func getStatus(_ call: CAPPluginCall) {
        call.resolve(buildStatus())
    }

    @objc func startBlock(_ call: CAPPluginCall) {
        call.resolve([
            "success": false,
            "error": unavailableReason,
        ])
    }

    @objc func stopBlock(_ call: CAPPluginCall) {
        call.resolve([
            "success": false,
            "error": unavailableReason,
        ])
    }

    @objc public override func checkPermissions(_ call: CAPPluginCall) {
        call.resolve(buildPermissionResult())
    }

    @objc public override func requestPermissions(_ call: CAPPluginCall) {
        call.resolve(buildPermissionResult())
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString),
               UIApplication.shared.canOpenURL(url) {
                UIApplication.shared.open(url)
                call.resolve(["opened": true])
            } else {
                call.resolve(["opened": false])
            }
        }
    }

    private func buildPermissionResult() -> [String: Any] {
        return [
            "status": "not-applicable",
            "canRequest": false,
            "reason": unavailableReason,
        ]
    }

    private func buildStatus() -> [String: Any] {
        return [
            "available": false,
            "active": false,
            "hostsFilePath": NSNull(),
            "endsAt": NSNull(),
            "websites": [],
            "canUnblockEarly": false,
            "requiresElevation": false,
            "engine": "network-extension",
            "platform": "ios",
            "supportsElevationPrompt": false,
            "elevationPromptMethod": NSNull(),
            "permissionStatus": "not-applicable",
            "canRequestPermission": false,
            "canOpenSystemSettings": true,
            "reason": unavailableReason,
        ]
    }
}
