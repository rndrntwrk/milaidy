/**
 * Shim for @lookingglass/webxr. The real package has a broken ESM import
 * chain under Node's strict resolver, so tests use this no-op polyfill
 * instead of failing during module resolution.
 */
export class LookingGlassWebXRPolyfill {
  constructor(_options?: Record<string, unknown>) {}
}
