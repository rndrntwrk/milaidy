/**
 * Surface555 platform runtime identity + capability policy.
 *
 * Generalized policy for 555 ecosystem surfaces owned by Milaidy.
 */

export const SURFACE555_RUNTIME_IDENTITY = Object.freeze({
  id: "surface555-platform",
  handle: "@surface555",
  displayName: "Surface555 Platform",
  runtime: "milaidy",
  policyVersion: "2026-02-17",
});

export type Surface555Capability =
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

export type Surface555CapabilityDecision = "allow" | "deny";
export type Surface555LaunchProfile = "prelaunch" | "launch" | "postlaunch";

export interface Surface555CapabilityPolicy {
  readonly subject: typeof SURFACE555_RUNTIME_IDENTITY.id;
  readonly version: string;
  readonly grants: ReadonlySet<Surface555Capability>;
  readonly denies: ReadonlySet<Surface555Capability>;
  decide(capability: Surface555Capability): Surface555CapabilityDecision;
  can(capability: Surface555Capability): boolean;
}

const DEFAULT_GRANTS: ReadonlyArray<Surface555Capability> = [
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

const PRELAUNCH_DENIES: ReadonlyArray<Surface555Capability> = [
  "rewards.allocate",
  "wallet.prepare_transfer",
];
const LAUNCH_DENIES: ReadonlyArray<Surface555Capability> = ["rewards.allocate"];
const POSTLAUNCH_DENIES: ReadonlyArray<Surface555Capability> = [];

function toCapabilitySet(
  values: ReadonlyArray<Surface555Capability> | undefined,
): ReadonlySet<Surface555Capability> {
  return new Set(values ?? []);
}

export interface Surface555CapabilityPolicyOverrides {
  grants?: ReadonlyArray<Surface555Capability>;
  denies?: ReadonlyArray<Surface555Capability>;
  version?: string;
  profile?: Surface555LaunchProfile;
}

function parseLaunchProfile(
  value: string | undefined,
): Surface555LaunchProfile | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "prelaunch") return "prelaunch";
  if (normalized === "launch") return "launch";
  if (normalized === "postlaunch") return "postlaunch";
  return undefined;
}

function resolveLaunchProfile(
  overrides: Surface555CapabilityPolicyOverrides,
): Surface555LaunchProfile {
  return (
    overrides.profile ??
    parseLaunchProfile(process.env.SURFACE555_LAUNCH_PROFILE) ??
    parseLaunchProfile(process.env.SURFACE555_POLICY_PROFILE) ??
    parseLaunchProfile(process.env.FIVE55_LAUNCH_PROFILE) ??
    parseLaunchProfile(process.env.FIVE55_POLICY_PROFILE) ??
    "prelaunch"
  );
}

function defaultDeniesForProfile(
  profile: Surface555LaunchProfile,
): ReadonlyArray<Surface555Capability> {
  if (profile === "postlaunch") return POSTLAUNCH_DENIES;
  if (profile === "launch") return LAUNCH_DENIES;
  return PRELAUNCH_DENIES;
}

export function createSurface555CapabilityPolicy(
  overrides: Surface555CapabilityPolicyOverrides = {},
): Surface555CapabilityPolicy {
  const profile = resolveLaunchProfile(overrides);
  const grants = toCapabilitySet(overrides.grants ?? DEFAULT_GRANTS);
  const denies = toCapabilitySet(
    overrides.denies ?? defaultDeniesForProfile(profile),
  );

  return {
    subject: SURFACE555_RUNTIME_IDENTITY.id,
    version:
      overrides.version ??
      `${SURFACE555_RUNTIME_IDENTITY.policyVersion}:${profile}`,
    grants,
    denies,
    decide(capability: Surface555Capability): Surface555CapabilityDecision {
      if (denies.has(capability)) return "deny";
      return grants.has(capability) ? "allow" : "deny";
    },
    can(capability: Surface555Capability): boolean {
      return this.decide(capability) === "allow";
    },
  };
}

export function assertSurface555Capability(
  policy: Surface555CapabilityPolicy,
  capability: Surface555Capability,
): void {
  if (!policy.can(capability)) {
    throw new Error(
      `surface555 capability denied: ${capability} (policy=${policy.version})`,
    );
  }
}
