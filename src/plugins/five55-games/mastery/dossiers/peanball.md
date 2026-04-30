# peanball Mastery Dossier

## Objective
Elemental pinball with rings/monster targets.

## Controls
Arrow clusters + Space/click launch/boost.

## Progression Model
Follow the contract progression nodes for this game and enforce explicit recovery policy on MENU, PAUSED, GAME_OVER, and STUCK states.

## Pass Gates
Ring clear >=80%; life loss <=1.5/run; wrong-element hunts <15%.

## Operational Notes
- Use deterministic control priorities from the corresponding contract file.
- Prefer safety-first recovery when telemetry is ambiguous.
- Certification evidence is recorded under `MILADY_STATE_DIR/five55-mastery/runs/<runId>/`.
