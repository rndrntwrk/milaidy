# Alice Game Screenshot Truth Audit

Generated: 2026-03-05 (America/Chicago)
Source artifacts:
- /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-game-smoke-report.json
- /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-game-smoke-truth-verdict.json
- /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-*.png

Scope: visual truth check of screenshots against declared mastery bars (not adapter-reported synthetic/derived metrics).

## Summary
- Strict denominator (excluding deferred multiplayer `godai-is-back`): 15 games
- Visual mastery passes: 5/15
- Visual mastery fails: 10/15
- Deferred: 1 (`godai-is-back`)

Visual passes:
- knighthood
- ninja
- 555drive (provisional)
- peanball (provisional)
- eat-my-dust (provisional)

Visual fails:
- sector-13
- clawstrike
- chesspursuit
- wolf-and-sheep
- leftandright
- playback
- fighter-planes
- floor13
- where-were-going-we-do-need-roads
- vedas-run

## Per-game findings

### knighthood: PASS
- Requirement: score > 5000
- Visual evidence:
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-knighthood-04-progress-4.png (score 5912)
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-knighthood-06-final.png (score 10425)

### sector-13: FAIL
- Requirement: reach sector >= 7
- Visual evidence indicates gameplay and game-over, but no screenshot proves sector >= 7.
- Captures observed:
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-sector-13-03-progress-3.png (sector 2 visible)
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-sector-13-05-progress-5.png (game-over)
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-sector-13-06-final.png (game-over)

### ninja: PASS
- Requirement: reach level >= 8
- Visual evidence:
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-ninja-05-progress-5.png (level 8/17)
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-ninja-06-final.png (level 9/17)

### clawstrike: FAIL
- Requirement: reach level >= 7
- Visual evidence remains at level 1.
- Captures:
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-clawstrike-03-progress-3.png (level 1/13)
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-clawstrike-06-final.png (level 1/13)

### 555drive: PASS (provisional)
- Requirement status: provisional acceptable for now.
- Visual evidence shows sustained driving progression.
- Captures:
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-555drive-05-progress-5.png
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-555drive-09-final.png

### chesspursuit: FAIL
- Requirement: real board progression (no static/menu pass)
- 7 images are pixel-identical start/menu state.
- Duplicate hash group includes:
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-chesspursuit-00-boot.png
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-chesspursuit-01-first-playing.png
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-chesspursuit-02-progress-2.png
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-chesspursuit-03-progress-3.png
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-chesspursuit-04-progress-4.png
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-chesspursuit-05-progress-5.png
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-chesspursuit-06-final.png

### wolf-and-sheep: FAIL
- Requirement: trap >= 2 wolves via block-push
- Screenshots do not show trapping progression; mostly static/replay board.
- Captures:
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-wolf-and-sheep-00-boot.png
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-wolf-and-sheep-06-final.png

### leftandright: FAIL
- Requirement: survive >= 60s with wrongCoinCount = 0 and true play evidence
- Final visual is restart/death screen score 0.
- Capture:
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-leftandright-06-final.png

### playback: FAIL
- Requirement: leave blank/start states and show room progression
- Most captures are black frames with overlay text; one gameplay frame exists but progression evidence is not consistent.
- Captures:
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-playback-00-boot.png (black)
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-playback-01-progress-1.png (real scene)
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-playback-06-final.png (black)

### fighter-planes: FAIL
- Requirement: demonstrate movement + shooting + survival mastery
- Movement/shooting visible, but run ends in game-over; mastery not established.
- Captures:
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-fighter-planes-05-progress-5.png
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-fighter-planes-06-final.png

### floor13: FAIL
- Requirement: floor >= 5 with clear round/floor evidence
- Combat visible, but screenshots do not clearly prove floor progression threshold.
- Captures:
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-floor13-04-progress-4.png
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-floor13-05-final.png

### godai-is-back: DEFERRED
- Deferred multiplayer title; excluded from strict denominator.

### peanball: PASS (provisional)
- Requirement status: provisional acceptable for now.
- Visual evidence shows active play with ring/board progression.
- Captures:
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-peanball-05-progress-5.png
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-peanball-06-final.png

### eat-my-dust: PASS (provisional)
- Requirement status: provisional acceptable for now.
- Visual evidence shows active typing run and clear new record screen.
- Captures:
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-eat-my-dust-05-progress-5.png
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-eat-my-dust-06-final.png

### where-were-going-we-do-need-roads: FAIL
- Requirement: valid road shaping; no buried/invalid geometry
- Car is visually buried/clipped in multiple captures; run is probe_fail.
- Captures:
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-where-were-going-we-do-need-roads-00-boot.png
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-where-were-going-we-do-need-roads-06-final.png

### vedas-run: FAIL
- Requirement: meaningful segment progression (target >= 7 segments per plan) with control-surface coverage
- Visual evidence shows near-start distance and no clear progression proof; does not corroborate claimed high segment metrics.
- Captures:
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-vedas-run-01-first-playing.png
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-vedas-run-05-progress-5.png
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/output/playwright/alice-smoke-vedas-run-06-final.png

## Integrity defects found (cross-cutting)
1. Non-reset starts contaminate episodes.
- Multiple games begin with non-zero/high scores or advanced counters at first-playing.
- Examples from report JSON: knighthood score start 2711, sector-13 start 1207, playback start roomTransitions 6/localIndex 134, vedas-run start segment 30, wolf-and-sheep starts wolvesTrapped 2.

2. Telemetry/frame mismatch allows false pass.
- Example: `leftandright` final screenshot shows restart screen score 0, while metadata reports status PLAYING score 94.
- Example: `sector-13` screenshots show game-over while telemetry reports status PLAYING/sector 8.

3. Static-frame false progression.
- `chesspursuit` has 7 identical screenshots while score/checkpoint/progressRow metrics increase.

4. Black-frame loophole.
- `playback` passes because frame size > 9KB even when frames are black overlays.

5. Movement evidence is weak in several games.
- Many games report very high `longestNoMovementMs` due missing/invalid position telemetry while still passing.

## Bottom line
- Current screenshot truth review does not support 14/15 mastery.
- Strict visual+runtime consistency supports 5/15 (with 1 deferred):
  - Pass: knighthood, ninja, 555drive (prov), peanball (prov), eat-my-dust (prov)
  - Fail: sector-13, clawstrike, chesspursuit, wolf-and-sheep, leftandright, playback, fighter-planes, floor13, roads, vedas-run
