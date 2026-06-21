// Runtime entry point. Reads JSON entries from data/, validates, caches, and
// exposes typed accessors. The single import path the rest of the codebase
// uses to consume the registry.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type LoadedRegistry, loadRegistryFromRawEntries } from "./loader";

export {
  entriesToLegacyManifest,
  entryToLegacyManifestEntry,
  type LegacyManifest,
  type LegacyManifestEntry,
  type LegacyManifestParameter,
} from "./legacy-adapter";
export {
  getApps,
  getConnectors,
  getEntry,
  getEntryByNpmName,
  getPlugins,
  indexEntries,
  type LoadedRegistry,
  mergeWithRuntime,
  type RegistryValidationError,
} from "./loader";
export * from "./schema";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const entriesDir = join(moduleDir, "entries");

let cache: LoadedRegistry | null = null;

export function loadRegistry(): LoadedRegistry {
  if (cache) return cache;

  const raws: { file: string; data: unknown }[] = [];
  for (const kind of ["apps", "plugins", "connectors"] as const) {
    const kindDir = join(entriesDir, kind);
    let entries: string[];
    try {
      entries = readdirSync(kindDir);
    } catch {
      // In packaged desktop builds the registry entries may not be bundled.
      // Log and continue rather than crashing the agent subprocess.
      console.warn(`[registry] ${kind} directory missing: ${kindDir}`);
      continue;
    }
    for (const filename of entries) {
      if (!filename.endsWith(".json")) continue;
      const file = join(kindDir, filename);
      // A single malformed/binary entry must not crash the entire agent boot
      // (loadRegistry runs early, inside vault-bootstrap). Skip and warn so the
      // runtime comes up; the bad entry just isn't registered.
      let raw: string;
      try {
        raw = readFileSync(file, "utf-8");
      } catch (err) {
        console.warn(
          `[registry] skipping unreadable entry ${file}: ${err instanceof Error ? err.message : String(err)}`,
        );
        continue;
      }
      try {
        raws.push({ file, data: JSON.parse(raw) });
      } catch (err) {
        console.warn(
          `[registry] skipping invalid JSON entry ${file} (${raw.length} bytes, starts ${JSON.stringify(raw.slice(0, 16))}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  cache = loadRegistryFromRawEntries(raws);
  return cache;
}

export function clearRegistryCacheForTests(): void {
  cache = null;
}
