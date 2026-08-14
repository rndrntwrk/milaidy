import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ALICE_ROUTE = "packages/agent/src/api/alice-operator-routes.ts";
const ALICE_EMOTE_ROUTE = "packages/agent/src/api/alice-emote-routes.ts";
const ALICE_EMOTE_CATALOG = "packages/agent/src/emotes/catalog.ts";
const OFFICIAL_ROUTE = "eliza/packages/agent/src/api/alice-operator-routes.ts";
const OFFICIAL_EMOTE_ROUTE = "eliza/packages/agent/src/api/alice-emote-routes.ts";
const OFFICIAL_EMOTE_CATALOG = "eliza/packages/agent/src/emotes/catalog.ts";
const OFFICIAL_SERVER = "eliza/packages/agent/src/api/server.ts";

const ROUTE_HELPER_IMPORT = 'from "./route-helpers";';
const OFFICIAL_ROUTE_HELPER_IMPORT = 'from "./route-helpers.ts";';
const ALLOWLIST_ANCHOR =
  "export const ALICE_OPERATOR_ALLOWED_ACTIONS = new Set([\n";
const REQUIRED_OPERATOR_ACTIONS = [
  '  "STREAM555_BOOTSTRAP_SESSION",\n',
  '  "STREAM555_AD_LIST",\n',
  '  "STREAM555_ADS_STATUS",\n',
];
const OPERATOR_IMPORT =
  'import { handleAliceOperatorRoutes } from "./alice-operator-routes.ts";\n';
const EMOTE_IMPORT =
  'import { handleAliceEmoteRoutes } from "./alice-emote-routes.ts";\n';
const STANDALONE_AVATAR_IMPORT =
  'import { handleAvatarRoutes } from "./avatar-routes.ts";\n';
const LAZY_ROUTES_IMPORT_END = '} from "./server-lazy-routes.ts";\n';
const AVATAR_DISPATCH = `  if (
    await handleAvatarRoutes({
      req,
      res,
      method,
      pathname,
      json,
      error,
    })
  ) {
    return;
  }
`;
const OPERATOR_DISPATCH = `
  // Alice's production-only deterministic bridge for approved product actions.
  if (
    await handleAliceOperatorRoutes({
      req,
      res,
      method,
      pathname,
      json,
      error,
      readJsonBody,
      runtime: state.runtime,
    })
  ) {
    return;
  }
`;
const EMOTE_DISPATCH = `
  // Alice's VRM route must survive compilation through the official server.
  if (
    await handleAliceEmoteRoutes({
      req,
      res,
      method,
      pathname,
      json,
      error,
      readJsonBody,
      runtime: state.runtime,
      broadcastWs: state.broadcastWs,
    })
  ) {
    return;
  }
`;

function requireExactlyOnce(contents, anchor, label) {
  const first = contents.indexOf(anchor);
  if (first < 0 || contents.indexOf(anchor, first + anchor.length) >= 0) {
    throw new Error(`${label} must occur exactly once`);
  }
  return first;
}

function insertAfter(contents, anchor, addition, label) {
  const index = requireExactlyOnce(contents, anchor, label);
  return `${contents.slice(0, index + anchor.length)}${addition}${contents.slice(index + anchor.length)}`;
}

