# chesspursuit Mastery Dossier

## Objective
Chess-threat escape puzzle progression.

## Controls
Arrows/WASD, Space start, Enter pause.

## Progression Model
Follow the contract progression nodes for this game and enforce explicit recovery policy on MENU, PAUSED, GAME_OVER, and STUCK states.

## Pass Gates
Completion >=85%; fatal threat violations <5%; pause correctness 100%.

## Operational Notes
- Use deterministic control priorities from the corresponding contract file.
- Prefer safety-first recovery when telemetry is ambiguous.
- Certification evidence is recorded under `MILADY_STATE_DIR/five55-mastery/runs/<runId>/`.
