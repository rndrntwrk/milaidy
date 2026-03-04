# leftandright Mastery Dossier

## Objective
Dual-car lane-control reflex game.

## Controls
Left/Right toggles, Space restart.

## Progression Model
Follow the contract progression nodes for this game and enforce explicit recovery policy on MENU, PAUSED, GAME_OVER, and STUCK states.

## Pass Gates
p50 score >= baseline+50%; unsafe swaps <2%.

## Operational Notes
- Use deterministic control priorities from the corresponding contract file.
- Prefer safety-first recovery when telemetry is ambiguous.
- Certification evidence is recorded under `MILADY_STATE_DIR/five55-mastery/runs/<runId>/`.
