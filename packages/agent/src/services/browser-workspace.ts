const DEFAULT_TIMEOUT_MS = 12_000;

export type BrowserWorkspaceOperation =
  | "list"
  | "open"
  | "navigate"
  | "show"
  | "hide"
  | "close"
  | "eval"
  | "snapshot";

export interface BrowserWorkspaceTab {
  id: string;
  title: string;
  url: string;
  partition: string;
  visible: boolean;
  createdAt: string;
  updatedAt: string;
  lastFocusedAt: string | null;
}

export interface BrowserWorkspaceBridgeConfig {
  baseUrl: string;
  token: string | null;
}

export interface OpenBrowserWorkspaceTabRequest {
  url?: string;
  title?: string;
  show?: boolean;
  partition?: string;
  width?: number;
  height?: number;
}

export interface NavigateBrowserWorkspaceTabRequest {
  id: string;
  url: string;
}

export interface EvaluateBrowserWorkspaceTabRequest {
  id: string;
  script: string;
}

function normalizeEnvValue(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveBrowserWorkspaceBridgeConfig(
  env: NodeJS.ProcessEnv = process.env,
): BrowserWorkspaceBridgeConfig | null {
  const baseUrl =
    normalizeEnvValue(env.MILADY_BROWSER_WORKSPACE_URL) ??
    normalizeEnvValue(env.ELIZA_BROWSER_WORKSPACE_URL);
  if (!baseUrl) return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    token:
      normalizeEnvValue(env.MILADY_BROWSER_WORKSPACE_TOKEN) ??
      normalizeEnvValue(env.ELIZA_BROWSER_WORKSPACE_TOKEN),
  };
}

export function isBrowserWorkspaceBridgeConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return resolveBrowserWorkspaceBridgeConfig(env) !== null;
}

export function getBrowserWorkspaceUnavailableMessage(): string {
  return (
    "Milady browser workspace is unavailable. This bridge only exists inside the Milady desktop shell."
  );
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    return (await response.text()).trim().slice(0, 240);
  } catch {
    return "";
  }
}

async function requestBrowserWorkspace<T>(
  path: string,
  init?: RequestInit,
  env: NodeJS.ProcessEnv = process.env,
): Promise<T> {
  const config = resolveBrowserWorkspaceBridgeConfig(env);
  if (!config) {
    throw new Error(getBrowserWorkspaceUnavailableMessage());
  }

  const headers = new Headers(init?.headers ?? {});
  headers.set("Accept", "application/json");
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  if (config.token) {
    headers.set("Authorization", `Bearer ${config.token}`);
  }

  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    const details = await readErrorBody(response);
    throw new Error(
      `Browser workspace request failed (${response.status})${details ? `: ${details}` : ""}`,
    );
  }

  return (await response.json()) as T;
}

export async function listBrowserWorkspaceTabs(
  env: NodeJS.ProcessEnv = process.env,
): Promise<BrowserWorkspaceTab[]> {
  const payload = await requestBrowserWorkspace<{ tabs?: BrowserWorkspaceTab[] }>(
    "/tabs",
    undefined,
    env,
  );
  return Array.isArray(payload.tabs) ? payload.tabs : [];
}

export async function openBrowserWorkspaceTab(
  request: OpenBrowserWorkspaceTabRequest,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BrowserWorkspaceTab> {
  const payload = await requestBrowserWorkspace<{ tab: BrowserWorkspaceTab }>(
    "/tabs",
    {
      method: "POST",
      body: JSON.stringify(request),
    },
    env,
  );
  return payload.tab;
}

export async function navigateBrowserWorkspaceTab(
  request: NavigateBrowserWorkspaceTabRequest,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BrowserWorkspaceTab> {
  const payload = await requestBrowserWorkspace<{ tab: BrowserWorkspaceTab }>(
    `/tabs/${encodeURIComponent(request.id)}/navigate`,
    {
      method: "POST",
      body: JSON.stringify({ url: request.url }),
    },
    env,
  );
  return payload.tab;
}

export async function showBrowserWorkspaceTab(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BrowserWorkspaceTab> {
  const payload = await requestBrowserWorkspace<{ tab: BrowserWorkspaceTab }>(
    `/tabs/${encodeURIComponent(id)}/show`,
    { method: "POST" },
    env,
  );
  return payload.tab;
}

export async function hideBrowserWorkspaceTab(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BrowserWorkspaceTab> {
  const payload = await requestBrowserWorkspace<{ tab: BrowserWorkspaceTab }>(
    `/tabs/${encodeURIComponent(id)}/hide`,
    { method: "POST" },
    env,
  );
  return payload.tab;
}

export async function closeBrowserWorkspaceTab(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const payload = await requestBrowserWorkspace<{ closed?: boolean }>(
    `/tabs/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    env,
  );
  return payload.closed === true;
}

export async function evaluateBrowserWorkspaceTab(
  request: EvaluateBrowserWorkspaceTabRequest,
  env: NodeJS.ProcessEnv = process.env,
): Promise<unknown> {
  const payload = await requestBrowserWorkspace<{ result: unknown }>(
    `/tabs/${encodeURIComponent(request.id)}/eval`,
    {
      method: "POST",
      body: JSON.stringify({ script: request.script }),
    },
    env,
  );
  return payload.result;
}

export async function snapshotBrowserWorkspaceTab(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ data: string }> {
  return await requestBrowserWorkspace<{ data: string }>(
    `/tabs/${encodeURIComponent(id)}/snapshot`,
    undefined,
    env,
  );
}
