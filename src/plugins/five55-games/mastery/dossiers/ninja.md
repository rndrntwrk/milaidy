# ninja Mastery Dossier

## Objective
Stealth platformer with fixed level matrices.

## Controls
Arrows/WASD move, Space jump, R retry.

## Progression Model
Follow the contract progression nodes for this game and enforce explicit recovery policy on MENU, PAUSED, GAME_OVER, and STUCK states.

## Pass Gates
Completion >=80%; detections <=1.2/level; retry <=1s.

## Operational Notes
- Use deterministic control priorities from the corresponding contract file.
- Prefer safety-first recovery when telemetry is ambiguous.
- Certification evidence is recorded under `MILADY_STATE_DIR/five55-mastery/runs/<runId>/`.
