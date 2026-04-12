# #1130 — ChatGPT Subscription (OpenAI Codex) OAuth token lacks API scope

**Filed:** 2026-03-19 by miladybsc
**Status recommendation:** CLOSE — Upstream dependency issue, not fixable in milady

## Summary

ChatGPT Subscription OAuth login completes successfully, but the token cannot call OpenAI API endpoints. All LLM calls fail with 403/401. The agent falls back to canned error responses.

## Root Cause

The OAuth client `app_EMoamEEZ73f0CkXaXp7hrann` (registered in `@mariozechner/pi-ai`) only requests identity scopes (`openid profile email offline_access`). OpenAI API now requires `api.model.read` and `api.model.write` scopes. The OAuth client is not authorized to request those scopes on OpenAI's platform.

## Why This Cannot Be Fixed in Milady

1. The OAuth client is registered and owned by `@mariozechner/pi-ai`
2. The client needs to be updated on **OpenAI's developer platform** to allow API scopes
3. Then `@mariozechner/pi-ai` needs to include those scopes in auth requests
4. Milady has no control over either of these

## Codebase Presence

- `@mariozechner/pi-ai` is referenced in: `package.json`, provider detail screens, onboarding tests, provider switcher, server config
- Used for OAuth flows across multiple providers (not just OpenAI)

## Workaround

Use Claude Subscription instead of ChatGPT Subscription — it works correctly.

## Recommendation

Close as "won't fix / upstream dependency". File upstream issue on `@mariozechner/pi-ai` if not already done. The workaround (Claude Subscription) is viable for all users.

## Age

24 days old (filed 2026-03-19). No upstream progress visible.
