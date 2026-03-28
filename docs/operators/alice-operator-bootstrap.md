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
   - fresh install to first useful response
   - boundary answer check
   - provider/config sanity check

## Decision points

- Local-only operator usage:
  stop after Milady runtime validation.
- Alice production usage:
  continue into `555-bot` deploy and validation docs.

## Failure modes

- runtime starts but cannot answer boundary questions
- provider configuration is incomplete
- corpus exists but production corpus is stale
- deploy docs reference an older path than the live system

## Recovery

- use `doctor` and configuration docs for provider/runtime failures
- resync corpus ownership using `guides/knowledge`
- defer to `555-bot` deployment canon when deploy documents conflict

## Evidence

- install/start output
- first successful boundary-response transcript
- links to the exact docs used for setup

## Related tickets/docs

- `deployment`
- `agents/runtime-and-lifecycle`
- `guides/knowledge`
- `Render-Network-OS/555-bot: docs/ALICE_DEPLOYMENT_DOCS_INDEX.md`
