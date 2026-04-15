# LifeOps Google OAuth — Local Mode Setup

**Status:** Parking doc — come back to this before enabling Gmail / Calendar.

Local mode connects your Google account directly from the desktop app.
Tokens stay on your machine; no Eliza Cloud in the middle.
The redirect URI is a loopback callback (`http://127.0.0.1`) handled by the running Milady API server.

---

## Why local mode?

| Mode | Auth goes through | Tokens stored | When to use |
|------|------------------|---------------|-------------|
| **local** | Google directly | Your machine (`~/.milady/`) | Desktop / self-hosted |
| **remote** | Google directly | Your server | Self-hosted behind a public URL |
| **cloud_managed** | Eliza Cloud (eliza.steward.fi) | Eliza Cloud | Managed cloud deployments |

Local mode is the right choice for the desktop app if you want your Gmail and Calendar tokens to stay on your own machine and not flow through Eliza Cloud.

---

## Step 1 — Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Create a new project (e.g. "Milady Local").
3. In the left sidebar: **APIs & Services → Library**.
4. Enable both:
   - **Gmail API**
   - **Google Calendar API**

---

## Step 2 — Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. Choose **External** (works for personal accounts).
3. Fill in required fields (App name, support email). The rest can be blank for now.
4. On the **Scopes** step, add:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send` *(optional — only if you want Milady to send email)*
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/calendar.events` *(optional — only if you want Milady to create/edit events)*
   - `openid`, `email`, `profile`
5. On the **Test users** step: **add your Gmail address** (the one you want Milady to track). While the app is in *Testing* status only allowlisted addresses can authorize.
6. Save.

---

## Step 3 — Create a Desktop OAuth client

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Desktop app**.
3. Name it anything (e.g. "Milady Desktop").
4. Click **Create**.
5. Copy the **Client ID** (you do NOT need the client secret for desktop apps — Google's loopback flow does not require it).

> **Why no client secret?**
> Desktop OAuth clients use PKCE (Proof Key for Code Exchange). The code verifier/challenge replaces the client secret. This is already implemented in `google-oauth.ts`.

---

## Step 4 — Register the redirect URI

In the OAuth client you just created, under **Authorized redirect URIs**, add:

```
http://127.0.0.1:31337/api/lifeops/connectors/google/callback
```

If you run Milady on a non-default API port (e.g. via `MILADY_API_PORT`), adjust the port accordingly. The redirect URI is constructed dynamically from the request URL, so it will always match what the running server is listening on — just make sure the port you register matches.

---

## Step 5 — Set the env var

Add to `~/.milady/.env` (create the file if it doesn't exist):

```bash
ELIZA_GOOGLE_OAUTH_DESKTOP_CLIENT_ID=<your-client-id-from-step-3>
```

The client secret is intentionally omitted for desktop clients.

Restart Milady after setting the env var:

```bash
bun run dev
```

---

## Step 6 — Connect

1. Open Milady → Settings → LifeOps.
2. Under the **Owner** connector card, select **Local** mode.
3. Click **Connect**.
4. Your browser opens `accounts.google.com` — sign in with the Gmail address you added as a test user.
5. Authorize the requested scopes.
6. The browser redirects to `http://127.0.0.1:31337/api/lifeops/...` — the desktop app picks up the token automatically.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| "Google OAuth local mode is not configured" | Env var missing or not loaded | Confirm `ELIZA_GOOGLE_OAUTH_DESKTOP_CLIENT_ID` is set in `~/.milady/.env` and restart |
| "Local Google OAuth requires the API to be addressed over a loopback host" | You're accessing the API from a non-loopback URL | Use `http://localhost:31337` or `http://127.0.0.1:31337` |
| "Access blocked: app not verified" | Your Google account is not in the test-user list | Add your Gmail address in the OAuth consent screen → Test users |
| `redirect_uri_mismatch` | Redirect URI in Google Console doesn't match the running port | Update the authorized redirect URI to match your actual API port |
| Token not showing as connected after browser completes | Browser didn't redirect back (tab closed early) | Click Refresh in the connector card to poll for the new token |

---

## Security notes

- Tokens are stored at `~/.milady/oauth/lifeops/google/<agentId>/owner/local.json` with `0600` permissions.
- The file contains a refresh token — treat it like a password.
- Revoke access at any time: [myaccount.google.com/permissions](https://myaccount.google.com/permissions) → remove "Milady Local".
- The desktop OAuth client ID is not a secret (it's embedded in the auth URL Google returns), but the refresh token absolutely is.
