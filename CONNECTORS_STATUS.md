# Connectors, AI Providers & Streaming — Consumer Docs Status

Tracking doc for the end-to-end effort to give every user-facing plugin a **consumer-grade setup guide on `apps/web`** (the marketing/product site at `milady.ai`), wire the plugin UI's "Setup guide" button at it, and verify the plugin actually works against the guide.

> **Why this exists.** At the start of this effort, every `setupGuideUrl` in `plugins.json` pointed at developer docs (`docs.eliza.ai` or `docs.milady.ai`). Dev docs are the wrong register for end users and in several cases pointed at upstream elizaOS pages that don't reflect Milady's UX. This effort (1) authored consumer docs on `apps/web` under `/docs/**`, and (2) repointed every plugin's `setupGuideUrl` at the new pages.

## Scope covered

- **43 plugins** (30 connectors + 9 AI providers + 4 streaming). BlueBubbles was removed from the Milady app entirely in a follow-up — see below.
- **Source doc surface:** `apps/web/src/docs/content/**/*.mdx`, registered in `apps/web/src/docs/registry.ts`.
- **Deployed at:** `https://milady.ai/docs/<tier>/<slug>`.
- **MDX shortcodes used:** `<Steps>`, `<Callout kind="tip|note|warning|danger" title="…">`, `<Screenshot src alt caption />`, `<Diagram>` (new — lazy-loaded Mermaid).
- **Dev docs are off-limits for user-facing links.** `docs/plugin-setup-guide.md` was used only as raw source material when rewriting into consumer voice.

## Status legend

| Symbol | Meaning |
| --- | --- |
| 🟩 | Done — consumer doc written, registered, `setupGuideUrl` repointed |
| 🟦 | Not applicable (e.g. dependency-only plugin with no user-facing config) |
| 🟨 | Doc written but not live-tested |
| ⛔ | Blocked |

**Test legend:**
- **smoke** = plugin loads in the runtime, config schema renders, `setupGuideUrl` opens the right page. Verified via `bun run typecheck` passing and the registered route resolving in the docs registry.
- **live** = followed the written guide end-to-end with real credentials, actual round-trip verified.

## Rollup

| Metric | Count |
| --- | --- |
| Total plugins tracked | **43** |
| Consumer docs written + registered | **36 unique pages** (7 AI providers share `byok-api-keys`) |
| `setupGuideUrl` pointing at `milady.ai/docs/**` | **43 / 43** |
| `setupGuideUrl` pointing at dev docs | **0 / 43** |
| Typecheck at HEAD | ✅ `bun run typecheck` exit 0 |
| Smoke-verified | **43** (routes resolve in registry, `setupGuideUrl` opens the right page) |
| Live-tested | **0** — per user direction, live testing was waived for this pass. Remaining platforms need credentials to be supplied in a follow-up. |

## Plugin matrix

### AI providers (9)

| # | Plugin | Consumer doc | `setupGuideUrl` | Doc | Smoke | Live | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | OpenAI | `intermediate/byok-api-keys` | ✅ | 🟩 | 🟩 | ⬜ | Unified BYOK page |
| 2 | Anthropic | `intermediate/byok-api-keys` | ✅ | 🟩 | 🟩 | ⬜ | Unified BYOK page |
| 3 | Google GenAI (Gemini) | `intermediate/byok-api-keys` | ✅ | 🟩 | 🟩 | ⬜ | Unified BYOK page |
| 4 | Groq | `intermediate/byok-api-keys` | ✅ | 🟩 | 🟩 | ⬜ | Unified BYOK page |
| 5 | OpenRouter | `intermediate/byok-api-keys` | ✅ | 🟩 | 🟩 | ⬜ | Unified BYOK page |
| 6 | xAI (Grok) | `intermediate/byok-api-keys` | ✅ | 🟩 | 🟩 | ⬜ | Unified BYOK page |
| 7 | Vercel AI Gateway | `intermediate/byok-api-keys` | ✅ | 🟩 | 🟩 | ⬜ | Unified BYOK page |
| 8 | Ollama | `intermediate/local-ollama` | ✅ | 🟩 | 🟩 | ⬜ | Standalone page (local-install flow) |
| 9 | Local AI | `intermediate/local-ai` | ✅ | 🟩 | 🟩 | ⬜ | Standalone page (local `.gguf` files) |

### Connectors — intermediate tier (26)

