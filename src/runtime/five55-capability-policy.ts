/**
 * @deprecated Use ./surface555-capability-policy.js.
 */

export {
  SURFACE555_RUNTIME_IDENTITY as FIVE55_RUNTIME_IDENTITY,
  assertSurface555Capability as assertFive55Capability,
  createSurface555CapabilityPolicy as createFive55CapabilityPolicy,
} from "./surface555-capability-policy.js";

export type {
  Surface555Capability as Five55Capability,
  Surface555CapabilityDecision as Five55CapabilityDecision,
  Surface555CapabilityPolicy as Five55CapabilityPolicy,
  Surface555CapabilityPolicyOverrides as Five55CapabilityPolicyOverrides,
  Surface555LaunchProfile as Five55LaunchProfile,
} from "./surface555-capability-policy.js";
