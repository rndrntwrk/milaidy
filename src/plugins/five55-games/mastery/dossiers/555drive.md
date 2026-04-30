# 555drive Mastery Dossier

## Objective
Checkpoint racing survival.

## Controls
Arrow steer/accel/brake.

## Progression Model
Follow the contract progression nodes for this game and enforce explicit recovery policy on MENU, PAUSED, GAME_OVER, and STUCK states.

## Pass Gates
Late checkpoint >=75%; collision gameovers <0.3/min; score >= baseline+30%.

## Operational Notes
- Use deterministic control priorities from the corresponding contract file.
- Prefer safety-first recovery when telemetry is ambiguous.
- Certification evidence is recorded under `MILADY_STATE_DIR/five55-mastery/runs/<runId>/`.
