# Alice Parameter Matrix (2026-02-22)

Generated from live deployment + live secret inventory.

## Summary

1. Total env parameters: 86
2. Secret required refs: 6 (missing: 0)
3. Secret optional refs: 66 (missing: 49)
4. Literal env values: 14

## Matrix

| Parameter | Type | Source | Present | Note |
|---|---|---|---|---|
| ADMIN_API_TOKEN | secret-optional | alice-secrets/ADMIN_API_TOKEN | no | missing secret key |
| ALCHEMY_API_KEY | secret-optional | alice-secrets/ALCHEMY_API_KEY | no | missing secret key |
| ALICE_GH_TOKEN | secret-optional | alice-secrets/ALICE_GH_TOKEN | yes |  |
| ANTHROPIC_API_KEY | secret-required | alice-secrets/ANTHROPIC_API_KEY | yes |  |
| CACHE_DIR | literal | /home/node/.eliza/cache | n/a |  |
| DISCORD_API_TOKEN | secret-optional | alice-secrets/DISCORD_API_TOKEN | yes |  |
| DISCORD_APPLICATION_ID | secret-optional | alice-secrets/DISCORD_APPLICATION_ID | yes |  |
| DISCORD_SHOULD_IGNORE_BOT_MESSAGES | secret-optional | alice-secrets/DISCORD_SHOULD_IGNORE_BOT_MESSAGES | no | missing secret key |
| DISPLAY | literal | :99 | n/a |  |
| EVM_PRIVATE_KEY | secret-optional | alice-secrets/EVM_PRIVATE_KEY | no | missing secret key |
| FIVE55_ADMIN_API_URL | secret-optional | alice-secrets/FIVE55_ADMIN_API_URL | no | missing secret key |
| FIVE55_ADMIN_BEARER_TOKEN | secret-optional | alice-secrets/FIVE55_ADMIN_BEARER_TOKEN | no | missing secret key |
| FIVE55_ADMIN_PLUGIN_ENABLED | secret-optional | alice-secrets/FIVE55_ADMIN_PLUGIN_ENABLED | no | missing secret key |
| FIVE55_API_BEARER_TOKEN | secret-optional | alice-secrets/FIVE55_API_BEARER_TOKEN | no | missing secret key |
| FIVE55_API_KEY | secret-optional | alice-secrets/FIVE55_API_KEY | no | missing secret key |
| FIVE55_API_SIGNING_SECRET | secret-optional | alice-secrets/FIVE55_API_SIGNING_SECRET | no | missing secret key |
| FIVE55_BATTLES_API_URL | secret-optional | alice-secrets/FIVE55_BATTLES_API_URL | no | missing secret key |
| FIVE55_BATTLES_CREATE_ENDPOINT | secret-optional | alice-secrets/FIVE55_BATTLES_CREATE_ENDPOINT | no | missing secret key |
| FIVE55_BATTLES_PLUGIN_ENABLED | secret-optional | alice-secrets/FIVE55_BATTLES_PLUGIN_ENABLED | no | missing secret key |
| FIVE55_GAMES_API_DIALECT | secret-optional | alice-secrets/FIVE55_GAMES_API_DIALECT | no | missing secret key |
| FIVE55_GAMES_API_URL | secret-optional | alice-secrets/FIVE55_GAMES_API_URL | no | missing secret key |
| FIVE55_GAMES_PLUGIN_ENABLED | secret-optional | alice-secrets/FIVE55_GAMES_PLUGIN_ENABLED | no | missing secret key |
| FIVE55_HTTP_MAX_RESPONSE_CHARS | secret-optional | alice-secrets/FIVE55_HTTP_MAX_RESPONSE_CHARS | no | missing secret key |
| FIVE55_HTTP_RETRIES | secret-optional | alice-secrets/FIVE55_HTTP_RETRIES | no | missing secret key |
| FIVE55_HTTP_RETRY_BASE_MS | secret-optional | alice-secrets/FIVE55_HTTP_RETRY_BASE_MS | no | missing secret key |
| FIVE55_HTTP_TIMEOUT_MS | secret-optional | alice-secrets/FIVE55_HTTP_TIMEOUT_MS | no | missing secret key |
| FIVE55_LAUNCH_PROFILE | secret-optional | alice-secrets/FIVE55_LAUNCH_PROFILE | no | missing secret key |
| FIVE55_LEADERBOARD_API_URL | secret-optional | alice-secrets/FIVE55_LEADERBOARD_API_URL | no | missing secret key |
| FIVE55_LEADERBOARD_PLUGIN_ENABLED | secret-optional | alice-secrets/FIVE55_LEADERBOARD_PLUGIN_ENABLED | no | missing secret key |
| FIVE55_POLICY_PROFILE | secret-optional | alice-secrets/FIVE55_POLICY_PROFILE | no | missing secret key |
| FIVE55_QUESTS_API_URL | secret-optional | alice-secrets/FIVE55_QUESTS_API_URL | no | missing secret key |
| FIVE55_QUESTS_PLUGIN_ENABLED | secret-optional | alice-secrets/FIVE55_QUESTS_PLUGIN_ENABLED | no | missing secret key |
| FIVE55_REWARDS_API_URL | secret-optional | alice-secrets/FIVE55_REWARDS_API_URL | no | missing secret key |
| FIVE55_REWARDS_PLUGIN_ENABLED | secret-optional | alice-secrets/FIVE55_REWARDS_PLUGIN_ENABLED | no | missing secret key |
| FIVE55_SCORE_CAPTURE_API_URL | secret-optional | alice-secrets/FIVE55_SCORE_CAPTURE_API_URL | no | missing secret key |
| FIVE55_SCORE_CAPTURE_PLUGIN_ENABLED | secret-optional | alice-secrets/FIVE55_SCORE_CAPTURE_PLUGIN_ENABLED | no | missing secret key |
| FIVE55_SOCIAL_API_URL | secret-optional | alice-secrets/FIVE55_SOCIAL_API_URL | no | missing secret key |
| FIVE55_SOCIAL_PLUGIN_ENABLED | secret-optional | alice-secrets/FIVE55_SOCIAL_PLUGIN_ENABLED | no | missing secret key |
| GITHUB_API_TOKEN | secret-optional | alice-secrets/GITHUB_API_TOKEN | yes |  |
| GITHUB_BRANCH | secret-optional | alice-secrets/GITHUB_BRANCH | yes |  |
| GITHUB_OWNER | secret-optional | alice-secrets/GITHUB_OWNER | yes |  |
| GITHUB_REPO | secret-optional | alice-secrets/GITHUB_REPO | yes |  |
| MILAIDY_API_BIND | literal | 0.0.0.0 | n/a |  |
| MILAIDY_API_TOKEN | secret-required | alice-secrets/MILAIDY_API_TOKEN | yes |  |
| MILAIDY_API_URL | secret-optional | alice-secrets/MILAIDY_API_URL | no | missing secret key |
| MILAIDY_CREDENTIALS_MASTER_KEY | secret-optional | alice-secrets/MILAIDY_CREDENTIALS_MASTER_KEY | no | missing secret key |
| MILAIDY_HOME | literal | /home/node/.milaidy | n/a |  |
| MILAIDY_PGLITE_RECOVERY | literal | true | n/a |  |
| MILAIDY_PORT | literal | 3000 | n/a |  |
| MILAIDY_STATE_DIR | literal | /home/node/.milaidy | n/a |  |
| MODELS_DIR | literal | /home/node/.eliza/models | n/a |  |
| NODE_ENV | literal | production | n/a |  |
| OPENAI_API_KEY | secret-optional | alice-secrets/OPENAI_API_KEY | yes |  |
| PGLITE_DATA_DIR | literal | /home/node/.milaidy/workspace/.eliza/.elizadb | n/a |  |
| PORT | literal | 3000 | n/a |  |
| RUNWAYML_API_SECRET | secret-optional | alice-secrets/RUNWAYML_API_SECRET | yes |  |
| SECRET_SALT | secret-optional | alice-secrets/SECRET_SALT | yes |  |
| SHELL_ALLOWED_DIRECTORY | literal | /app/milaidy | n/a |  |
| SOLANA_PRIVATE_KEY | secret-optional | alice-secrets/SOLANA_PRIVATE_KEY | yes |  |
| STREAM_API_BEARER_TOKEN | secret-optional | alice-secrets/STREAM_API_BEARER_TOKEN | yes |  |
| STREAM_API_DIALECT | secret-optional | alice-secrets/STREAM_API_DIALECT | no | missing secret key |
| STREAM_API_URL | secret-optional | alice-secrets/STREAM_API_URL | no | missing secret key |
| STREAM_DEFAULT_INPUT_TYPE | secret-optional | alice-secrets/STREAM_DEFAULT_INPUT_TYPE | no | missing secret key |
| STREAM_DEFAULT_INPUT_URL | secret-optional | alice-secrets/STREAM_DEFAULT_INPUT_URL | no | missing secret key |
| STREAM_PLUGIN_ENABLED | secret-optional | alice-secrets/STREAM_PLUGIN_ENABLED | yes |  |
| STREAM_SESSION_ID | secret-optional | alice-secrets/STREAM_SESSION_ID | no | missing secret key |
| STREAM555_AGENT_TOKEN | secret-required | alice-secrets/STREAM555_AGENT_TOKEN | yes |  |
| STREAM555_BASE_URL | literal | http://control-plane:3000 | n/a |  |
| STREAM555_CONTROL_PLUGIN_ENABLED | secret-optional | alice-secrets/STREAM555_CONTROL_PLUGIN_ENABLED | yes |  |
| STREAM555_DEFAULT_SESSION_ID | secret-optional | alice-secrets/STREAM555_DEFAULT_SESSION_ID | no | missing secret key |
| STREAM555_REQUIRE_APPROVALS | literal | true | n/a |  |
| SW4P_API_BEARER_TOKEN | secret-optional | alice-secrets/SW4P_API_BEARER_TOKEN | no | missing secret key |
| SW4P_API_KEY | secret-optional | alice-secrets/SW4P_API_KEY | no | missing secret key |
| SW4P_API_SIGNING_SECRET | secret-optional | alice-secrets/SW4P_API_SIGNING_SECRET | no | missing secret key |
| SWAP_API_URL | secret-optional | alice-secrets/SWAP_API_URL | no | missing secret key |
| SWAP_PLUGIN_ENABLED | secret-optional | alice-secrets/SWAP_PLUGIN_ENABLED | no | missing secret key |
| TELEGRAM_BOT_TOKEN | secret-optional | alice-secrets/TELEGRAM_BOT_TOKEN | yes |  |
| TWITTER_2FA_SECRET | secret-optional | alice-secrets/TWITTER_2FA_SECRET | no | missing secret key |
| TWITTER_AGENT_KEY | secret-optional | alice-secrets/TWITTER_AGENT_KEY | no | missing secret key |
| TWITTER_AGENT_MAIN_API_BASE | secret-optional | alice-secrets/TWITTER_AGENT_MAIN_API_BASE | no | missing secret key |
| TWITTER_BOT_KEY | secret-optional | alice-secrets/TWITTER_BOT_KEY | no | missing secret key |
| TWITTER_BOT_MAIN_API_BASE | secret-optional | alice-secrets/TWITTER_BOT_MAIN_API_BASE | yes |  |
| TWITTER_COOKIES_FULL | secret-optional | alice-secrets/TWITTER_COOKIES_FULL | yes |  |
| TWITTER_EMAIL | secret-required | alice-secrets/TWITTER_EMAIL | yes |  |
| TWITTER_PASSWORD | secret-required | alice-secrets/TWITTER_PASSWORD | yes |  |
| TWITTER_USERNAME | secret-required | alice-secrets/TWITTER_USERNAME | yes |  |

