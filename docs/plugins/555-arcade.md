---
title: "555 Arcade"
sidebarTitle: "555 Arcade"
description: "Canonical public docs entry for the 555 Arcade plugin."
---

# 555 Arcade

`555 Arcade` is the canonical first-party plugin for arcade auth, session bootstrap, games, score capture, leaderboard, and quests.

Use this page as the public entry point. The repo keeps deeper reference docs for contributors and package maintainers.

<CardGroup cols={2}>
  <Card title="Repo" icon="github" href="https://github.com/rndrntwrk/555-arcade-plugin">
    Source, issues, releases, and in-repo reference docs.
  </Card>
  <Card title="Open Reference README" icon="book" href="https://github.com/rndrntwrk/555-arcade-plugin/blob/main/README.md">
    Repo-local developer reference landing page.
  </Card>
</CardGroup>

## When to use it

Use `555 Arcade` when an agent or operator needs to:

- authenticate against the 555 arcade stack
- bind or bootstrap a gameplay session
- fetch the game catalog
- play, switch, or stop games
- submit or inspect scores
- work with leaderboard and quest surfaces

## Primary operator flow

1. Authenticate
2. Bootstrap session
3. Fetch catalog
4. Play or switch games
5. Observe progression surfaces

## Canonical quick links

- [Install and Auth](https://github.com/rndrntwrk/555-arcade-plugin/blob/main/docs/INSTALL_AND_AUTH.md)
- [Get Started](https://github.com/rndrntwrk/555-arcade-plugin/blob/main/docs/GET_STARTED.md)
- [Actions Reference](https://github.com/rndrntwrk/555-arcade-plugin/blob/main/docs/ACTIONS_REFERENCE.md)
- [States and Transitions](https://github.com/rndrntwrk/555-arcade-plugin/blob/main/docs/STATES_AND_TRANSITIONS.md)
- [Complex Flows](https://github.com/rndrntwrk/555-arcade-plugin/blob/main/docs/COMPLEX_FLOWS.md)
- [Edge Cases and Recovery](https://github.com/rndrntwrk/555-arcade-plugin/blob/main/docs/EDGE_CASES_AND_RECOVERY.md)
- [Coverage and Gaps](https://github.com/rndrntwrk/555-arcade-plugin/blob/main/docs/COVERAGE_AND_GAPS.md)

## Lifecycle vocabulary

Milady should present these lifecycle tokens for `555 Arcade`:

| Token | Meaning |
| --- | --- |
| `installed` | package is present |
| `enabled` | host allows loading |
| `loaded` | arcade service initialized |
| `authenticated` | arcade auth is valid |
| `ready` | primary operator flow is action-capable |
| `degraded` | plugin is available but one or more arcade dependencies are impaired |

Arcade-specific readiness stays visible separately:

- `sessionBootstrapped`
- `catalogReachable`
- `scorePipelineReachable`
- `leaderboardReachable`
- `questsReachable`

## Public vs repo docs

Use this Milady page for:

- public entry
- host/operator framing
- canonical naming and lifecycle expectations

Use the repo docs for:

- package-maintainer reference
- action-by-action details
- progression examples
- deeper implementation notes

## Related

- [555 Stream](/plugins/555-stream)
- [First-Party Public Plugin Standard](/plugins/first-party-public-standard)
- [First-Party Release Status](/plugins/first-party-release-status)
