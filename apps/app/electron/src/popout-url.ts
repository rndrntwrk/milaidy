export function hasPopoutParam(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.searchParams.has("popout")) return true;
    const hash = parsed.hash;
    if (hash) {
      const qIdx = hash.indexOf("?");
      if (qIdx >= 0) {
        return new URLSearchParams(hash.slice(qIdx + 1)).has("popout");
      }
    }
  } catch {
    // malformed URL - fall through
  }
  return false;
}
