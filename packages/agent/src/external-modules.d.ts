declare module "@elizaos/plugin-coding-agent";
declare module "@elizaos/plugin-agent-orchestrator";
declare module "@elizaos/plugin-agent-skills";
declare module "@elizaos/plugin-elizacloud";
declare module "@elizaos/plugin-pi-ai";
declare module "@elizaos/plugin-commands";
declare module "@elizaos/plugin-secrets-manager";
declare module "@elizaos/signal-native";
declare module "qrcode";

// CI does `bun install --ignore-scripts`, which skips the repo's
// setup-upstreams step. That leaves the repo-local @elizaos/plugin-*
// submodules unlinked in node_modules, and tsc can't resolve the
// static imports in runtime/eliza.ts. Declaring them here as `any`
// keeps tsc happy on both CI and local (setup-upstreams won) state.
declare module "@elizaos/plugin-cron";
declare module "@elizaos/plugin-edge-tts";
declare module "@elizaos/plugin-edge-tts/node";
declare module "@elizaos/plugin-experience";
declare module "@elizaos/plugin-local-embedding";
declare module "@elizaos/plugin-ollama";
declare module "@elizaos/plugin-openai";
declare module "@elizaos/plugin-personality";
declare module "@elizaos/plugin-shell";
declare module "@elizaos/plugin-trust";

// `@elizaos/core/roles` is a subpath that the local `./eliza/`
// checkout exposes via the `@elizaos/core/*` paths mapping, but the
// published `@elizaos/core@alpha` dist-tag does not currently ship a
// `/roles` subpath export — only the three functions in `dist/roles.d.ts`
// (`ServerOwnershipState`, `getUserServerRole`, `findWorldsForOwner`)
// exist and none of them are re-exported via the package.json `exports`
// field. On CI with `submodules: false` + `--ignore-scripts` (see
// `ci.yml`), `./eliza/` is absent, so tsc falls through to this ambient
// declaration. Every named import the agent and shared packages make
// from the subpath is listed here as a permissive shape so both CI
// (no real module) and local (this ambient shadows the real one for
// type-resolution purposes) build cleanly. When the upstream
// `@elizaos/core` publishes the full `/roles` subpath, this block can
// be deleted and the paths map will take over again.
declare module "@elizaos/core/roles" {
  export type RoleName = "OWNER" | "ADMIN" | "USER" | "GUEST";
  export type RoleGrantSource = "owner" | "manual" | "connector_admin";
  export const ROLE_RANK: Record<RoleName, number>;

  // Minimal shapes that preserve the fields consumer code actually
  // reads — anything else is `unknown`-compatible via index signature.
  export interface RolesWorldMetadata {
    roles?: Record<string, RoleName>;
    roleSources?: Record<string, RoleGrantSource>;
    // biome-ignore lint/suspicious/noExplicitAny: structural any shim for a divergent upstream module
    [key: string]: any;
  }
  export type ConnectorAdminWhitelist = Record<string, string[]>;
  export interface RolesConfig {
    connectorAdmins?: ConnectorAdminWhitelist;
    // biome-ignore lint/suspicious/noExplicitAny: structural any shim for a divergent upstream module
    [key: string]: any;
  }
  export interface RoleCheckResult {
    role?: RoleName;
    source?: RoleGrantSource;
    // biome-ignore lint/suspicious/noExplicitAny: structural any shim for a divergent upstream module
    [key: string]: any;
  }
  // biome-ignore lint/suspicious/noExplicitAny: structural any shim for a divergent upstream module
  export type ServerOwnershipState = any;

