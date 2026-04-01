# Alice Operator Bootstrap

## Purpose

Provide one correct bootstrap path for an operator who needs to stand up Alice
with the right runtime, knowledge, boundaries, and deploy order.

## When to use

Use this document when:

- creating a fresh Alice environment
- rebuilding an operator workstation
- validating that Milady and `555-bot` still agree on Alice ownership and setup

## Prereqs

- access to `milaidy`
- access to `555-bot` if you intend to use the production deploy path
- model/provider credentials
- required plugin credentials for the surfaces you will enable
- if you are validating in an isolated profile or temp state dir, an explicit workspace path

## Steps

1. Read the current platform context:
   - `README.md`
   - `architecture`
   - `what-you-can-build`
   - `configuration`
2. Install and configure Milady using:
   - `installation`
   - `quickstart`
   - `configuration`
   - `cli/setup`
   - `cli/doctor`
3. Confirm runtime and lifecycle expectations:
   - `agents/runtime-and-lifecycle`
   - `architecture`
4. Seed or validate the Milady runtime corpus:
   - `guides/knowledge`
5. If you are preparing Alice production, switch to `555-bot` and validate:
   - deployment path
   - webhook path
   - runtime validation gates
6. Ask boundary questions before going live:
   - What is Milady responsible for?
   - What is Alice responsible for?
   - What is `555-bot` responsible for?
7. Run the first-use validation:
   - run `milady setup` or `bun scripts/run-node.mjs setup` for a source checkout
   - run `milady doctor --no-ports` or `bun scripts/run-node.mjs doctor --no-ports`
   - run `milady models`
   - start the runtime and confirm `GET /api/status` returns `state=running`
   - send one legacy `POST /api/chat` request with a `text` field to verify the chat surface and the current troubleshooting boundary

## Decision points

- Local-only operator usage:
  stop after Milady runtime validation.
- Alice production usage:
  continue into `555-bot` deploy and validation docs.
- Source-checkout validation:
  prefer `bun scripts/run-node.mjs <command>` over calling `node milady.mjs <command>` directly.

## Failure modes

- runtime starts but cannot answer boundary questions
- first `start` re-enters onboarding because `agents.list[].name` is still unset
- provider configuration is incomplete
- local Ollama is configured but unreachable on `127.0.0.1:11434`
- corpus exists but production corpus is stale
- deploy docs reference an older path than the live system

## Recovery

- use `doctor` and configuration docs for provider/runtime failures
- if `MILADY_STATE_DIR` is isolated, pass `--workspace` during setup and mirror that path into `agents.defaults.workspace`
- if `POST /api/chat` returns a graceful fallback response, verify the configured provider is actually reachable before treating the runtime as inference-ready
- resync corpus ownership using `guides/knowledge`
- defer to `555-bot` deployment canon when deploy documents conflict

## Evidence

- install/start output
- `doctor`, `models`, and `/api/status` proof
- first chat-response or graceful fallback transcript
- links to the exact docs used for setup

## Related tickets/docs

- `deployment`
- `agents/runtime-and-lifecycle`
- `guides/knowledge`
- `operators/alice-operator-proof-2026-04-01`
- `Render-Network-OS/555-bot: docs/ALICE_DEPLOYMENT_DOCS_INDEX.md`
