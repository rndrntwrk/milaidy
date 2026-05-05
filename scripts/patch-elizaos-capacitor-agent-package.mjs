#!/usr/bin/env node

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isLocalElizaDisabled } from "./lib/eliza-package-mode.mjs";

const LOG_PREFIX = "[patch-elizaos-capacitor-agent-package]";
const require = createRequire(import.meta.url);
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function writeFileIfChanged(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (
    fs.existsSync(filePath) &&
    fs.readFileSync(filePath, "utf8") === content
  ) {
    return false;
  }
  fs.writeFileSync(filePath, content, "utf8");
  return true;
}

function resolvePackageRoot() {
  try {
    return path.dirname(
      require.resolve("@elizaos/capacitor-agent/package.json", {
        paths: [repoRoot],
      }),
    );
  } catch {
    return null;
  }
}

const androidBuildGradle = `ext {
    junitVersion = project.hasProperty('junitVersion') ? rootProject.ext.junitVersion : '4.13.2'
    androidxAppCompatVersion = project.hasProperty('androidxAppCompatVersion') ? rootProject.ext.androidxAppCompatVersion : '1.6.1'
}

apply plugin: 'com.android.library'

android {
    namespace = "ai.eliza.plugins.agent"
    compileSdk project.hasProperty('compileSdkVersion') ? rootProject.ext.compileSdkVersion : 34

    defaultConfig {
        minSdk project.hasProperty('minSdkVersion') ? rootProject.ext.minSdkVersion : 22
        targetSdk project.hasProperty('targetSdkVersion') ? rootProject.ext.targetSdkVersion : 34
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
}

repositories {
    google()
    mavenCentral()
}

dependencies {
    implementation project(':capacitor-android')
}
`;

const androidManifest = `<manifest xmlns:android="http://schemas.android.com/apk/res/android" />
`;

const androidPlugin = `package ai.eliza.plugins.agent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

@CapacitorPlugin(name = "Agent")
public class AgentPlugin extends Plugin {
    @PluginMethod
    public void start(PluginCall call) {
        call.resolve(status("stopped"));
    }

    @PluginMethod
    public void stop(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ok", true);
        call.resolve(result);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(status("stopped"));
    }

    @PluginMethod
    public void chat(PluginCall call) {
        JSObject result = new JSObject();
        result.put("text", "Agent API not available");
        result.put("agentName", "System");
        call.resolve(result);
    }

    @PluginMethod
    public void getLocalAgentToken(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", false);
        result.put("token", JSONObject.NULL);
        call.resolve(result);
    }

    @PluginMethod
    public void request(PluginCall call) {
        call.reject("Agent.request is unavailable in this package build");
    }

    private JSObject status(String state) {
        JSObject result = new JSObject();
        result.put("state", state);
        result.put("agentName", JSONObject.NULL);
        result.put("port", JSONObject.NULL);
        result.put("startedAt", JSONObject.NULL);
        result.put("error", JSONObject.NULL);
        return result;
    }
}
`;

const podspec = `require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'ElizaosCapacitorAgent'
  s.version = package['version']
  s.summary = package['description']
  s.license = package['license'] || { :type => 'MIT' }
  s.homepage = 'https://elizaos.ai'
  s.authors = { 'elizaOS' => 'dev@elizaos.ai' }
  s.source = { :git => 'https://github.com/elizaOS/eliza.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m}'
  s.ios.deployment_target = '13.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.1'
end
`;

const swiftPlugin = `import Capacitor

@objc(AgentPlugin)
public class AgentPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AgentPlugin"
    public let jsName = "Agent"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "chat", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLocalAgentToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
    ]

    @objc func start(_ call: CAPPluginCall) {
        call.resolve(status("stopped"))
    }

    @objc func stop(_ call: CAPPluginCall) {
        call.resolve(["ok": true])
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        call.resolve(status("stopped"))
    }

    @objc func chat(_ call: CAPPluginCall) {
        call.resolve(["text": "Agent API not available", "agentName": "System"])
    }

    @objc func getLocalAgentToken(_ call: CAPPluginCall) {
        call.resolve(["available": false, "token": NSNull()])
    }

    @objc func request(_ call: CAPPluginCall) {
        call.reject("Agent.request is unavailable in this package build")
    }

    private func status(_ state: String) -> [String: Any] {
        [
            "state": state,
            "agentName": NSNull(),
            "port": NSNull(),
            "startedAt": NSNull(),
            "error": NSNull(),
        ]
    }
}
`;

if (!isLocalElizaDisabled()) {
  console.log(
    `${LOG_PREFIX} local elizaOS source mode; skipping package patch.`,
  );
  process.exit(0);
}

const packageRoot = resolvePackageRoot();
if (!packageRoot) {
  console.warn(
    `${LOG_PREFIX} @elizaos/capacitor-agent is not installed; skipping.`,
  );
  process.exit(0);
}

let changed = 0;
for (const [relativePath, content] of [
  ["android/build.gradle", androidBuildGradle],
  ["android/src/main/AndroidManifest.xml", androidManifest],
  [
    "android/src/main/java/ai/eliza/plugins/agent/AgentPlugin.java",
    androidPlugin,
  ],
  ["ElizaosCapacitorAgent.podspec", podspec],
  ["ios/Sources/AgentPlugin/AgentPlugin.swift", swiftPlugin],
]) {
  if (writeFileIfChanged(path.join(packageRoot, relativePath), content)) {
    changed += 1;
  }
}

if (changed === 0) {
  console.log(`${LOG_PREFIX} package already has native stubs.`);
} else {
  console.log(`${LOG_PREFIX} wrote ${changed} missing native stub file(s).`);
}
