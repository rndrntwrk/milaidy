export const CANONICAL_MASTERY_GAME_IDS = [
  "knighthood",
  "sector-13",
  "ninja",
  "clawstrike",
  "555drive",
  "chesspursuit",
  "wolf-and-sheep",
  "leftandright",
  "playback",
  "fighter-planes",
  "floor13",
  "godai-is-back",
  "peanball",
  "eat-my-dust",
  "where-were-going-we-do-need-roads",
  "vedas-run",
] as const;

export type CanonicalMasteryGameId = (typeof CANONICAL_MASTERY_GAME_IDS)[number];

const ALIAS_MAP: Record<string, CanonicalMasteryGameId> = {
  // canonical
  "knighthood": "knighthood",
  "sector-13": "sector-13",
  "ninja": "ninja",
  "clawstrike": "clawstrike",
  "555drive": "555drive",
  "chesspursuit": "chesspursuit",
  "wolf-and-sheep": "wolf-and-sheep",
  "leftandright": "leftandright",
  "playback": "playback",
  "fighter-planes": "fighter-planes",
  "floor13": "floor13",
  "godai-is-back": "godai-is-back",
  "peanball": "peanball",
  "eat-my-dust": "eat-my-dust",
  "where-were-going-we-do-need-roads": "where-were-going-we-do-need-roads",
  "vedas-run": "vedas-run",

  // known aliases from catalog/source history
  "ninja-evilcorp": "ninja",
  "ninja_vs_evilcorp": "ninja",
  "ninja-vs-evilcorp": "ninja",
  "ninja-vs-evilcorp-master": "ninja",
  "knighthood_main": "knighthood",
  "knighthood-main": "knighthood",
  "sector13": "sector-13",
  "sector_13": "sector-13",
  "sector-13-main": "sector-13",
  "fighter_planes": "fighter-planes",
  "fighterplanes": "fighter-planes",
  "godai": "godai-is-back",
  "godai_is_back": "godai-is-back",
  "eat_my_dust": "eat-my-dust",
  "roads": "where-were-going-we-do-need-roads",
  "where-were-going": "where-were-going-we-do-need-roads",
  "where_were_going": "where-were-going-we-do-need-roads",
  "vedasrun": "vedas-run",
  "vedas_run": "vedas-run",
  "wolfandsheep": "wolf-and-sheep",
  "wolf_and_sheep": "wolf-and-sheep",
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

export function listCanonicalMasteryGameIds(): CanonicalMasteryGameId[] {
  return [...CANONICAL_MASTERY_GAME_IDS];
}

export function isCanonicalMasteryGameId(value: string): value is CanonicalMasteryGameId {
  return CANONICAL_MASTERY_GAME_IDS.includes(value as CanonicalMasteryGameId);
}

export function canonicalizeMasteryGameId(input: string): CanonicalMasteryGameId {
  const normalized = normalizeKey(String(input || ""));
  const resolved = ALIAS_MAP[normalized];
  if (!resolved) {
    throw new Error(
      `Unknown mastery gameId \"${input}\". Expected one of: ${CANONICAL_MASTERY_GAME_IDS.join(", ")}`,
    );
  }
  return resolved;
}

export function tryCanonicalizeMasteryGameId(input: string): CanonicalMasteryGameId | null {
  const normalized = normalizeKey(String(input || ""));
  return ALIAS_MAP[normalized] ?? null;
}