## Missing Secret References

### Required (must fix)

- none

### Optional (capability drift)

- ADMIN_API_TOKEN -> alice-secrets/ADMIN_API_TOKEN
- ALCHEMY_API_KEY -> alice-secrets/ALCHEMY_API_KEY
- DISCORD_SHOULD_IGNORE_BOT_MESSAGES -> alice-secrets/DISCORD_SHOULD_IGNORE_BOT_MESSAGES
- EVM_PRIVATE_KEY -> alice-secrets/EVM_PRIVATE_KEY
- FIVE55_ADMIN_API_URL -> alice-secrets/FIVE55_ADMIN_API_URL
- FIVE55_ADMIN_BEARER_TOKEN -> alice-secrets/FIVE55_ADMIN_BEARER_TOKEN
- FIVE55_ADMIN_PLUGIN_ENABLED -> alice-secrets/FIVE55_ADMIN_PLUGIN_ENABLED
- FIVE55_API_BEARER_TOKEN -> alice-secrets/FIVE55_API_BEARER_TOKEN
- FIVE55_API_KEY -> alice-secrets/FIVE55_API_KEY
- FIVE55_API_SIGNING_SECRET -> alice-secrets/FIVE55_API_SIGNING_SECRET
- FIVE55_BATTLES_API_URL -> alice-secrets/FIVE55_BATTLES_API_URL
- FIVE55_BATTLES_CREATE_ENDPOINT -> alice-secrets/FIVE55_BATTLES_CREATE_ENDPOINT
- FIVE55_BATTLES_PLUGIN_ENABLED -> alice-secrets/FIVE55_BATTLES_PLUGIN_ENABLED
- FIVE55_GAMES_API_DIALECT -> alice-secrets/FIVE55_GAMES_API_DIALECT
- FIVE55_GAMES_API_URL -> alice-secrets/FIVE55_GAMES_API_URL
- FIVE55_GAMES_PLUGIN_ENABLED -> alice-secrets/FIVE55_GAMES_PLUGIN_ENABLED
- FIVE55_HTTP_MAX_RESPONSE_CHARS -> alice-secrets/FIVE55_HTTP_MAX_RESPONSE_CHARS
- FIVE55_HTTP_RETRIES -> alice-secrets/FIVE55_HTTP_RETRIES
- FIVE55_HTTP_RETRY_BASE_MS -> alice-secrets/FIVE55_HTTP_RETRY_BASE_MS
- FIVE55_HTTP_TIMEOUT_MS -> alice-secrets/FIVE55_HTTP_TIMEOUT_MS
- FIVE55_LAUNCH_PROFILE -> alice-secrets/FIVE55_LAUNCH_PROFILE
- FIVE55_LEADERBOARD_API_URL -> alice-secrets/FIVE55_LEADERBOARD_API_URL
- FIVE55_LEADERBOARD_PLUGIN_ENABLED -> alice-secrets/FIVE55_LEADERBOARD_PLUGIN_ENABLED
- FIVE55_POLICY_PROFILE -> alice-secrets/FIVE55_POLICY_PROFILE
- FIVE55_QUESTS_API_URL -> alice-secrets/FIVE55_QUESTS_API_URL
- FIVE55_QUESTS_PLUGIN_ENABLED -> alice-secrets/FIVE55_QUESTS_PLUGIN_ENABLED
- FIVE55_REWARDS_API_URL -> alice-secrets/FIVE55_REWARDS_API_URL
- FIVE55_REWARDS_PLUGIN_ENABLED -> alice-secrets/FIVE55_REWARDS_PLUGIN_ENABLED
- FIVE55_SCORE_CAPTURE_API_URL -> alice-secrets/FIVE55_SCORE_CAPTURE_API_URL
- FIVE55_SCORE_CAPTURE_PLUGIN_ENABLED -> alice-secrets/FIVE55_SCORE_CAPTURE_PLUGIN_ENABLED
- FIVE55_SOCIAL_API_URL -> alice-secrets/FIVE55_SOCIAL_API_URL
- FIVE55_SOCIAL_PLUGIN_ENABLED -> alice-secrets/FIVE55_SOCIAL_PLUGIN_ENABLED
- MILAIDY_API_URL -> alice-secrets/MILAIDY_API_URL
- MILAIDY_CREDENTIALS_MASTER_KEY -> alice-secrets/MILAIDY_CREDENTIALS_MASTER_KEY
- STREAM_API_DIALECT -> alice-secrets/STREAM_API_DIALECT
- STREAM_API_URL -> alice-secrets/STREAM_API_URL
- STREAM_DEFAULT_INPUT_TYPE -> alice-secrets/STREAM_DEFAULT_INPUT_TYPE
- STREAM_DEFAULT_INPUT_URL -> alice-secrets/STREAM_DEFAULT_INPUT_URL
- STREAM_SESSION_ID -> alice-secrets/STREAM_SESSION_ID
- STREAM555_DEFAULT_SESSION_ID -> alice-secrets/STREAM555_DEFAULT_SESSION_ID
- SW4P_API_BEARER_TOKEN -> alice-secrets/SW4P_API_BEARER_TOKEN
- SW4P_API_KEY -> alice-secrets/SW4P_API_KEY
- SW4P_API_SIGNING_SECRET -> alice-secrets/SW4P_API_SIGNING_SECRET
- SWAP_API_URL -> alice-secrets/SWAP_API_URL
- SWAP_PLUGIN_ENABLED -> alice-secrets/SWAP_PLUGIN_ENABLED
- TWITTER_2FA_SECRET -> alice-secrets/TWITTER_2FA_SECRET
- TWITTER_AGENT_KEY -> alice-secrets/TWITTER_AGENT_KEY
- TWITTER_AGENT_MAIN_API_BASE -> alice-secrets/TWITTER_AGENT_MAIN_API_BASE
- TWITTER_BOT_KEY -> alice-secrets/TWITTER_BOT_KEY
