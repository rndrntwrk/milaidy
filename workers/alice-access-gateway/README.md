# Alice Access gateway

Source-controlled authenticated ingress for the production Alice runtime. The
Cloudflare Access edge policy runs first; this Worker independently verifies the
signed Access JWT against the exact application audience and owner identity,
strips Access cookies and caller credentials, injects one scoped trusted-proxy
proof, and proxies to the production Container Durable Object. The
more-specific `/control/*` route remains owned by `alice-production-control`.

The routed `alice-access-gateway` Worker references that Durable Object through
the external `ALICE_RUNTIME_CONTAINER` binding. It owns no Container or Durable
Object migration. The separate `alice-runtime-container-host` Worker owns the
`AliceRuntimeContainer` class, the `v2-alice-runtime-container` migration, and
the single immutable `alice-production-runtime` Container. Its dedicated
`src/runtime-host.ts` entrypoint has no default fetch export, no route, and no
workers.dev or preview URL.
