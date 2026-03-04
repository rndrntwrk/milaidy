# knighthood Mastery Dossier

## Objective
Side-scrolling survival/combat run.

## Controls
A/D move, W jump, Space attack, Enter pause.

## Progression Model
Follow the contract progression nodes for this game and enforce explicit recovery policy on MENU, PAUSED, GAME_OVER, and STUCK states.

## Pass Gates
p50 survival >=90s; spike+gap death share <=20%; restart reliability >=99%.

## Operational Notes
- Use deterministic control priorities from the corresponding contract file.
- Prefer safety-first recovery when telemetry is ambiguous.
- Certification evidence is recorded under `MILADY_STATE_DIR/five55-mastery/runs/<runId>/`.
