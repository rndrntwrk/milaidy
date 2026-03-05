# sector-13 Mastery Dossier

## Objective
Shooter progression through 13 sectors.

## Controls
Mouse move/aim and click engage.

## Progression Model
Follow the contract progression nodes for this game and enforce explicit recovery policy on MENU, PAUSED, GAME_OVER, and STUCK states.

## Pass Gates
Reach sector 13 >=70%; score >= baseline+35%; no menu stall >2s.

## Operational Notes
- Use deterministic control priorities from the corresponding contract file.
- Prefer safety-first recovery when telemetry is ambiguous.
- Certification evidence is recorded under `MILADY_STATE_DIR/five55-mastery/runs/<runId>/`.
