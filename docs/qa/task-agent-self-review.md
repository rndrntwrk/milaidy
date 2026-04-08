# Task Agent Self-Review

These review harnesses exist to close the remaining manual gaps around the task-agent coordinator.

## Commands

- Docker host/runtime review:
  - `node scripts/docker-runtime-review.mjs`
  - Add `MILADY_DOCKER_REVIEW_RUN_SMOKE=1` to run `scripts/docker-ci-smoke.sh`
  - Add `MILADY_DOCKER_REVIEW_FULL_SMOKE=1` to include the container boot probe

- Live failover stability review:
  - `node --import tsx test/scripts/orchestrator-failover-review.ts`
  - Optional:
    - `FAILOVER_REVIEW_RUNS=3`
    - `ORCHESTRATOR_LIVE_PRIMARY=codex`
    - `ORCHESTRATOR_LIVE_FALLBACK=claude`

- Discord channel roundtrip review:
  - Discovery only:
    - `node --import tsx test/scripts/discord-channel-roundtrip-review.ts`
  - Post a challenge:
    - `MILADY_DISCORD_QA_POST=1 node --import tsx test/scripts/discord-channel-roundtrip-review.ts`
  - Wait for a human reply and then a bot reply:
    - `MILADY_DISCORD_QA_POST=1 MILADY_DISCORD_QA_WAIT_FOR_HUMAN=1 MILADY_DISCORD_QA_EXPECT_BOT_RESPONSE=1 node --import tsx test/scripts/discord-channel-roundtrip-review.ts`
  - Boot an isolated real Milady runtime with `connectors.discord` enabled, verify local chat, then wait for a literal human -> bot channel roundtrip:
    - `bun run test:discord:runtime:roundtrip`
  - Optional:
    - `DISCORD_QA_CHANNEL_ID=<channel-id>`
    - `DISCORD_QA_GUILD_NAME="Cozy Devs"`
    - `DISCORD_QA_TIMEOUT_MS=600000`

- Cross-platform coordinator review:
  - `node scripts/coordinator-cross-platform-review.mjs`
  - Optional:
    - `MILADY_COORDINATOR_QA_HEAVY=1`

## Review Artifacts

All review commands write artifacts under `.tmp/qa/`.

- `docker-runtime-review-*`
  - CLI path, daemon status, Desktop diagnostics, smoke logs
- `orchestrator-failover-review-*`
  - per-run stdout/stderr logs and a report summarizing blocked prompts, Claude dialogs, and preserved artifact files
- `discord-channel-review-*`
  - guild/channel discovery, posted challenge metadata, human reply metadata, bot reply metadata
- `discord-runtime-roundtrip-*`
  - isolated runtime config, local chat smoke proof, posted Discord challenge, human reply, bot reply, runtime log path
- `coordinator-platform-review-*`
  - per-platform smoke command logs and tool availability summary

## CI Review

Cross-platform review is wired in:

- `.github/workflows/task-agent-cross-platform-review.yml`

It runs the coordinator platform review on `ubuntu-latest`, `windows-latest`, and `macos-latest`, then uploads the `.tmp/qa/` review bundle as artifacts.

## Expected Human QA

- Docker container boot still depends on a healthy Docker Desktop daemon on the local host.
- Literal Discord chat roundtrip still requires a real human message in the chosen channel.
- The desktop runtime can still look healthy while Discord stays silent if `config.connectors.discord` is missing or disabled; the isolated runtime review catches that directly.
- Windows/Linux live-provider flows still require a real host or CI run with the required binaries and credentials.
