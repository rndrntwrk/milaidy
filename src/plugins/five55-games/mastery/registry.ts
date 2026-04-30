import {
  canonicalizeMasteryGameId,
  listCanonicalMasteryGameIds,
  tryCanonicalizeMasteryGameId,
  type CanonicalMasteryGameId,
} from "./aliases.js";
import type { Five55MasteryContract } from "./types.js";
import { STRICT_CONTRACT_OVERRIDES } from "./strict-overrides.js";
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

function mergeContract(
  contract: Five55MasteryContract,
  override: {
    objective?: Partial<Five55MasteryContract["objective"]>;
    passGates?: Five55MasteryContract["passGates"];
    gateV2?: Partial<Five55MasteryContract["gateV2"]>;
    notesAppend?: string[];
  },
): Five55MasteryContract {
  const mergedPassGates = override.passGates ?? contract.passGates;
  const mergedTruthChecks = {
    ...contract.gateV2.truthChecks,
    ...(override.gateV2?.truthChecks ?? {}),
  };
  const mergedNotes = [
    ...(Array.isArray(contract.notes) ? contract.notes : []),
    ...(Array.isArray(override.notesAppend) ? override.notesAppend : []),
  ];

  return {
    ...contract,
    objective: {
      ...contract.objective,
      ...(override.objective ?? {}),
    },
    passGates: mergedPassGates,
    gateV2: {
      ...contract.gateV2,
      ...(override.gateV2 ?? {}),
      runtimeGates:
        override.gateV2?.runtimeGates ??
        override.passGates ??
        contract.gateV2.runtimeGates,
      truthChecks: mergedTruthChecks,
      disallowedEvidence:
        override.gateV2?.disallowedEvidence ?? contract.gateV2.disallowedEvidence,
    },
    notes: mergedNotes.length > 0 ? mergedNotes : contract.notes,
  };
}

function applyStrictOverride(contract: Five55MasteryContract): Five55MasteryContract {
  const override = STRICT_CONTRACT_OVERRIDES[contract.gameId];
  if (!override) return contract;
  return mergeContract(contract, override);
}

const BY_ID = new Map<string, Five55MasteryContract>(
  CONTRACTS.map((contract) => {
    const merged = applyStrictOverride(contract);
    return [merged.gameId, Object.freeze(merged)];
  }),
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
  for (const contract of BY_ID.values()) {
    out[contract.gameId] = contract;
  }
  return out;
}
