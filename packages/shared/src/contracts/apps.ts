/**
 * Shared app manager contracts.
 */

export type AppSessionMode = "viewer" | "spectate-and-steer" | "external";

export type AppSessionFeature =
  | "commands"
  | "telemetry"
  | "pause"
  | "resume"
  | "suggestions";

export type AppSessionControlAction = "pause" | "resume";

export type AppSessionJsonValue =
  | string
  | number
  | boolean
  | null
  | AppSessionJsonValue[]
  | { [key: string]: AppSessionJsonValue };

export interface AppViewerAuthMessage {
  type: string;
  authToken?: string;
  characterId?: string;
  sessionToken?: string;
  agentId?: string;
  followEntity?: string;
}

export interface AppViewerConfig {
  url: string;
  embedParams?: Record<string, string>;
  postMessageAuth?: boolean;
  sandbox?: string;
  authMessage?: AppViewerAuthMessage;
}

export interface AppSessionConfig {
  mode: AppSessionMode;
  features?: AppSessionFeature[];
}

export interface AppSessionState {
  sessionId: string;
  appName: string;
  mode: AppSessionMode;
  status: string;
  displayName?: string;
  agentId?: string;
  characterId?: string;
  followEntity?: string;
  canSendCommands?: boolean;
  controls?: AppSessionControlAction[];
  summary?: string | null;
  goalLabel?: string | null;
  suggestedPrompts?: string[];
  telemetry?: Record<string, AppSessionJsonValue> | null;
}

export interface AppSessionActionResult {
  success: boolean;
  message: string;
  session?: AppSessionState | null;
}

export type AppLaunchDiagnosticSeverity = "info" | "warning" | "error";

export interface AppLaunchDiagnostic {
  code: string;
  severity: AppLaunchDiagnosticSeverity;
  message: string;
}

export interface AppLaunchResult {
  pluginInstalled: boolean;
  needsRestart: boolean;
  displayName: string;
  launchType: string;
  launchUrl: string | null;
  viewer: AppViewerConfig | null;
  session: AppSessionState | null;
  diagnostics?: AppLaunchDiagnostic[];
}

export interface InstalledAppInfo {
  name: string;
  displayName: string;
  pluginName: string;
  version: string;
  installedAt: string;
}

export interface AppStopResult {
  success: boolean;
  appName: string;
  stoppedAt: string;
  pluginUninstalled: boolean;
  needsRestart: boolean;
  stopScope: "plugin-uninstalled" | "viewer-session" | "no-op";
  message: string;
}