  // biome-ignore lint/suspicious/noExplicitAny: structural any shim for a divergent upstream module
  export function checkSenderRole(...args: any[]): any;
  // biome-ignore lint/suspicious/noExplicitAny: structural any shim for a divergent upstream module
  export function checkSenderPrivateAccess(...args: any[]): any;
  // biome-ignore lint/suspicious/noExplicitAny: structural any shim for a divergent upstream module
  export function canModifyRole(...args: any[]): any;
  // biome-ignore lint/suspicious/noExplicitAny: structural any shim for a divergent upstream module
  export function getConfiguredOwnerEntityIds(...args: any[]): string[];
  // biome-ignore lint/suspicious/noExplicitAny: structural any shim for a divergent upstream module
  export function getConnectorAdminWhitelist(...args: any[]): any;
  // biome-ignore lint/suspicious/noExplicitAny: structural any shim for a divergent upstream module
  export function getEntityRole(...args: any[]): any;
  // biome-ignore lint/suspicious/noExplicitAny: structural any shim for a divergent upstream module
  export function getLiveEntityMetadataFromMessage(...args: any[]): any;
  // biome-ignore lint/suspicious/noExplicitAny: structural any shim for a divergent upstream module
  export function getUserServerRole(...args: any[]): Promise<any>;
  // biome-ignore lint/suspicious/noExplicitAny: structural any shim for a divergent upstream module
  export function findWorldsForOwner(...args: any[]): Promise<any>;
  // biome-ignore lint/suspicious/noExplicitAny: structural any shim for a divergent upstream module
  export function hasConfiguredCanonicalOwner(...args: any[]): boolean;
  // biome-ignore lint/suspicious/noExplicitAny: structural any shim for a divergent upstream module
  export function matchEntityToConnectorAdminWhitelist(...args: any[]): any;
  export function normalizeRole(raw: unknown): RoleName;
  // biome-ignore lint/suspicious/noExplicitAny: structural any shim for a divergent upstream module
  export function setEntityRole(...args: any[]): any;
  // biome-ignore lint/suspicious/noExplicitAny: structural any shim for a divergent upstream module
  export function resolveCanonicalOwnerId(...args: any[]): any;
  // biome-ignore lint/suspicious/noExplicitAny: structural any shim for a divergent upstream module
  export function resolveCanonicalOwnerIdForMessage(...args: any[]): Promise<any>;
  // biome-ignore lint/suspicious/noExplicitAny: structural any shim for a divergent upstream module
  export function resolveEntityRole(...args: any[]): Promise<any>;
  // biome-ignore lint/suspicious/noExplicitAny: structural any shim for a divergent upstream module
  export function resolveWorldForMessage(...args: any[]): Promise<any>;
  // biome-ignore lint/suspicious/noExplicitAny: structural any shim for a divergent upstream module
  export function setConnectorAdminWhitelist(...args: any[]): any;
}


declare module "@elizaos/plugin-plugin-manager" {
  import type { IAgentRuntime, Plugin } from "@elizaos/core";

  export class CoreManagerService {
    constructor(runtime: IAgentRuntime);
  }

  export class PluginManagerService {
    constructor(runtime: IAgentRuntime);
  }

  export const pluginRegistry: Record<string, unknown>;
  export const types: Record<string, unknown>;
  export const pluginManagerPlugin: Plugin;

  export default pluginManagerPlugin;
}

declare module "@elizaos/plugin-scratchpad" {
  import type { IAgentRuntime, Memory, Plugin } from "@elizaos/core";

  export function maybeStoreTaskScratchpadItem(
    runtime: IAgentRuntime,
    message: Memory,
    item: Record<string, unknown>,
  ): Promise<{
    requested?: boolean;
    stored?: boolean;
    replaced?: boolean;
    reason?: string;
    item?: { id: string; title: string };
    snapshot?: { items: Array<unknown>; maxItems: number };
  }>;

  const plugin: Plugin;
  export default plugin;
}

declare module "@elizaos/plugin-sql" {
  import type { Plugin } from "@elizaos/core";

  export const PGLITE_ERROR_CODES: {
    ACTIVE_LOCK: string;
    CORRUPT_DATA: string;
    MANUAL_RESET_REQUIRED: string;
  };

  export function getPgliteErrorCode(error: unknown): string | null;
  export function createPgliteInitError(
    code: string,
    message: string,
    options?: Record<string, unknown>,
  ): Error;

  const plugin: Plugin;
  export default plugin;
}

declare module "jsdom" {
  export class JSDOM {
    constructor(
      html?: string,
      options?: {
        url?: string;
        pretendToBeVisual?: boolean;
        [key: string]: unknown;
      },
    );
    window: Window & typeof globalThis;
    serialize(): string;
  }
}
