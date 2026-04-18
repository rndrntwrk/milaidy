# LifeOps External API Mocks

This directory contains [Mockoon](https://mockoon.com/) environment files that
emulate the external HTTP APIs LifeOps integrates with. Tests point the
LifeOps clients at these mocks via env vars instead of hitting real services.

## Files

| File                                | Mocks                                | Default port | Env var                      |
| ----------------------------------- | ------------------------------------ | ------------ | ---------------------------- |
| `environments/twilio.json`          | Twilio Programmable Messaging/Voice  | 3001         | `MILADY_MOCK_TWILIO_BASE`    |
| `environments/whatsapp.json`        | WhatsApp Business Cloud (Meta Graph) | 3002         | `MILADY_MOCK_WHATSAPP_BASE`  |
| `environments/calendly.json`        | Calendly v2                          | 3003         | `MILADY_MOCK_CALENDLY_BASE`  |
| `environments/x-twitter.json`       | X (Twitter) v2                       | 3004         | `MILADY_MOCK_X_BASE`         |
| `environments/google.json`          | Gmail / Calendar / OAuth token       | 3005         | `MILADY_MOCK_GOOGLE_BASE`    |
| `environments/cloud-managed.json`   | Eliza Cloud managed-Google endpoints | 3006         | (set Eliza Cloud `apiBaseUrl`) |

Each LifeOps client reads its env var on import and falls back to the real URL
when unset. See the patched files in
`eliza/apps/app-lifeops/src/lifeops/`:

- `twilio.ts`, `whatsapp-client.ts`, `calendly-client.ts`
- `x-poster.ts`, `x-reader.ts`
- `google-fetch.ts` (rewrites all `*.googleapis.com` + `accounts.google.com`)
- `google-oauth.ts` (token + userinfo go through the same rewrite helper)

## Install Mockoon CLI

```bash
bun add -d @mockoon/cli
```

Or invoke ad hoc with `bunx @mockoon/cli ...`.

## Run mocks manually

```bash
bunx @mockoon/cli start --data test/mocks/environments/twilio.json
# ... or all six in parallel:
bunx @mockoon/cli start \
  --data test/mocks/environments/twilio.json \
  --data test/mocks/environments/whatsapp.json \
  --data test/mocks/environments/calendly.json \
  --data test/mocks/environments/x-twitter.json \
  --data test/mocks/environments/google.json \
  --data test/mocks/environments/cloud-managed.json
```

Then point the clients at the mocks:

```bash
export MILADY_MOCK_TWILIO_BASE=http://127.0.0.1:3001
export MILADY_MOCK_WHATSAPP_BASE=http://127.0.0.1:3002
export MILADY_MOCK_CALENDLY_BASE=http://127.0.0.1:3003
export MILADY_MOCK_X_BASE=http://127.0.0.1:3004
export MILADY_MOCK_GOOGLE_BASE=http://127.0.0.1:3005
```

## Test usage

Tests use `createMockedTestRuntime` (built by a separate task) which boots the
mocks and sets the env vars before constructing the LifeOps runtime. Existing
unit tests that use `vi.stubGlobal('fetch', ...)` continue to work and do not
require the Mockoon servers.

## Add or edit mocks

Open the JSON files directly, or use the [Mockoon desktop
app](https://mockoon.com/download/) (it loads the same JSON format).
Templating syntax (`{{body 'field'}}`, `{{urlParam 'id'}}`, `{{faker '...'}}`)
is documented at https://mockoon.com/docs/latest/templating/overview/.
