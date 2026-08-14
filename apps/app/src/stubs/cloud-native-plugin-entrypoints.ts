/**
 * Cloud-web compatibility boundary for latest official Eliza.
 *
 * `apps/app/src/main.tsx` imports the native registration barrel only inside
 * the iOS/Android branch. The production Alice image is web-only, but Rollup
 * still resolves the dynamic import. Alice's app-core intentionally does not
 * expose the official mobile JS-runtime registry, so the cloud build maps that
 * unreachable branch here instead of bundling incompatible native code.
 */
export {};
