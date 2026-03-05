# Legacy Five55 Games Archive

This directory preserves the pre-port Milaidy-local implementation of:

- `src/plugins/five55-games/mastery/*`
- `src/plugins/five55-games/intelligence/*`

These files were archived on March 5, 2026 as part of the canonical `@rndrntwrk/plugin-555arcade` cutover.

Current ownership:

- Runtime and compile-time source of truth: `@rndrntwrk/plugin-555arcade`
- Milaidy live shims:
  - `src/plugins/five55-games/mastery/index.ts`
  - `src/plugins/five55-games/intelligence/index.ts`

Why this archive exists:

- preserve repository-local history and prior implementation details
- remove duplicate arcade domain ownership from Milaidy `src/`
- keep Release A/B rollback context available while canonical cutover stabilizes

Archive handling rules:

- do not import code from this archive in live runtime paths
- do not add new tests against archived modules
- if behavior changes are needed, patch `arcade-plugin`, not this archive
