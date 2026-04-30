# floor13 Mastery Dossier

## Objective
Top-down floor progression with combat and loot.

## Controls
Arrows move, X fire, C reload, V pick, Space retry.

## Progression Model
Follow the contract progression nodes for this game and enforce explicit recovery policy on MENU, PAUSED, GAME_OVER, and STUCK states.

## Pass Gates
Exit success >=85%; ammo starvation <10%; early deaths <25%.

## Operational Notes
- Use deterministic control priorities from the corresponding contract file.
- Prefer safety-first recovery when telemetry is ambiguous.
- Certification evidence is recorded under `MILADY_STATE_DIR/five55-mastery/runs/<runId>/`.
