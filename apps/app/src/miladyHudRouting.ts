export const APPS_ENABLED = import.meta.env.DEV;

export type Tab =
  | "chat"
  | "apps"
  | "character"
  | "wallets"
  | "knowledge"
  | "connectors"
  | "triggers"
  | "plugins"
  | "skills"
  | "actions"
  | "advanced"
  | "fine-tuning"
  | "trajectories"
  | "runtime"
  | "database"
  | "settings"
  | "logs"
  | "identity"
  | "approvals"
  | "safe-mode"
  | "governance"
  | "security";

export type HudControlSection =
  | "settings"
  | "apps"
  | "advanced"
  | "plugins-connectors"
  | "custom-actions"
  | "triggers"
  | "identity"
  | "approvals"
  | "safe-mode"
  | "governance"
  | "fine-tuning"
  | "trajectories"
  | "runtime"
  | "database"
  | "logs"
  | "security";

export type HudAssetSection = "character" | "wallets" | "identity";

export interface HudRoutingOptions {
  appsEnabled?: boolean;
}

export interface HudControlSectionMeta {
  id: HudControlSection;
  label: string;
  copy: string;
  defaultTab: Tab;
  order: number;
  enabled: boolean;
}

interface HudControlSectionSeed
  extends Omit<HudControlSectionMeta, "enabled"> {
  requiresApps?: boolean;
}

const CONTROL_STACK_SECTION_SEEDS: readonly HudControlSectionSeed[] = [
  {
    id: "settings",
    label: "Settings",
    copy: "Master preferences, model defaults, and runtime-wide behavior.",
    defaultTab: "settings",
    order: 0,
  },
  {
    id: "apps",
    label: "Apps",
    copy: "Launch and inspect installed surfaces without leaving the dashboard.",
    defaultTab: "apps",
    order: 1,
    requiresApps: true,
  },
  {
    id: "advanced",
    label: "Advanced",
    copy: "Deep operator controls routed into one route-less overlay.",
    defaultTab: "advanced",
    order: 2,
  },
  {
    id: "plugins-connectors",
    label: "Plugins & Connectors",
    copy: "Connector state, plugin health, and external service wiring.",
    defaultTab: "plugins",
    order: 3,
  },
  {
    id: "custom-actions",
    label: "Custom Actions",
    copy: "Curated quick actions and automations that can be triggered from the HUD.",
    defaultTab: "actions",
    order: 4,
  },
  {
    id: "triggers",
    label: "Triggers",
    copy: "Schedules, recurring workflows, and trigger execution controls.",
    defaultTab: "triggers",
    order: 5,
  },
  {
    id: "identity",
    label: "Identity",
    copy: "Persona, identity, and profile configuration.",
    defaultTab: "identity",
    order: 6,
  },
  {
    id: "approvals",
    label: "Approvals",
    copy: "Human-in-the-loop requests and mission review.",
    defaultTab: "approvals",
    order: 7,
  },
  {
    id: "safe-mode",
    label: "Safe Mode",
    copy: "Safety posture, guardrails, and constrained execution settings.",
    defaultTab: "safe-mode",
    order: 8,
  },
  {
    id: "governance",
    label: "Governance",
    copy: "Policies, governance controls, and operational rules.",
    defaultTab: "governance",
    order: 9,
  },
  {
    id: "fine-tuning",
    label: "Fine-Tuning",
    copy: "Advanced tuning surfaces for behavior and model calibration.",
    defaultTab: "fine-tuning",
    order: 10,
  },
  {
    id: "trajectories",
    label: "Trajectories",
    copy: "Trajectory inspection and cognitive trace analysis.",
    defaultTab: "trajectories",
    order: 11,
  },
  {
    id: "runtime",
    label: "Runtime",
    copy: "Runtime health, process state, and execution diagnostics.",
    defaultTab: "runtime",
    order: 12,
  },
  {
    id: "database",
    label: "Database",
    copy: "Database browser, vector memory, and document stores.",
    defaultTab: "database",
    order: 13,
  },
  {
    id: "logs",
    label: "Logs",
    copy: "Structured logs, telemetry, and stream diagnostics.",
    defaultTab: "logs",
    order: 14,
  },
  {
    id: "security",
    label: "Security",
    copy: "Security audit stream and channel trust state.",
    defaultTab: "security",
    order: 15,
  },
] as const;

function resolveAppsEnabled(options?: HudRoutingOptions): boolean {
  return options?.appsEnabled ?? APPS_ENABLED;
}

function createControlSectionMeta(
  seed: HudControlSectionSeed,
  options?: HudRoutingOptions,
): HudControlSectionMeta {
  return {
    id: seed.id,
    label: seed.label,
    copy: seed.copy,
    defaultTab: seed.defaultTab,
    order: seed.order,
    enabled: seed.requiresApps ? resolveAppsEnabled(options) : true,
  };
}

export function getControlStackSections(
  options?: HudRoutingOptions,
): HudControlSectionMeta[] {
  return CONTROL_STACK_SECTION_SEEDS.map((seed) =>
    createControlSectionMeta(seed, options),
  ).filter((section) => section.enabled);
}

export function getControlStackSectionMeta(
  section: HudControlSection,
  options?: HudRoutingOptions,
): HudControlSectionMeta {
  const seed =
    CONTROL_STACK_SECTION_SEEDS.find((entry) => entry.id === section) ??
    CONTROL_STACK_SECTION_SEEDS[0];
  const meta = createControlSectionMeta(seed, options);
  if (meta.enabled) return meta;
  return createControlSectionMeta(CONTROL_STACK_SECTION_SEEDS[0], options);
}

export function isTabEnabled(
  tab: Tab,
  options?: HudRoutingOptions,
): boolean {
  return tab !== "apps" || resolveAppsEnabled(options);
}

export function isControlSectionEnabled(
  section: HudControlSection,
  options?: HudRoutingOptions,
): boolean {
  return getControlStackSectionMeta(section, options).id === section;
}

export function sanitizeControlSection(
  section?: HudControlSection | null,
  options?: HudRoutingOptions,
): HudControlSection {
  if (!section) return "settings";
  return isControlSectionEnabled(section, options) ? section : "settings";
}

export function defaultTabForControlSection(
  section: HudControlSection,
  options?: HudRoutingOptions,
): Tab {
  return getControlStackSectionMeta(section, options).defaultTab;
}

export function controlSectionForTab(
  tab: Tab,
  options?: HudRoutingOptions,
): HudControlSection | null {
  if (!isTabEnabled(tab, options)) return null;
  switch (tab) {
    case "settings":
      return "settings";
    case "apps":
      return "apps";
    case "advanced":
      return "advanced";
    case "connectors":
    case "plugins":
    case "skills":
      return "plugins-connectors";
    case "actions":
      return "custom-actions";
    case "triggers":
      return "triggers";
    case "identity":
      return "identity";
    case "approvals":
      return "approvals";
    case "safe-mode":
      return "safe-mode";
    case "governance":
      return "governance";
    case "fine-tuning":
      return "fine-tuning";
    case "trajectories":
      return "trajectories";
    case "runtime":
      return "runtime";
    case "database":
      return "database";
    case "logs":
      return "logs";
    case "security":
      return "security";
    default:
      return null;
  }
}

export function assetVaultSectionForTab(
  tab: Tab,
): HudAssetSection | null {
  switch (tab) {
    case "character":
      return "character";
    case "wallets":
      return "wallets";
    case "identity":
      return "identity";
    default:
      return null;
  }
}
