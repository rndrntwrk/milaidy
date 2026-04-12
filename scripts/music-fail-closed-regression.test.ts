import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const musicEntityDetectionSource = readFileSync(
  path.resolve(
    import.meta.dirname,
    "..",
    "packages",
    "plugin-music-library",
    "src",
    "services",
    "musicEntityDetectionService.ts",
  ),
  "utf-8",
);
const musicInfoServiceSource = readFileSync(
  path.resolve(
    import.meta.dirname,
    "..",
    "packages",
    "plugin-music-library",
    "src",
    "services",
    "musicInfoService.ts",
  ),
  "utf-8",
);
const musicInfoProviderSource = readFileSync(
  path.resolve(
    import.meta.dirname,
    "..",
    "packages",
    "plugin-music-library",
    "src",
    "providers",
    "musicInfoProvider.ts",
  ),
  "utf-8",
);
const storageContextSource = readFileSync(
  path.resolve(
    import.meta.dirname,
    "..",
    "packages",
    "plugin-music-library",
    "src",
    "components",
    "storageContext.ts",
  ),
  "utf-8",
);
const roomScopedComponentSources = [
  "preferences.ts",
  "analytics.ts",
  "djGuildSettings.ts",
  "djIntroOptions.ts",
].map((fileName) =>
  readFileSync(
    path.resolve(
      import.meta.dirname,
      "..",
      "packages",
      "plugin-music-library",
      "src",
      "components",
      fileName,
    ),
    "utf-8",
  ),
);
const agentStorageComponentSources = ["djTips.ts", "songMemory.ts"].map(
  (fileName) =>
    readFileSync(
      path.resolve(
        import.meta.dirname,
        "..",
        "packages",
        "plugin-music-library",
        "src",
        "components",
        fileName,
      ),
      "utf-8",
    ),
);
const queueSource = readFileSync(
  path.resolve(
    import.meta.dirname,
    "..",
    "packages",
    "plugin-music-player",
    "src",
    "queue.ts",
  ),
  "utf-8",
);
const streamFallbackSource = readFileSync(
  path.resolve(
    import.meta.dirname,
    "..",
    "packages",
    "plugin-music-player",
    "src",
    "utils",
    "streamFallback.ts",
  ),
  "utf-8",
);

describe("music fail-closed regressions", () => {
  it("does not fall back to heuristic entity parsing", () => {
    expect(musicEntityDetectionSource).not.toContain("fallbackDetection(");
    expect(musicEntityDetectionSource).toContain(
      "Failed to parse music entity detection response",
    );
    expect(musicEntityDetectionSource).toContain("throw error;");
  });

  it("does not use metadata fallback chains", () => {
    expect(musicInfoServiceSource).not.toContain("getInfoFromTitle(");
    expect(musicInfoServiceSource).not.toContain("source: 'manual'");
    expect(musicInfoServiceSource).not.toContain("source: 'wikipedia'");
    expect(musicInfoServiceSource).not.toContain("source: 'lastfm'");
    expect(musicInfoServiceSource).toMatch(/source:\s*["']musicbrainz["']/);
  });

  it("does not recover provider execution with URL or pattern fallback parsing", () => {
    expect(musicInfoProviderSource).not.toContain(
      "No entities found, trying YouTube URL detection",
    );
    expect(musicInfoProviderSource).not.toContain("trying pattern matching");
    expect(musicInfoProviderSource).toContain(
      "MusicEntityDetectionService is required for MUSIC_INFO provider",
    );
  });

  it("requires real room contexts for room-scoped components", () => {
    for (const source of roomScopedComponentSources) {
      expect(source).toContain("requireRoomContext");
      expect(source).not.toContain("using agent ID as fallback");
      expect(source).not.toContain("Fallback Room");
      expect(source).not.toContain("Fallback World");
    }
  });

  it("uses explicit agent storage scopes instead of synthetic fallback rooms", () => {
    expect(storageContextSource).toContain("ensureAgentStorageContext");
    for (const source of agentStorageComponentSources) {
      expect(source).toContain("ensureAgentStorageContext");
      expect(source).not.toContain("fallbackRoomId");
      expect(source).not.toContain("Fallback Room");
    }
  });

  it("uses a single canonical playback extractor with no alternative-track retry", () => {
    expect(streamFallbackSource).not.toContain("createYtdlCoreStream");
    expect(streamFallbackSource).not.toContain("play.stream(");
    expect(streamFallbackSource).toMatch(/source:\s*["']yt-dlp["']/);
    expect(queueSource).not.toContain("track:age-restricted");
    expect(queueSource).not.toContain("alternative version");
    expect(queueSource).not.toContain("selectBestAlternativeTrack");
  });
});
