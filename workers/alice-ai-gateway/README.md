# Alice AI Gateway

Dedicated OpenAI-compatible Cloudflare Worker for the Alice runtime. It keeps
Cloudflare account credentials out of Modal, allows only the pinned Workers AI
models used by Alice, and routes chat and embeddings through the
`alice-production` Cloudflare AI Gateway. Every inference first reserves a
release-bound budget from `alice-production-control`; its bearer credential is
accepted only when `sha256(active_release_digest + ":" + bearer)` matches the
configured release-token digest. Control-plane outage,
PAUSE_MODEL, PAUSE_ALL, release drift, and budget exhaustion all fail closed
before Workers AI is invoked.

## Routes

- `GET /healthz` — public liveness, control-plane, AI Gateway, and model inventory
- `POST /v1/chat/completions` — bearer-protected Workers AI compatibility route
- `POST /v1/embeddings` — bearer-protected BGE-M3 embeddings route

## Secrets

Set `ALICE_RUNTIME_RELEASE_TOKEN_SHA256` and the AI-only
`ALICE_AI_CONTROL_SERVICE_TOKEN` with `wrangler secret put`. The first value is the
digest of the active release digest and the runtime-only bearer; the plaintext
bearer is held only by the admitted runtime. Rotate both the runtime bearer and
its gateway digest at every release promotion, and prove the prior bearer is
rejected before admitting model traffic. Never add either value to source or
Wrangler configuration. The control service binding is private
Cloudflare-to-Cloudflare traffic; the route-scoped token is distinct from the
Access gateway credential so neither service can call the other's control
routes after a binding or routing mistake.

## Validation

```sh
node --test src/index.test.mjs
wrangler deploy --dry-run
```

Deploy only after the signed Alice ProgramEnvelope is active on the control
plane. Record the prior Worker version before the canary and roll back by
restoring that version. The `alice-production` AI Gateway must have caching
and Gateway request logging disabled, a bounded request rate, and an
independent spend ceiling; the Durable Object budget remains the stricter
synchronous admission boundary.
