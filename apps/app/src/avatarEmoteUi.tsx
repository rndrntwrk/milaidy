import type { ComponentType, SVGProps } from "react";
import type {
  AvatarEmoteDef,
  EmoteDrawerGroup,
} from "./api-client";
import {
  ActivityIcon,
  AlertIcon,
  CloudIcon,
  EyeIcon,
  FistIcon,
  HandIcon,
  HeartIcon,
  HookIcon,
  LightningIcon,
  PauseIcon,
  RestartIcon,
  SkullIcon,
  SparkIcon,
  TargetIcon,
  TearIcon,
  ThreadsIcon,
} from "./components/ui/Icons";

export type AvatarEmoteIcon = ComponentType<SVGProps<SVGSVGElement>>;

export const AVATAR_EMOTE_GROUP_ORDER: EmoteDrawerGroup[] = [
  "movement",
  "gesture",
  "dance",
  "combat",
  "exercise",
  "idle",
];

export const AVATAR_EMOTE_GROUP_LABELS: Record<EmoteDrawerGroup, string> = {
  movement: "Movement",
  gesture: "Gesture",
  dance: "Dance",
  combat: "Combat",
  exercise: "Exercise",
  idle: "Idle",
};

export const AVATAR_EMOTE_GROUP_ICONS: Record<EmoteDrawerGroup, AvatarEmoteIcon> =
  {
    movement: ActivityIcon,
    gesture: HandIcon,
    dance: SparkIcon,
    combat: FistIcon,
    exercise: LightningIcon,
    idle: PauseIcon,
  };

const EMOTE_ICON_BY_ID: Record<string, AvatarEmoteIcon> = {
  wave: HandIcon,
  kiss: HeartIcon,
  crying: TearIcon,
  sorrow: TearIcon,
  "rude-gesture": HandIcon,
  "looking-around": EyeIcon,
  "dance-happy": SparkIcon,
  "dance-breaking": ActivityIcon,
  "dance-hiphop": ActivityIcon,
  "dance-popping": SparkIcon,
  "hook-punch": FistIcon,
  punching: FistIcon,
  "firing-gun": TargetIcon,
  "sword-swing": TargetIcon,
  chopping: FistIcon,
  "spell-cast": SparkIcon,
  range: TargetIcon,
  death: SkullIcon,
  idle: PauseIcon,
  talk: ThreadsIcon,
  squat: ActivityIcon,
  fishing: HookIcon,
  float: CloudIcon,
  jump: LightningIcon,
  flip: RestartIcon,
  run: ActivityIcon,
  walk: ActivityIcon,
  crawling: ActivityIcon,
  fall: AlertIcon,
  walking: ActivityIcon,
  "casual-walk": ActivityIcon,
  running: LightningIcon,
  backflip: RestartIcon,
  "power-spin-jump": SparkIcon,
  "big-heart-gesture": HeartIcon,
  "cheer-both-hands-01": HandIcon,
  "all-night-dance": SparkIcon,
  "breakdance-1990": ActivityIcon,
  "cherish-pop-dance": SparkIcon,
  "angry-ground-stomp-01": AlertIcon,
  "angry-stomp": FistIcon,
  "head-down-charge": TargetIcon,
  "circle-crunch": ActivityIcon,
  "catching-breath": PauseIcon,
  "idle-03": PauseIcon,
  "idle-04": PauseIcon,
  "idle-07": PauseIcon,
  "idle-09": PauseIcon,
  "idle-15": PauseIcon,
};

export function getAvatarEmoteIcon(
  emote: Pick<AvatarEmoteDef, "id" | "drawerGroup">,
): AvatarEmoteIcon {
  return EMOTE_ICON_BY_ID[emote.id] ?? AVATAR_EMOTE_GROUP_ICONS[emote.drawerGroup];
}

