import {
  canonicalizeMasteryGameId,
  listCanonicalMasteryGameIds,
  tryCanonicalizeMasteryGameId,
  type CanonicalMasteryGameId,
} from "./aliases.js";
import type { Five55MasteryContract } from "./types.js";
import { chesspursuitMasteryContract } from "./contracts/chesspursuit.js";
import { clawstrikeMasteryContract } from "./contracts/clawstrike.js";
import { drive555MasteryContract } from "./contracts/drive555.js";
import { eatMyDustMasteryContract } from "./contracts/eat-my-dust.js";
import { fighterPlanesMasteryContract } from "./contracts/fighter-planes.js";
import { floor13MasteryContract } from "./contracts/floor13.js";
import { godaiIsBackMasteryContract } from "./contracts/godai-is-back.js";
import { knighthoodMasteryContract } from "./contracts/knighthood.js";
import { leftAndRightMasteryContract } from "./contracts/leftandright.js";
import { ninjaMasteryContract } from "./contracts/ninja.js";
import { peanballMasteryContract } from "./contracts/peanball.js";
import { playbackMasteryContract } from "./contracts/playback.js";
import { sector13MasteryContract } from "./contracts/sector-13.js";
import { vedasRunMasteryContract } from "./contracts/vedas-run.js";
import { roadsMasteryContract } from "./contracts/where-were-going-we-do-need-roads.js";
import { wolfAndSheepMasteryContract } from "./contracts/wolf-and-sheep.js";

const CONTRACTS: Five55MasteryContract[] = [
  knighthoodMasteryContract,
  sector13MasteryContract,
  ninjaMasteryContract,
  clawstrikeMasteryContract,
  drive555MasteryContract,
  chesspursuitMasteryContract,
  wolfAndSheepMasteryContract,
  leftAndRightMasteryContract,
  playbackMasteryContract,
  fighterPlanesMasteryContract,
  floor13MasteryContract,
  godaiIsBackMasteryContract,
  peanballMasteryContract,
  eatMyDustMasteryContract,
  roadsMasteryContract,
  vedasRunMasteryContract,
];

const BY_ID = new Map<string, Five55MasteryContract>(
  CONTRACTS.map((contract) => [contract.gameId, Object.freeze(contract)]),
);

export function listMasteryContracts(): Five55MasteryContract[] {
  return listCanonicalMasteryGameIds()
    .map((gameId) => BY_ID.get(gameId))
    .filter((entry): entry is Five55MasteryContract => Boolean(entry));
}

export function resolveMasteryGameOrder(inputGames: string[]): CanonicalMasteryGameId[] {
  if (!Array.isArray(inputGames) || inputGames.length === 0) {
    return listCanonicalMasteryGameIds();
  }
  const seen = new Set<CanonicalMasteryGameId>();
  const ordered: CanonicalMasteryGameId[] = [];
  for (const rawGameId of inputGames) {
    const normalized = canonicalizeMasteryGameId(String(rawGameId || ""));
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    ordered.push(normalized);
  }
  return ordered;
}

export function getMasteryContract(gameId: string): Five55MasteryContract {
  const canonicalGameId = canonicalizeMasteryGameId(gameId);
  const contract = BY_ID.get(canonicalGameId);
  if (!contract) {
    throw new Error(`Mastery contract not found for gameId \"${canonicalGameId}\"`);
  }
  return contract;
}

export function getMasteryContractOrNull(gameId: string): Five55MasteryContract | null {
  const canonicalGameId = tryCanonicalizeMasteryGameId(gameId);
  if (!canonicalGameId) return null;
  return BY_ID.get(canonicalGameId) ?? null;
}

export function getMasteryContractsById(): Record<string, Five55MasteryContract> {
  const out: Record<string, Five55MasteryContract> = {};
  for (const contract of CONTRACTS) {
    out[contract.gameId] = contract;
  }
  return out;
}
