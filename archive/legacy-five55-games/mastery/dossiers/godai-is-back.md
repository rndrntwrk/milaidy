# godai-is-back Mastery Dossier

## Objective
Arena fighter duel.

## Controls
A/D move, W/S attack.

## Progression Model
Follow the contract progression nodes for this game and enforce explicit recovery policy on MENU, PAUSED, GAME_OVER, and STUCK states.

## Pass Gates
Round win >=75%; damage ratio <=0.8; no input-lock stalls.

## Operational Notes
- Use deterministic control priorities from the corresponding contract file.
- Prefer safety-first recovery when telemetry is ambiguous.
- Certification evidence is recorded under `MILADY_STATE_DIR/five55-mastery/runs/<runId>/`.
