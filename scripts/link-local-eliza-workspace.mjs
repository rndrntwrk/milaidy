#!/usr/bin/env node

import { linkUpstreamPackages } from "./setup-upstreams.mjs";

const linkedEntries = linkUpstreamPackages(process.cwd());

if (linkedEntries === 0) {
  console.log(
    "[link-local-eliza-workspace] Local eliza workspace links already current.",
  );
} else {
  console.log(
    `[link-local-eliza-workspace] Linked ${linkedEntries} local eliza workspace ${linkedEntries === 1 ? "entry" : "entries"}.`,
  );
}
