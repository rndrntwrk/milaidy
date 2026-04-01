# Skills

Core skill shipped with the app. Additional skills are available from the
[Milady Skills Registry](https://github.com/milady-ai/skills) and can be
installed via the Skills marketplace tab in the UI or:

```bash
npx skills add milady-ai/skills/<skill-name>
```

## Directory Layout

```
skills/
  milady-development/    Core development skill (shipped)
  .cache/                Runtime catalog cache (gitignored)
```

The agent runtime reads skills from `~/.milady/skills/` (user state dir).
`scripts/ensure-skills.mjs` seeds the shipped skill on first run.
