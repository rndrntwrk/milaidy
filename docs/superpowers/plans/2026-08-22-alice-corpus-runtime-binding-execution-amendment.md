# Alice corpus runtime binding — execution amendment

**Date:** 22 August 2026  
**Original plan:** `2026-08-22-alice-corpus-runtime-binding.md`

During source-grounded implementation, the canonical runtime contract showed that `@miladyai/agent` already exports internal plugins through `./plugins/*`. The implementation therefore uses:

```text
packages/agent/src/plugins/alice-corpus/
@miladyai/agent/plugins/alice-corpus
```

instead of creating a new workspace package at `plugins/plugin-alice-corpus`.

This change is intentional because it:

- avoids adding a new workspace dependency and lockfile mutation;
- keeps corpus integration on the exact agent-runtime release boundary;
- uses the established internal-plugin resolution path already used by other Milaidy plugins;
- ensures package typecheck and build cover the corpus integration automatically;
- prevents an otherwise unused workspace package from affecting frozen installs.

The standalone package scaffold created during the initial RED phase was removed after its tests and implementation were migrated into the agent package.

All other design constraints remain unchanged: external immutable corpus mount, explicit physical projection, fail-closed checksum and visibility validation, native Eliza knowledge persistence, physical stale-projection pruning, projected read-only graph and no action authority from corpus content.
