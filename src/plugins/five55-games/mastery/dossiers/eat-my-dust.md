# eat-my-dust Mastery Dossier

## Objective
Typing race with phrase progression and energy economy.

## Controls
Typing keys, Space start, Enter story select.

## Progression Model
Follow the contract progression nodes for this game and enforce explicit recovery policy on MENU, PAUSED, GAME_OVER, and STUCK states.

## Pass Gates
Accuracy >=99.2%; time <=0.75x baseline; energy failures <5%.

## Operational Notes
- Use deterministic control priorities from the corresponding contract file.
- Prefer safety-first recovery when telemetry is ambiguous.
- Certification evidence is recorded under `MILADY_STATE_DIR/five55-mastery/runs/<runId>/`.
