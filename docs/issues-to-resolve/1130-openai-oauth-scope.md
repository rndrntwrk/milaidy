# #1130 — ChatGPT Subscription (OpenAI Codex) OAuth token lacks API scope

**Filed:** 2026-03-19 by miladybsc
**Status recommendation:** CLOSE — Upstream dependency issue, not fixable in milady

## Summary

ChatGPT Subscription OAuth login completes successfully, but the token cannot call OpenAI API endpoints. All LLM calls fail with 403/401. The agent falls back to canned error responses.

## Root Cause

The OAuth client `app_EMoamEEZ73f0CkXaXp7hrann` (same client id as the former pi-ai helper) only requests identity scopes (`openid profile email offline_access`). OpenAI API now requires `api.model.read` and `api.model.write` scopes. The OAuth client is not authorized to request those scopes on OpenAI's platform.

## Why This Cannot Be Fixed in Milady

1. The OAuth client is registered on OpenAI's side (historically bundled via the pi-ai helper package)
2. The client needs to be updated on **OpenAI's developer platform** to allow API scopes
3. Any client library using that client id would need to request those scopes in auth requests
4. Milady has no control over either of these

## Codebase Presence

- Historical note: the npm package `@mariozechner/pi-ai` was removed from this repo; OAuth constants are inlined under `eliza/packages/agent/src/auth/vendor/pi-oauth/`.
- Used for OAuth flows across multiple providers (not just OpenAI)

## Workaround

Use Claude Subscription instead of ChatGPT Subscription — it works correctly.

## Recommendation

Close as "won't fix / upstream dependency" (OpenAI client registration + scopes). The workaround (Claude Subscription) is viable for all users.

## Age

24 days old (filed 2026-03-19). No upstream progress visible.
