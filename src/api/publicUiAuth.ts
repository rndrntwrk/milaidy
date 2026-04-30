export function isPublicUiRequest(method: string, pathname: string): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  if (pathname === "/api" || pathname.startsWith("/api/")) return false;
  if (pathname === "/ws") return false;
  return true;
}
