# wolf-and-sheep Mastery Dossier

## Objective
Grid survival/push puzzle with wolf pursuit.

## Controls
Arrows/WASD.

## Progression Model
Follow the contract progression nodes for this game and enforce explicit recovery policy on MENU, PAUSED, GAME_OVER, and STUCK states.

## Pass Gates
Survival moves >=2x baseline; capture rate <=25%; valid moves >=99%.

## Operational Notes
- Use deterministic control priorities from the corresponding contract file.
- Prefer safety-first recovery when telemetry is ambiguous.
- Certification evidence is recorded under `MILADY_STATE_DIR/five55-mastery/runs/<runId>/`.
