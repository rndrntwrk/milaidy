export const FIVE55_RUNTIME_IDENTITY = Object.freeze({
  id: "five55-platform",
  handle: "@five55",
  displayName: "555 Platform",
  runtime: "milaidy",
  policyVersion: "2026-03-28",
});

export type Five55Capability =
  | "games.play"
  | "games.observe"
  | "stream.control";

export type Five55CapabilityDecision = "allow" | "deny";

export interface Five55CapabilityPolicy {
  readonly subject: typeof FIVE55_RUNTIME_IDENTITY.id;
  readonly version: string;
  readonly grants: ReadonlySet<Five55Capability>;
  readonly denies: ReadonlySet<Five55Capability>;
  decide(capability: Five55Capability): Five55CapabilityDecision;
  can(capability: Five55Capability): boolean;
}

const DEFAULT_GRANTS: ReadonlyArray<Five55Capability> = [
  "games.play",
  "games.observe",
  "stream.control",
];

export interface Five55CapabilityPolicyOverrides {
  grants?: ReadonlyArray<Five55Capability>;
  denies?: ReadonlyArray<Five55Capability>;
  version?: string;
}

function toCapabilitySet(
  values: ReadonlyArray<Five55Capability> | undefined,
): ReadonlySet<Five55Capability> {
  return new Set(values ?? []);
}

export function createFive55CapabilityPolicy(
  overrides: Five55CapabilityPolicyOverrides = {},
): Five55CapabilityPolicy {
  const grants = toCapabilitySet(overrides.grants ?? DEFAULT_GRANTS);
  const denies = toCapabilitySet(overrides.denies ?? []);

  return {
    subject: FIVE55_RUNTIME_IDENTITY.id,
    version: overrides.version ?? FIVE55_RUNTIME_IDENTITY.policyVersion,
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