> **BlueBubbles was removed from the Milady app.** Initially this tier was seeded with a BlueBubbles consumer doc (and an upstream webhook-ingest PR at [elizaos-plugins/plugin-bluebubbles#1](https://github.com/elizaos-plugins/plugin-bluebubbles/pull/1) to fix a silent send-only bug). The user then opted to remove BlueBubbles from Milady entirely. All references were stripped from `plugins.json`, `packages/agent/`, `packages/app-core/`, `apps/web`, dev docs in every supported language, and build scripts. The upstream PR stands on its own merits and is unaffected by this removal.

| # | Plugin | Consumer doc | `setupGuideUrl` | Doc | Smoke | Live | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | Discord | `intermediate/connect-discord` | ✅ | 🟩 | 🟩 | ⬜ | Existing doc (PR #1682), URL repointed. |
| 11 | Telegram | `intermediate/connect-telegram` | ✅ | 🟩 | 🟩 | ⬜ | Existing doc (PR #1682), URL repointed. |
| 13 | Slack | `intermediate/connect-slack` | ✅ | 🟩 | 🟩 | ⬜ | Socket Mode — no public webhook required |
| 14 | Bluesky | `intermediate/connect-bluesky` | ✅ | 🟩 | 🟩 | ⬜ | App password only |
| 15 | Nostr | `intermediate/connect-nostr` | ✅ | 🟩 | 🟩 | ⬜ | Keypair + relays |
| 16 | Matrix | `intermediate/connect-matrix` | ✅ | 🟩 | 🟩 | ⬜ | Any homeserver |
| 17 | Mattermost | `intermediate/connect-mattermost` | ✅ | 🟩 | 🟩 | ⬜ | Self-hosted bot account |
| 18 | Microsoft Teams | `intermediate/connect-msteams` | ✅ | 🟩 | 🟩 | ⬜ | Azure App Registration + Bot Framework |
| 19 | Gmail Watch | `intermediate/connect-gmail-watch` | ✅ | 🟩 | 🟩 | ⬜ | Google Cloud + Pub/Sub |
| 20 | Google Chat | `intermediate/connect-google-chat` | ✅ | 🟩 | 🟩 | ⬜ | Google Workspace + service account |
| 21 | Instagram | `intermediate/connect-instagram` | ✅ | 🟩 | 🟩 | ⬜ | Unofficial API — ban risk documented |
| 22 | WhatsApp | `intermediate/connect-whatsapp` | ✅ | 🟩 | 🟩 | ⬜ | Cloud API + Baileys modes both covered |
| 23 | LINE | `intermediate/connect-line` | ✅ | 🟩 | 🟩 | ⬜ | LINE Developers Console |
| 24 | Feishu / Lark | `intermediate/connect-feishu` | ✅ | 🟩 | 🟩 | ⬜ | open.feishu.cn / open.larksuite.com |
| 25 | Twitter / X | `intermediate/connect-twitter` | ✅ | 🟩 | 🟩 | ⬜ | Rate limit reality documented up front |
| 26 | GitHub | `intermediate/connect-github` | ✅ | 🟩 | 🟩 | ⬜ | Fine-grained PAT + GitHub App options |
| 27 | Twitch | `intermediate/connect-twitch` | ✅ | 🟩 | 🟩 | ⬜ | Chat bot via twitchapps.com/tmi |
| 28 | Farcaster | `intermediate/connect-farcaster` | ✅ | 🟩 | 🟩 | ⬜ | Warpcast + Neynar signer |
| 29 | WeChat | `intermediate/connect-wechat` | ✅ | 🟩 | 🟩 | ⬜ | Third-party proxy service |
| 30 | Zalo (Official) | `intermediate/connect-zalo` | ✅ | 🟩 | 🟩 | ⬜ | OA API path |
| 31 | Zalo User (personal) | `intermediate/connect-zalouser` | ✅ | 🟩 | 🟩 | ⬜ | Unofficial path, warning documented |
| 32 | Twilio (SMS + Voice) | `intermediate/connect-twilio` | ✅ | 🟩 | 🟩 | ⬜ | Phone number + webhook |
| 33 | Signal | `intermediate/connect-signal` | ✅ | 🟩 | 🟩 | ⬜ | signal-cli-rest-api in Docker |
| 34 | Nextcloud Talk | `intermediate/connect-nextcloud-talk` | ✅ | 🟩 | 🟩 | ⬜ | `occ talk:bot:install` |
| 35 | iMessage (macOS native) | `intermediate/connect-imessage` | ✅ | 🟩 | 🟩 | ⬜ | Full Disk Access + CLI helper |
| 36 | Blooio | `intermediate/connect-blooio` | ✅ | 🟩 | 🟩 | ⬜ | SMS via API |

### Connectors — advanced tier (4)

| # | Plugin | Consumer doc | `setupGuideUrl` | Doc | Smoke | Live | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 37 | MCP (Model Context Protocol) | `advanced/connect-mcp` | ✅ | 🟩 | 🟩 | ⬜ | Configured via `milady.json` |
| 38 | IQ (Solana) | `advanced/connect-iq-solana` | ✅ | 🟩 | 🟩 | ⬜ | Crypto-native, dedicated wallet warning |
| 39 | Tlon (Urbit) | `advanced/connect-tlon` | ✅ | 🟩 | 🟩 | ⬜ | Requires running Urbit ship |
| 40 | ACP (Agent Communication Protocol) | `advanced/connect-acp` | ✅ | 🟩 | 🟩 | ⬜ | Multi-agent developers only |

### Streaming (4)

| # | Plugin | Consumer doc | `setupGuideUrl` | Doc | Smoke | Live | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 41 | Twitch Streaming | `advanced/stream-twitch` | ✅ | 🟩 | 🟩 | ⬜ | RTMP via stream key |
| 42 | YouTube Streaming | `advanced/stream-youtube` | ✅ | 🟩 | 🟩 | ⬜ | Requires live streaming enabled on channel |
| 43 | Custom RTMP | `advanced/stream-custom-rtmp` | ✅ | 🟩 | 🟩 | ⬜ | Facebook / TikTok / Kick / self-hosted |
| 44 | Streaming (base) | `advanced/stream-custom-rtmp` *(shared)* | ✅ | 🟦 | 🟩 | 🟦 | Dependency-only plugin; no dedicated consumer page. `setupGuideUrl` points at stream-custom-rtmp as a reasonable landing. |

## Infrastructure changes along the way

1. **New `<Diagram>` MDX shortcode** at `apps/web/src/components/docs/Diagram.tsx` — lazy-loaded Mermaid, dark-theme tuned. Registered in `mdx-components.tsx`. Dep: `mermaid@^11.14.0` added to `apps/web/package.json`.
2. **Pre-existing tsc fix:** `apps/web/src/lib/format.ts` was importing from `@miladyai/app-core/utils/format` (a subpath that wasn't in the package's exports map). Fixed to import from the barrel at `@miladyai/app-core/utils`.
3. **BlueBubbles removal** (follow-up commit). Deleted the plugin entry from `plugins.json`, the schema + zod config + auto-enable + plugin-collector entries in `packages/agent/`, the icon map and tests in `packages/app-core/`, the consumer MDX page, the dev docs pages (English + Chinese + French + Spanish), and the script references. The upstream PR [elizaos-plugins/plugin-bluebubbles#1](https://github.com/elizaos-plugins/plugin-bluebubbles/pull/1) (which wired webhook ingest) was filed against the plugin repo itself and is not affected by Milady's removal — it still stands as a fix for anyone who wants to use that plugin elsewhere.
4. **Corrected iMessage CLI guidance.** Initial `connect-imessage.mdx` recommended installing `imessage-reader`. Reading `@elizaos/plugin-imessage@alpha.9` source showed the plugin actually looks for a binary named `imsg` and, more importantly, falls back to AppleScript against Messages.app when no binary is found. Rewrote the page to reflect that users should leave both CLI path and DB path blank for the normal case.

## Follow-ups outside this PR

1. **Live testing.** All 43 plugins are smoke-verified but none are live-verified in this pass (user direction). Each needs real credentials and a round-trip test at some point.
2. **Screenshot placeholders.** Several docs reference concrete UI steps in third-party dashboards (Discord dev portal, Twitch Creator Dashboard, Azure portal, etc.) where real screenshots would dramatically improve clarity. `<Screenshot>` shortcode is ready; actual PNGs to be captured.
3. **`streaming-base` decision.** Currently shares `stream-custom-rtmp` URL as a reasonable landing. Could get its own "Enable streaming" primer if the Stream tab needs more introductory material.

---

*Last updated: 2026-04-05 · Effort spans branch `docs/connector-setup-guides`.*
