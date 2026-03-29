import type {
  AliceOperatorActionName,
  EmoteCategory,
  EmoteInfo,
} from "@miladyai/app-core/api";
import type { Stream555LaunchMode } from "./stream555-setup";

export const ALICE_AVATAR_INDEX = 9;

export const ALICE_LIVE_ACTIONS: Array<{
  id: string;
  labelKey: string;
  defaultLabel: string;
  mode?: Stream555LaunchMode;
  action?: AliceOperatorActionName;
}> = [
  {
    id: "go-live",
    labelKey: "aliceoperator.action.goLive",
    defaultLabel: "Go Live",
    mode: "camera",
  },
  {
    id: "screen-share",
    labelKey: "aliceoperator.action.screenShare",
    defaultLabel: "Screen Share",
    mode: "screen-share",
  },
  {
    id: "play-games",
    labelKey: "aliceoperator.action.playGames",
    defaultLabel: "Play Games",
    mode: "play-games",
  },
  {
    id: "reaction",
    labelKey: "aliceoperator.action.reaction",
    defaultLabel: "Reaction",
    mode: "reaction",
  },
  {
    id: "radio",
    labelKey: "aliceoperator.action.radio",
    defaultLabel: "Radio",
    mode: "radio",
  },
  {
    id: "ads",
    labelKey: "aliceoperator.action.ads",
    defaultLabel: "Ads",
    action: "STREAM555_AD_CREATE",
  },
  {
    id: "invite-guest",
    labelKey: "aliceoperator.action.inviteGuest",
    defaultLabel: "Invite Guest",
    action: "STREAM555_GUEST_INVITE",
  },
  {
    id: "pip",
    labelKey: "aliceoperator.action.pip",
    defaultLabel: "PiP",
    action: "STREAM555_PIP_ENABLE",
  },
  {
    id: "earnings",
    labelKey: "aliceoperator.action.earnings",
    defaultLabel: "Earnings",
    action: "STREAM555_EARNINGS_ESTIMATE",
  },
  {
    id: "end-live",
    labelKey: "aliceoperator.action.endLive",
    defaultLabel: "End Live",
    action: "STREAM555_END_LIVE",
  },
];

export const ALICE_UTILITY_ACTIONS = [
  {
    id: "swap",
    labelKey: "aliceoperator.action.swap",
    defaultLabel: "Swap",
  },
  {
    id: "autonomous-run",
    labelKey: "aliceoperator.action.autonomousRun",
    defaultLabel: "Autonomous Run",
  },
] as const;

export const ALICE_EMOTE_GROUP_ORDER = [
  "movement",
  "gesture",
  "dance",
  "combat",
  "exercise",
  "idle",
] as const;

export type AliceEmoteGroup = (typeof ALICE_EMOTE_GROUP_ORDER)[number];

export const ALICE_EMOTE_GROUP_LABELS: Record<AliceEmoteGroup, string> = {
  movement: "Movement",
  gesture: "Gesture",
  dance: "Dance",
  combat: "Combat",
  exercise: "Exercise",
  idle: "Idle",
};

const PINNED_EMOTE_IDS = [
  "wave",
  "salute",
  "agreeing",
  "dance-happy",
  "gangnam-style",
  "thinking",
  "look-around",
];

function mapCategoryToGroup(category: EmoteCategory): AliceEmoteGroup | null {
  switch (category) {
    case "movement":
      return "movement";
    case "dance":
      return "dance";
    case "combat":
      return "combat";
    case "idle":
      return "idle";
    case "greeting":
    case "emotion":
    case "gesture":
      return "gesture";
    default:
      return null;
  }
}

export function getPinnedStageEmotes(emotes: EmoteInfo[]): EmoteInfo[] {
  return PINNED_EMOTE_IDS.map((id) => emotes.find((emote) => emote.id === id)).filter(
    (emote): emote is EmoteInfo => emote != null,
  );
}

export function groupStageEmotes(emotes: EmoteInfo[]): Array<{
  group: AliceEmoteGroup;
  emotes: EmoteInfo[];
}> {
  const pinned = new Set(PINNED_EMOTE_IDS);
  const grouped = new Map<AliceEmoteGroup, EmoteInfo[]>();
  for (const group of ALICE_EMOTE_GROUP_ORDER) {
    grouped.set(group, []);
  }
  for (const emote of emotes) {
    if (pinned.has(emote.id)) continue;
    const group = mapCategoryToGroup(emote.category);
    if (!group) continue;
    grouped.get(group)?.push(emote);
  }

  return ALICE_EMOTE_GROUP_ORDER.map((group) => ({
    group,
    emotes: (grouped.get(group) ?? []).sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
  })).filter((entry) => entry.emotes.length > 0);
}
