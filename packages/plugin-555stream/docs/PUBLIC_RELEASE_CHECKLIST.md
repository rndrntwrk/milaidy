# 555 Stream — Public Release Checklist

Use this before publishing a release externally.

## Package

- [ ] `package.json` name, repo, homepage, and issue tracker are correct
- [ ] `elizaos.displayName` is `555 Stream`
- [ ] `config/plugin-config.schema.json` is current
- [ ] `config/plugin-ui.schema.json` is current
- [ ] `dist/` builds cleanly

## Docs

- [ ] `README.md` is current
- [ ] `GET_STARTED.md` matches the real operator flow
- [ ] `INSTALL_AND_AUTH.md` matches the real auth model
- [ ] `ACTIONS_REFERENCE.md` covers canonical and compatibility actions
- [ ] `STATES_AND_TRANSITIONS.md` matches Milaidy/operator UI states
- [ ] `EDGE_CASES_AND_RECOVERY.md` covers auth, ads, and stop approvals
- [ ] `COVERAGE_AND_GAPS.md` is honest about known issues
- [ ] `WIP_TODO.md` is current

## Skills

- [ ] operator skill is current
- [ ] OpenClaw skill is current
- [ ] skill language matches canonical action names

## Functional verification

- [ ] `STREAM555_HEALTHCHECK` succeeds
- [ ] `STREAM555_BOOTSTRAP_SESSION` succeeds
- [ ] `STREAM555_STREAM_STATUS` succeeds
- [ ] at least one channel can be configured and enabled
- [ ] `STREAM555_STREAM_START` or `STREAM555_GO_LIVE_APP` works in a real environment
- [ ] `STREAM555_AD_LIST` and `STREAM555_AD_BREAK_TRIGGER` work on a real session
- [ ] `STREAM555_STREAM_STOP` approval flow works end-to-end

## Security

- [ ] no secrets are hard-coded in docs or examples
- [ ] public docs use placeholder secrets only
- [ ] static bearer is documented as fallback, not the default
- [ ] internal base URL usage is documented as allow-list-only

## Publishing

- [ ] version bumped intentionally
- [ ] changelog/release note written
- [ ] tags/registry publish command verified
