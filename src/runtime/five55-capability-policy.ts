/**
 * Five55 platform runtime identity + capability policy.
 *
 * Generalized policy for 555 ecosystem surfaces (not persona-specific).
 */

export const FIVE55_RUNTIME_IDENTITY = Object.freeze({
  id: "five55-platform",
  handle: "@five55",
  displayName: "555 Platform",
  runtime: "milaidy",
  policyVersion: "2026-02-17",
});

export type Five55Capability =
  | "chat.transport"
  | "theme.read"
  | "theme.write"
  | "games.play"
  | "games.observe"
  | "games.capture_score"
  | "games.submit_score"
  | "leaderboard.read"
  | "leaderboard.write"
  | "quests.read"
  | "quests.create"
  | "quests.complete"
  | "battles.read"
  | "battles.create"
  | "battles.resolve"
  | "social.monitor"
  | "social.assign_points"
  | "rewards.project"
  | "rewards.allocate"
  | "wallet.read_balance"
  | "wallet.prepare_transfer"
  | "stream.read"
  | "stream.control";

export type Five55CapabilityDecision = "allow" | "deny";
export type Five55LaunchProfile = "prelaunch" | "launch" | "postlaunch";

export interface Five55CapabilityPolicy {
  readonly subject: typeof FIVE55_RUNTIME_IDENTITY.id;
  readonly version: string;
  readonly grants: ReadonlySet<Five55Capability>;
  readonly denies: ReadonlySet<Five55Capability>;
  decide(capability: Five55Capability): Five55CapabilityDecision;
  can(capability: Five55Capability): boolean;
}

const DEFAULT_GRANTS: ReadonlyArray<Five55Capability> = [
  "chat.transport",
  "theme.read",
  "theme.write",
  "games.play",
  "games.observe",
  "games.capture_score",
  "games.submit_score",
  "leaderboard.read",
  "leaderboard.write",
  "quests.read",
  "quests.create",
  "quests.complete",
  "battles.read",
  "battles.create",
  "battles.resolve",
  "social.monitor",
  "social.assign_points",
  "rewards.project",
  "wallet.read_balance",
  "stream.read",
  "stream.control",
];

const PRELAUNCH_DENIES: ReadonlyArray<Five55Capability> = [
  "rewards.allocate",
  "wallet.prepare_transfer",
];
const LAUNCH_DENIES: ReadonlyArray<Five55Capability> = ["rewards.allocate"];
const POSTLAUNCH_DENIES: ReadonlyArray<Five55Capability> = [];

function toCapabilitySet(
  values: ReadonlyArray<Five55Capability> | undefined,
): ReadonlySet<Five55Capability> {
  return new Set(values ?? []);
}

export interface Five55CapabilityPolicyOverrides {
  grants?: ReadonlyArray<Five55Capability>;
  denies?: ReadonlyArray<Five55Capability>;
  version?: string;
  profile?: Five55LaunchProfile;
}

function parseLaunchProfile(
  value: string | undefined,
): Five55LaunchProfile | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "prelaunch") return "prelaunch";
  if (normalized === "launch") return "launch";
  if (normalized === "postlaunch") return "postlaunch";
  return undefined;
}

function resolveLaunchProfile(
  overrides: Five55CapabilityPolicyOverrides,
): Five55LaunchProfile {
  return (
    overrides.profile ??
    parseLaunchProfile(process.env.FIVE55_LAUNCH_PROFILE) ??
    parseLaunchProfile(process.env.FIVE55_POLICY_PROFILE) ??
    "prelaunch"
  );
}

function defaultDeniesForProfile(
  profile: Five55LaunchProfile,
): ReadonlyArray<Five55Capability> {
  if (profile === "postlaunch") return POSTLAUNCH_DENIES;
  if (profile === "launch") return LAUNCH_DENIES;
  return PRELAUNCH_DENIES;
}

export function createFive55CapabilityPolicy(
  overrides: Five55CapabilityPolicyOverrides = {},
): Five55CapabilityPolicy {
  const profile = resolveLaunchProfile(overrides);
  const grants = toCapabilitySet(overrides.grants ?? DEFAULT_GRANTS);
  const denies = toCapabilitySet(
    overrides.denies ?? defaultDeniesForProfile(profile),
  );

  return {
    subject: FIVE55_RUNTIME_IDENTITY.id,
    version:
      overrides.version ??
      `${FIVE55_RUNTIME_IDENTITY.policyVersion}:${profile}`,
    grants,
    denies,
    decide(capability: Five55Capability): Five55CapabilityDecision {
      if (denies.has(capability)) return "deny";
      return grants.has(capability) ? "allow" : "deny";
    },
    can(capability: Five55Capability): boolean {
      return this.decide(capability) === "allow";
    },
  };
}

export function assertFive55Capability(
  policy: Five55CapabilityPolicy,
  capability: Five55Capability,
): void {
  if (!policy.can(capability)) {
    throw new Error(
      `five55 capability denied: ${capability} (policy=${policy.version})`,
    );
  }
}
