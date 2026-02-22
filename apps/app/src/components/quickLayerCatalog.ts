export type QuickLayerId =
  | "stream"
  | "go-live"
  | "autonomous-run"
  | "screen-share"
  | "ads"
  | "invite-guest"
  | "radio"
  | "pip"
  | "reaction-segment"
  | "earnings"
  | "play-games"
  | "swap"
  | "end-live";

export type QuickLayerDefinition = {
  id: QuickLayerId;
  label: string;
  prompt: string;
  pluginIds: string[];
  navigateToApps?: boolean;
};

export type QuickLayerDockEntry = Pick<
  QuickLayerDefinition,
  "id" | "label" | "pluginIds"
>;

export const QUICK_LAYER_CATALOG: readonly QuickLayerDefinition[] = [
  {
    id: "stream",
    label: "Stream",
    pluginIds: ["stream"],
    prompt:
      "Use STREAM_STATUS and STREAM_CONTROL to report current stream state and execute the next stream action safely.",
  },
  {
    id: "go-live",
    label: "Go Live",
    pluginIds: ["stream555-control"],
    prompt:
      "Use STREAM555_GO_LIVE then STREAM555_GO_LIVE_SEGMENTS so the stream starts with segment orchestration active, then summarize live state and next production move.",
  },
  {
    id: "autonomous-run",
    label: "Autonomous",
    pluginIds: ["stream"],
    prompt: "",
  },
  {
    id: "screen-share",
    label: "Screen Share",
    pluginIds: ["stream555-control"],
    prompt:
      "Use STREAM555_SCREEN_SHARE to switch the current live feed to screen-sharing and confirm the stream remains live.",
  },
  {
    id: "ads",
    label: "Ads",
    pluginIds: ["stream555-control"],
    prompt:
      "Create and trigger an ad break, then summarize ad playback state and expected payout impact.",
  },
  {
    id: "invite-guest",
    label: "Invite Guest",
    pluginIds: ["stream555-control"],
    prompt:
      "Create a guest invite and report the invite link with host-side instructions.",
  },
  {
    id: "radio",
    label: "Radio",
    pluginIds: ["stream555-control"],
    prompt:
      "Configure radio mode and summarize current live audio blend decisions.",
  },
  {
    id: "pip",
    label: "PiP",
    pluginIds: ["stream555-control"],
    prompt: "Enable PiP composition and confirm the active scene is updated.",
  },
  {
    id: "reaction-segment",
    label: "Reaction",
    pluginIds: ["stream555-control"],
    prompt:
      "Ensure segment orchestration is active, queue a reaction segment override, then announce the next reaction topic.",
  },
  {
    id: "earnings",
    label: "Earnings",
    pluginIds: ["stream555-control"],
    prompt:
      "Evaluate marketplace payouts and report projected earnings opportunities for the next segment.",
  },
  {
    id: "play-games",
    label: "Play Games",
    pluginIds: ["five55-games"],
    navigateToApps: true,
    prompt:
      "Use FIVE55_GAMES_CATALOG to choose a playable game and run FIVE55_GAMES_PLAY in autonomous spectate mode (bot=true). Continue live commentary with score/capture updates.",
  },
  {
    id: "swap",
    label: "Swap",
    pluginIds: ["swap"],
    prompt:
      "Use WALLET_POSITION and SWAP_QUOTE to evaluate wallet state and produce a safe swap recommendation.",
  },
  {
    id: "end-live",
    label: "End Live",
    pluginIds: ["stream555-control"],
    prompt:
      "Stop the stream and provide a concise post-live summary with next recommended action.",
  },
];

export const QUICK_LAYER_DOCK: readonly QuickLayerDockEntry[] =
  QUICK_LAYER_CATALOG.map(({ id, label, pluginIds }) => ({
    id,
    label,
    pluginIds,
  }));
