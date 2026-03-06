---
title: "555 Stream"
sidebarTitle: "555 Stream"
description: "Canonical public docs entry for the 555 Stream plugin."
---

# 555 Stream

`555 Stream` is the canonical first-party plugin for stream auth, channels, go-live, ads, and stream-facing operator controls.

Use this page as the public entry point. The repo keeps deeper reference docs for contributors and package maintainers.

<CardGroup cols={2}>
  <Card title="Repo" icon="github" href="https://github.com/rndrntwrk/stream-plugin">
    Source, issues, releases, and in-repo reference docs.
  </Card>
  <Card title="Open Reference README" icon="book" href="https://github.com/rndrntwrk/stream-plugin/blob/main/README.md">
    Repo-local developer reference landing page.
  </Card>
</CardGroup>

## When to use it

Use `555 Stream` when an agent or operator needs to:

- authenticate against the 555 stream control plane
- bootstrap or inspect a live session
- configure channels and sync outputs
- start or stop a livestream
- trigger ads and other stream-side monetization controls

## Primary operator flow

1. Authenticate
2. Bootstrap session
3. Configure channels
4. Verify readiness
5. Go live
6. Trigger ads or control the stream

## Canonical quick links

- [Install and Auth](https://github.com/rndrntwrk/stream-plugin/blob/main/docs/INSTALL_AND_AUTH.md)
- [Get Started](https://github.com/rndrntwrk/stream-plugin/blob/main/docs/GET_STARTED.md)
- [Actions Reference](https://github.com/rndrntwrk/stream-plugin/blob/main/docs/ACTIONS_REFERENCE.md)
- [States and Transitions](https://github.com/rndrntwrk/stream-plugin/blob/main/docs/STATES_AND_TRANSITIONS.md)
- [Complex Flows](https://github.com/rndrntwrk/stream-plugin/blob/main/docs/COMPLEX_FLOWS.md)
- [Edge Cases and Recovery](https://github.com/rndrntwrk/stream-plugin/blob/main/docs/EDGE_CASES_AND_RECOVERY.md)
- [Coverage and Gaps](https://github.com/rndrntwrk/stream-plugin/blob/main/docs/COVERAGE_AND_GAPS.md)

## Lifecycle vocabulary

Milady should present these lifecycle tokens for `555 Stream`:

| Token | Meaning |
| --- | --- |
| `installed` | package is present |
| `enabled` | host allows loading |
| `loaded` | stream service initialized |
| `authenticated` | stream auth is valid |
| `ready` | primary operator flow is action-capable |
| `degraded` | plugin is available but one or more stream dependencies are impaired |

Stream-specific readiness stays visible separately:

- `sessionBound`
- `channelsSaved`
- `channelsEnabled`
- `channelsReady`

## Public vs repo docs

Use this Milady page for:

- public entry
- host/operator framing
- canonical naming and lifecycle expectations

Use the repo docs for:

- package-maintainer reference
- action-by-action details
- reference examples
- deeper implementation notes

## Related

- [555 Arcade](/plugins/555-arcade)
- [First-Party Public Plugin Standard](/plugins/first-party-public-standard)
- [First-Party Release Status](/plugins/first-party-release-status)
