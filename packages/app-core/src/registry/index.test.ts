import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import * as registry from "./index";

const roots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true });
  }
});

it("skips one invalid JSON entry without losing valid entries", () => {
  const readRegistryRawEntries = (
    registry as typeof registry & {
      readRegistryRawEntries?: (
        rootDir: string,
      ) => Array<{ file: string; data: unknown }>;
    }
  ).readRegistryRawEntries;
  expect(readRegistryRawEntries).toBeTypeOf("function");
  if (!readRegistryRawEntries) return;

  const root = mkdtempSync(path.join(os.tmpdir(), "alice-registry-"));
  roots.push(root);
  for (const kind of ["apps", "plugins", "connectors"]) {
    mkdirSync(path.join(root, kind), { recursive: true });
  }
  writeFileSync(path.join(root, "apps", "valid.json"), '{"id":"valid"}');
  writeFileSync(path.join(root, "apps", "invalid.json"), "not-json");
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  expect(readRegistryRawEntries(root)).toEqual([
    {
      file: path.join(root, "apps", "valid.json"),
      data: { id: "valid" },
    },
  ]);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("invalid.json"));
  expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("not-json"));
});
