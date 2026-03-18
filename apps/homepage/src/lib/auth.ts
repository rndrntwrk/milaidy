const TOKEN_KEY = "milady-cloud-token";
const ELIZA_CLOUD_BASE = "https://elizacloud.ai";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

let expiryTimer: ReturnType<typeof setTimeout> | null = null;

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  // Schedule proactive redirect before token expires (60s buffer)
  if (expiryTimer) clearTimeout(expiryTimer);
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp) {
      const delay = (payload.exp - 60) * 1000 - Date.now();
      if (delay > 0) {
        expiryTimer = setTimeout(redirectToLogin, delay);
      }
    }
  } catch {
    // Not a JWT or malformed — skip proactive expiry
  }
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (!payload.exp) return false;
    const bufferSec = 60;
    return payload.exp - bufferSec < Date.now() / 1000;
  } catch {
    return true;
  }
}

export function extractTokenFromUrl(search: string): string | null {
  const params = new URLSearchParams(search);
  return params.get("token");
}

export function redirectToLogin(): void {
  const returnTo = encodeURIComponent(window.location.href);
  window.location.href = `${ELIZA_CLOUD_BASE}/login?returnTo=${returnTo}`;
}

export async function fetchWithAuth(url: string, opts: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(opts.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    clearToken();
    redirectToLogin();
  }
  return res;
}