export async function portAliceOperatorBridge(root = process.cwd()) {
  const aliceRoutePath = path.join(root, ALICE_ROUTE);
  const aliceEmoteRoutePath = path.join(root, ALICE_EMOTE_ROUTE);
  const aliceEmoteCatalogPath = path.join(root, ALICE_EMOTE_CATALOG);
  const officialRoutePath = path.join(root, OFFICIAL_ROUTE);
  const officialEmoteRoutePath = path.join(root, OFFICIAL_EMOTE_ROUTE);
  const officialEmoteCatalogPath = path.join(root, OFFICIAL_EMOTE_CATALOG);
  const officialServerPath = path.join(root, OFFICIAL_SERVER);

  await Promise.all([
    access(aliceRoutePath),
    access(aliceEmoteRoutePath),
    access(aliceEmoteCatalogPath),
    access(path.dirname(officialRoutePath)),
    access(officialServerPath),
  ]);

  let route = await readFile(aliceRoutePath, "utf8");
  requireExactlyOnce(route, ROUTE_HELPER_IMPORT, "Alice route helper import");
  requireExactlyOnce(route, ALLOWLIST_ANCHOR, "Alice operator allowlist");
  requireExactlyOnce(
    route,
    "export async function handleAliceOperatorRoutes(",
    "Alice operator handler",
  );
  route = route.replace(ROUTE_HELPER_IMPORT, OFFICIAL_ROUTE_HELPER_IMPORT);
  for (const requiredAction of REQUIRED_OPERATOR_ACTIONS) {
    if (!route.includes(requiredAction)) {
      route = insertAfter(
        route,
        ALLOWLIST_ANCHOR,
        requiredAction,
        "Alice operator allowlist",
      );
    }
  }

  let emoteRoute = await readFile(aliceEmoteRoutePath, "utf8");
  requireExactlyOnce(
    emoteRoute,
    'from "../emotes/catalog.js";',
    "Alice emote catalog import",
  );
  requireExactlyOnce(
    emoteRoute,
    "export async function handleAliceEmoteRoutes(",
    "Alice emote route handler",
  );
  emoteRoute = emoteRoute.replace(
    'from "../emotes/catalog.js";',
    'from "../emotes/catalog.ts";',
  );
  const emoteCatalog = await readFile(aliceEmoteCatalogPath, "utf8");
  requireExactlyOnce(
    emoteCatalog,
    "export const EMOTE_CATALOG",
    "Alice emote catalog",
  );

  let server = await readFile(officialServerPath, "utf8");
  if (!server.includes(OPERATOR_IMPORT)) {
    if (server.includes(STANDALONE_AVATAR_IMPORT)) {
      server = insertAfter(server, STANDALONE_AVATAR_IMPORT, OPERATOR_IMPORT, "official avatar route import");
    } else {
      const handlersEnd = server.indexOf(LAZY_ROUTES_IMPORT_END);
      const handlersStart = server.lastIndexOf("import {", handlersEnd);
      const handlerBlock =
        handlersStart >= 0 && handlersEnd >= handlersStart
          ? server.slice(handlersStart, handlersEnd + LAZY_ROUTES_IMPORT_END.length)
          : "";
      if (!handlerBlock.includes("handleAvatarRoutes,")) {
        throw new Error("official route-handlers import must include handleAvatarRoutes");
      }
      server = insertAfter(server, LAZY_ROUTES_IMPORT_END, OPERATOR_IMPORT, "official lazy-routes import");
    }
  }
  if (!server.includes(OPERATOR_DISPATCH)) {
    server = insertAfter(server, AVATAR_DISPATCH, OPERATOR_DISPATCH, "official avatar route dispatch");
  }
  if (!server.includes(EMOTE_IMPORT)) {
    server = insertAfter(server, OPERATOR_IMPORT, EMOTE_IMPORT, "Alice operator route import");
  }
  if (!server.includes(EMOTE_DISPATCH)) {
    server = insertAfter(server, OPERATOR_DISPATCH, EMOTE_DISPATCH, "Alice operator route dispatch");
  }

  requireExactlyOnce(server, OPERATOR_IMPORT, "Alice operator server import");
  requireExactlyOnce(server, OPERATOR_DISPATCH, "Alice operator server dispatch");
  requireExactlyOnce(server, EMOTE_IMPORT, "Alice emote server import");
  requireExactlyOnce(server, EMOTE_DISPATCH, "Alice emote server dispatch");
  await mkdir(path.dirname(officialEmoteCatalogPath), { recursive: true });
  await writeFile(officialRoutePath, route);
  await writeFile(officialEmoteRoutePath, emoteRoute);
  await writeFile(officialEmoteCatalogPath, emoteCatalog);
  await writeFile(officialServerPath, server);
  process.stdout.write(
    "Ported Alice operator and VRM routes into official Eliza agent.\n",
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  await portAliceOperatorBridge();
}
