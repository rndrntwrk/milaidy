export type ConfigRenderMode = "legacy" | "minimal";

export function configRenderModeForTheme(theme: string | null | undefined): ConfigRenderMode {
  return theme === "milady-os" ? "minimal" : "legacy";
}

export function isProStreamerTheme(theme: string | null | undefined): boolean {
  return configRenderModeForTheme(theme) === "minimal";
}
