/**
 * Match an asset filename to a platform ID.
 * Mirrors the logic in the build script.
 */
export function matchAsset(name: string): string | null {
  const n = name.toLowerCase();
  if (/macos.*arm64.*\.dmg$/.test(n)) return "macos-arm64";
  if (/macos.*x64.*\.dmg$/.test(n)) return "macos-x64";
  if (/setup.*\.exe$/.test(n) || /win.*\.exe$/.test(n)) return "windows-x64";
  if (/win.*setup.*\.zip$/.test(n)) return "windows-x64";
  if (/linux.*\.deb$/.test(n)) return "linux-deb";
  if (/linux.*\.appimage$/.test(n)) return "linux-x64";
  if (/linux.*\.tar\.gz$/.test(n)) return "linux-x64";
  return null;
}
