#!/usr/bin/env node

import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const tag = `v${pkg.version}`;

const manifest = {
  name: pkg.name,
  version: pkg.version,
  releaseTag: tag,
  npmTag: pkg.version.includes("-") ? "beta" : "latest",
  homepage: pkg.homepage,
  gitHubReleaseTitle: `555 Stream ${pkg.version}`,
  publishCommand: `npm publish --access public --tag ${pkg.version.includes("-") ? "beta" : "latest"}`,
  gitTagCommand: `git tag ${tag}`,
  gitPushCommand: "git push origin main --tags",
};

console.log(JSON.stringify(manifest, null, 2));
