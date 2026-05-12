import { readFileSync } from "node:fs";
import path from "node:path";

export function readPackageJson(packageDir) {
  try {
    return JSON.parse(
      readFileSync(path.join(packageDir, "package.json"), "utf8"),
    );
  } catch {
    return null;
  }
}
