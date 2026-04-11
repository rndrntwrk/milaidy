/**
 * Ambient declaration for `@elizaos/core/roles`.
 *
 * Mirrors `packages/shared/src/elizaos-core-roles.d.ts` and
 * `packages/agent/src/external-modules.d.ts`. See the long-form
 * rationale in either of those files. Published `@elizaos/core@alpha`
 * does not expose `./roles` in its `exports` field, so this package
 * declares only what `src/access.ts` imports at the type level.
 */

declare module "@elizaos/core/roles" {
  export type RoleName = "OWNER" | "ADMIN" | "USER" | "GUEST";
  // biome-ignore lint/suspicious/noExplicitAny: structural any shim for a divergent upstream module
  export function checkSenderRole(...args: any[]): any;
}
