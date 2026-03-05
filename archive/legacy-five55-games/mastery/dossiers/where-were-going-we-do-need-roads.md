# where-were-going-we-do-need-roads Mastery Dossier

## Objective
Endless road-shaping hazard runner.

## Controls
Mouse/touch drag pointer.

## Progression Model
Follow the contract progression nodes for this game and enforce explicit recovery policy on MENU, PAUSED, GAME_OVER, and STUCK states.

## Pass Gates
p50 distance >=1.8x baseline; collisions <0.15/min; restart <=1s.

## Operational Notes
- Use deterministic control priorities from the corresponding contract file.
- Prefer safety-first recovery when telemetry is ambiguous.
- Certification evidence is recorded under `MILADY_STATE_DIR/five55-mastery/runs/<runId>/`.
