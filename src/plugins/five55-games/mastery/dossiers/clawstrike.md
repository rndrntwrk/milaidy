# clawstrike Mastery Dossier

## Objective
Combat platformer with die-and-retry loop.

## Controls
Movement, jump, attack per mapping.

## Progression Model
Follow the contract progression nodes for this game and enforce explicit recovery policy on MENU, PAUSED, GAME_OVER, and STUCK states.

## Pass Gates
Full clear >=75%; deaths <=0.6x baseline; time <=0.8x baseline.

## Operational Notes
- Use deterministic control priorities from the corresponding contract file.
- Prefer safety-first recovery when telemetry is ambiguous.
- Certification evidence is recorded under `MILADY_STATE_DIR/five55-mastery/runs/<runId>/`.
