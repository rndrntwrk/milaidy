import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { portAliceOperatorBridge } from "./port-alice-operator-bridge.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("ports the Alice operator route into the official agent idempotently", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "alice-operator-port-"));
  try {
    const aliceApi = path.join(root, "packages/agent/src/api");
    const aliceEmotes = path.join(root, "packages/agent/src/emotes");
    const officialApi = path.join(root, "eliza/packages/agent/src/api");
    const officialEmotes = path.join(root, "eliza/packages/agent/src/emotes");
    await mkdir(aliceApi, { recursive: true });
    await mkdir(aliceEmotes, { recursive: true });
    await mkdir(officialApi, { recursive: true });

    await writeFile(
      path.join(aliceApi, "alice-operator-routes.ts"),
      [
        'import type { RouteRequestContext } from "./route-helpers";',
        "export const ALICE_OPERATOR_ALLOWED_ACTIONS = new Set([",
        '  "STREAM555_GO_LIVE",',
        '  "FIVE55_GAMES_CATALOG",',
        "]);",
        "export async function handleAliceOperatorRoutes() { return true; }",
        "",
      ].join("\n"),
    );
    await writeFile(
      path.join(aliceApi, "alice-emote-routes.ts"),
      'import { EMOTE_CATALOG } from "../emotes/catalog.js";\n' +
        "export async function handleAliceEmoteRoutes() { return EMOTE_CATALOG.length > 0; }\n",
    );
    await writeFile(
      path.join(aliceEmotes, "catalog.ts"),
      'export const EMOTE_CATALOG = [{ id: "dance-happy" }];\n',
    );

    const avatarImport =
      'import { handleAvatarRoutes } from "./avatar-routes.ts";\n';
    const avatarDispatch = `  // ── Avatar routes (extracted to avatar-routes.ts) ───────────────────\n  if (\n    await handleAvatarRoutes({\n      req,\n      res,\n      method,\n      pathname,\n      json,\n      error,\n    })\n  ) {\n    return;\n  }\n`;
    await writeFile(
      path.join(officialApi, "server.ts"),
      `${avatarImport}\nasync function route() {\n${avatarDispatch}}\n`,
    );

    await portAliceOperatorBridge(root);
    const firstRoute = await readFile(
      path.join(officialApi, "alice-operator-routes.ts"),
      "utf8",
    );
    const firstServer = await readFile(path.join(officialApi, "server.ts"), "utf8");

    assert.match(firstRoute, /from "\.\/route-helpers\.ts"/);
    assert.match(firstRoute, /"STREAM555_BOOTSTRAP_SESSION"/);
    assert.match(firstRoute, /"STREAM555_AD_LIST"/);
    assert.match(firstRoute, /"STREAM555_ADS_STATUS"/);
    assert.match(firstServer, /handleAliceEmoteRoutes/);
    assert.match(
      await readFile(path.join(officialApi, "alice-emote-routes.ts"), "utf8"),
      /\.\.\/emotes\/catalog\.ts/,
    );
    assert.match(
      await readFile(path.join(officialEmotes, "catalog.ts"), "utf8"),
      /dance-happy/,
    );
    assert.match(firstRoute, /"STREAM555_GO_LIVE"/);
    assert.match(firstRoute, /"FIVE55_GAMES_CATALOG"/);
    assert.equal((firstServer.match(/handleAliceOperatorRoutes/g) ?? []).length, 2);
    assert.match(firstServer, /runtime: state\.runtime/);

    await portAliceOperatorBridge(root);
    assert.equal(
      await readFile(path.join(officialApi, "alice-operator-routes.ts"), "utf8"),
      firstRoute,
    );
    assert.equal(await readFile(path.join(officialApi, "server.ts"), "utf8"), firstServer);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ports into the exact pinned official Eliza server shape", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "alice-operator-pinned-eliza-"));
  try {
    const aliceApi = path.join(root, "packages/agent/src/api");
    const aliceEmotes = path.join(root, "packages/agent/src/emotes");
    const officialApi = path.join(root, "eliza/packages/agent/src/api");
    await mkdir(aliceApi, { recursive: true });
    await mkdir(aliceEmotes, { recursive: true });
    await mkdir(officialApi, { recursive: true });
    await Promise.all([
      readFile(path.join(repoRoot, "packages/agent/src/api/alice-operator-routes.ts")).then(
        (contents) => writeFile(path.join(aliceApi, "alice-operator-routes.ts"), contents),
      ),
      readFile(path.join(repoRoot, "eliza/packages/agent/src/api/server.ts")).then(
        (contents) => writeFile(path.join(officialApi, "server.ts"), contents),
      ),
      readFile(path.join(repoRoot, "packages/agent/src/api/alice-emote-routes.ts")).then(
        (contents) => writeFile(path.join(aliceApi, "alice-emote-routes.ts"), contents),
      ),
      readFile(path.join(repoRoot, "packages/agent/src/emotes/catalog.ts")).then(
        (contents) => writeFile(path.join(aliceEmotes, "catalog.ts"), contents),
      ),
    ]);

    await portAliceOperatorBridge(root);
    const server = await readFile(path.join(officialApi, "server.ts"), "utf8");
    assert.equal((server.match(/handleAliceOperatorRoutes/g) ?? []).length, 2);
    assert.match(server, /runtime: state\.runtime/);
    const route = await readFile(
      path.join(officialApi, "alice-operator-routes.ts"),
      "utf8",
    );
    assert.match(route, /"STREAM555_AD_LIST"/);
    assert.match(route, /"STREAM555_ADS_STATUS"/);
    assert.match(server, /handleAliceEmoteRoutes/);
    assert.match(
      await readFile(path.join(root, "eliza/packages/agent/src/api/alice-emote-routes.ts"), "utf8"),
      /broadcastEvent/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
