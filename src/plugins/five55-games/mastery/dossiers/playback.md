# playback Mastery Dossier

## Objective
Room-based puzzle platformer with tape mechanics.

## Controls
Arrows + jump/interact/tape controls.

## Progression Model
Follow the contract progression nodes for this game and enforce explicit recovery policy on MENU, PAUSED, GAME_OVER, and STUCK states.

## Pass Gates
Room solve >=90%; softlock recovery <=15s; completion >=80%.

## Operational Notes
- Use deterministic control priorities from the corresponding contract file.
- Prefer safety-first recovery when telemetry is ambiguous.
- Certification evidence is recorded under `MILADY_STATE_DIR/five55-mastery/runs/<runId>/`.
