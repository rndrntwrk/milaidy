import path from "node:path";
import { defineConfig } from "tsdown";

export function isBarePackageImport(id) {
  return (
    typeof id === "string" &&
    id.length > 0 &&
    !id.startsWith(".") &&
    !id.startsWith("\0") &&
    !path.isAbsolute(id)
  );
}

export default defineConfig({
  external(id) {
    return isBarePackageImport(id);
  },
});
