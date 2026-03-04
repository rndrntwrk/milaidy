# vedas-run Mastery Dossier

## Objective
3D runner/platform segmented route.

## Controls
Arrow move, Space jump, 1 restart.

## Progression Model
Follow the contract progression nodes for this game and enforce explicit recovery policy on MENU, PAUSED, GAME_OVER, and STUCK states.

## Pass Gates
Successful ending >=80%; fall deaths <15%; turret-hit deaths <20%.

## Operational Notes
- Use deterministic control priorities from the corresponding contract file.
- Prefer safety-first recovery when telemetry is ambiguous.
- Certification evidence is recorded under `MILADY_STATE_DIR/five55-mastery/runs/<runId>/`.
