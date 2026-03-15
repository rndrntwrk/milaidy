# Milady Cloud Rollout Plan

This document defines the Milady Cloud rollout as three user-facing hosting paths that all share one onboarding entry point.

## Product paths

1. Local
   The backend runs on the user's machine with the current full-local behavior and full local permissions.

2. Milady Cloud
   The frontend provisions and connects to a managed container through the Eliza Cloud control plane, but the user only sees Milady Cloud branding and Milady URLs.

3. Remote Milady backend
   The frontend connects to an already running Milady backend by address plus access key (`MILADY_API_TOKEN`).

## Architecture

### App onboarding

- Add a hosting-choice screen before provider setup.
- Local continues into the existing provider selection flow.
- Cloud splits into:
  - `Milady Cloud`: submit onboarding with `runMode: "cloud"` and `cloudProvider: "miladycloud"`.
  - `Remote Milady`: switch the frontend API base to the remote backend and restart app bootstrap against that target.
- Persist the selected API base in session storage so reloads and popouts keep the same backend.
- Keep the existing RPC step, but treat Milady Cloud as ready when the user is authenticated or has entered a cloud API key.

### Self-hosted remote backend

- The backend stays the canonical Milady API server.
- Browser clients must send a bearer token using `MILADY_API_TOKEN`.
- CORS must explicitly allow the frontend origin with `MILADY_ALLOWED_ORIGINS`.
- The onboarding access key shown to the user is the same value as `MILADY_API_TOKEN`.

### Milady Cloud wrapper

- `cloud.milady.ai` should point at a Milady-branded deploy of `eliza-cloud-v2`.
- Eliza Cloud remains the underlying control plane, OAuth handler, and user store.
- Login and CLI-confirmation pages must present Milady branding even if the underlying auth/session APIs are still Eliza-managed.
- The wrapper should use `NEXT_PUBLIC_APP_URL=https://cloud.milady.ai`.

### Railway deployment

- Deploy `eliza-cloud-v2` as a dedicated Railway service.
- Use the root `railway.toml` to standardize:
  - `builder = "RAILPACK"`
  - `startCommand = "bun run start"`
  - `healthcheckPath = "/login"`
- Attach the custom domain `cloud.milady.ai`.
- Terminate TLS at Railway and keep the public app URL pinned to the custom domain.

## Operator checklist

### Milady app and API

- [x] Restore hosting-choice onboarding in the app.
- [x] Add `Milady Cloud` and `Remote Milady` cloud sub-options.
- [x] Allow the frontend client to rebind to a remote backend during onboarding.
- [x] Persist the rebound API base for the current session.
- [x] Update cloud defaults and user-facing copy from Eliza Cloud to Milady Cloud.
- [x] Persist a Milady Cloud API key during onboarding when the user chooses API-key auth.

### Self-hosted remote flow

- [x] Document secure remote backend deployment in the README.
- [x] Document address + access-key connection flow in the README.
- [x] Document Tailscale as the preferred private-network exposure path.
- [ ] Add a dedicated in-app "switch backend" settings surface after onboarding.
- [ ] Add a remote-backend connectivity diagnostic screen for auth/CORS/WS failures.

### Milady Cloud wrapper

- [x] Brand `eliza-cloud-v2` login metadata for Milady Cloud.
- [x] Brand the CLI confirmation page for Milady Cloud.
- [x] Add Railway config-as-code with a login healthcheck.
- [ ] Finish branding the rest of the `eliza-cloud-v2` dashboard shell, metadata, and public pages.
- [ ] Point all production cloud URLs and emails at `cloud.milady.ai`.
- [ ] Update OAuth redirect allowlists in the auth provider configs for `cloud.milady.ai`.
- [ ] Verify post-login session redirects and popup flows end-to-end against the Milady app.

### Infrastructure and release

- [ ] Create the Railway production project and attach `cloud.milady.ai`.
- [ ] Set production secrets in Railway for auth, database, billing, queueing, and any container-provisioning providers used by `eliza-cloud-v2`.
- [ ] Run a production smoke test:
  - Local onboarding
  - Milady Cloud provisioning
  - Remote self-host attach by URL + token
  - Desktop download flow from the homepage
- [ ] Cut a Milady release after the hosted flow is verified on the public domain.

## Remote backend deployment recipe

Use this when the user wants to host their own backend and connect from the Milady web frontend.

1. Install Milady on the target machine.
2. Set a non-loopback bind, a strong API token, and explicit allowed origins.
3. Expose the service over HTTPS or a private Tailscale URL.
4. In onboarding, choose `Cloud` -> `Remote Milady`, then enter:
   - backend address
   - access key (`MILADY_API_TOKEN`)

Recommended environment:

```bash
MILADY_API_BIND=0.0.0.0
MILADY_API_TOKEN=$(openssl rand -hex 32)
MILADY_ALLOWED_ORIGINS=https://cloud.milady.ai,https://milady.ai
```

Optional Tailscale exposure:

```bash
tailscale serve --https=443 http://127.0.0.1:2138
```

For a public Tailscale-hosted URL:

```bash
tailscale funnel --https=443 http://127.0.0.1:2138
```

## Railway service recipe

Use this when deploying the Milady Cloud wrapper.

1. Deploy `eliza-cloud-v2` to Railway from its repo root.
2. Keep `NEXT_PUBLIC_APP_URL=https://cloud.milady.ai`.
3. Attach the custom domain in Railway and wait for the managed certificate.
4. Point DNS for `cloud.milady.ai` at the Railway-issued target.
5. Validate `/login` and `/auth/cli-login?session=test-session` before opening the public rollout.
