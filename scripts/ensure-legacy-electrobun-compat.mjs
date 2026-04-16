#!/usr/bin/env node

import { ensureLegacyElectrobunCompatDir } from "./run-release-contract-suite.mjs";

const created = ensureLegacyElectrobunCompatDir();
const status = created ? "created" : "skipped";
console.log(
  `[ensure-legacy-electrobun-compat] ${status} apps/app/electrobun compatibility directory`,
);
