# fighter-planes Mastery Dossier

## Objective
Mouse-aim dogfight survival shooter.

## Controls
Mouse aim, click shoot, menu click start.

## Progression Model
Follow the contract progression nodes for this game and enforce explicit recovery policy on MENU, PAUSED, GAME_OVER, and STUCK states.

## Pass Gates
p50 survival >=180s; rockets/min >= baseline+30%; avoidable deaths <20%.

## Operational Notes
- Use deterministic control priorities from the corresponding contract file.
- Prefer safety-first recovery when telemetry is ambiguous.
- Certification evidence is recorded under `MILADY_STATE_DIR/five55-mastery/runs/<runId>/`.
