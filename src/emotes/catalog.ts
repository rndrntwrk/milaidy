/**
 * Emote Catalog
 *
 * Central registry of all available emotes for the avatar system.
 * Used by both server and client to validate and reference emote definitions.
 */

export type EmoteCategory =
  | "greeting"
  | "emotion"
  | "dance"
  | "combat"
  | "idle"
  | "movement"
  | "other";

export type EmoteDrawerGroup =
  | "movement"
  | "gesture"
  | "dance"
  | "combat"
  | "exercise"
  | "idle";

export interface EmoteDef {
  id: string;
  name: string;
  description: string;
  glbPath: string;
  duration: number;
  loop: boolean;
  category: EmoteCategory;
  drawerGroup: EmoteDrawerGroup;
  pinnedInActionDrawer: boolean;
  autoEligible: boolean;
  idleVariant: boolean;
}

type EmoteSeed = Omit<
  EmoteDef,
  "pinnedInActionDrawer" | "autoEligible" | "idleVariant"
> &
  Partial<
    Pick<
      EmoteDef,
      "pinnedInActionDrawer" | "autoEligible" | "idleVariant"
    >
  >;

function defineEmote(seed: EmoteSeed): EmoteDef {
  return {
    pinnedInActionDrawer: false,
    autoEligible: false,
    idleVariant: false,
    ...seed,
  };
}

export const EMOTE_CATALOG: EmoteDef[] = [
  defineEmote({
    id: "wave",
    name: "Wave",
    description: "Waves both hands in greeting",
    glbPath: "/animations/emotes/waving-both-hands.glb",
    duration: 2.5,
    loop: false,
    category: "greeting",
    drawerGroup: "gesture",
    autoEligible: true,
  }),
  defineEmote({
    id: "kiss",
    name: "Kiss",
    description: "Blows a kiss",
    glbPath: "/animations/emotes/kiss.glb",
    duration: 2,
    loop: false,
    category: "greeting",
    drawerGroup: "gesture",
    autoEligible: true,
  }),
  defineEmote({
    id: "crying",
    name: "Crying",
    description: "Cries sadly",
    glbPath: "/animations/emotes/crying.glb",
    duration: 3,
    loop: true,
    category: "emotion",
    drawerGroup: "gesture",
    autoEligible: true,
  }),
  defineEmote({
    id: "sorrow",
    name: "Sorrow",
    description: "Expresses deep sorrow",
    glbPath: "/animations/emotes/sorrow.glb",
    duration: 3,
    loop: true,
    category: "emotion",
    drawerGroup: "gesture",
    autoEligible: true,
  }),
  defineEmote({
    id: "rude-gesture",
    name: "Rude Gesture",
    description: "Makes a rude gesture",
    glbPath: "/animations/emotes/rude-gesture.glb",
    duration: 2,
    loop: false,
    category: "emotion",
    drawerGroup: "gesture",
  }),
  defineEmote({
    id: "looking-around",
    name: "Looking Around",
    description: "Looks around nervously",
    glbPath: "/animations/emotes/looking-around.glb",
    duration: 3,
    loop: true,
    category: "emotion",
    drawerGroup: "gesture",
    autoEligible: true,
  }),
  defineEmote({
    id: "dance-happy",
    name: "Happy Dance",
    description: "Happy dance",
    glbPath: "/animations/emotes/dance-happy.glb",
    duration: 4,
    loop: true,
    category: "dance",
    drawerGroup: "dance",
    autoEligible: true,
  }),
  defineEmote({
    id: "dance-breaking",
    name: "Breaking",
    description: "Breakdance moves",
    glbPath: "/animations/emotes/dance-breaking.glb",
    duration: 4,
    loop: true,
    category: "dance",
    drawerGroup: "dance",
    autoEligible: true,
  }),
  defineEmote({
    id: "dance-hiphop",
    name: "Hip Hop",
    description: "Hip hop dance",
    glbPath: "/animations/emotes/dance-hiphop.glb",
    duration: 4,
    loop: true,
    category: "dance",
    drawerGroup: "dance",
    autoEligible: true,
  }),
  defineEmote({
    id: "dance-popping",
    name: "Popping",
    description: "Popping dance moves",
    glbPath: "/animations/emotes/dance-popping.glb",
    duration: 4,
    loop: true,
    category: "dance",
    drawerGroup: "dance",
    autoEligible: true,
  }),
  defineEmote({
    id: "hook-punch",
    name: "Hook Punch",
    description: "Throws a hook punch",
    glbPath: "/animations/emotes/hook-punch.glb",
    duration: 1.5,
    loop: false,
    category: "combat",
    drawerGroup: "combat",
  }),
  defineEmote({
    id: "punching",
    name: "Punching",
    description: "Throws punches",
    glbPath: "/animations/emotes/punching.glb",
    duration: 2,
    loop: false,
    category: "combat",
    drawerGroup: "combat",
  }),
  defineEmote({
    id: "firing-gun",
    name: "Firing Gun",
    description: "Fires a gun",
    glbPath: "/animations/emotes/firing-gun.glb",
    duration: 2,
    loop: false,
    category: "combat",
    drawerGroup: "combat",
  }),
  defineEmote({
    id: "sword-swing",
    name: "Sword Swing",
    description: "Swings a sword",
    glbPath: "/animations/emotes/sword_swing.glb",
    duration: 2,
    loop: false,
    category: "combat",
    drawerGroup: "combat",
  }),
  defineEmote({
    id: "chopping",
    name: "Chopping",
    description: "Chops with an axe",
    glbPath: "/animations/emotes/chopping.glb",
    duration: 2,
    loop: false,
    category: "combat",
    drawerGroup: "combat",
  }),
  defineEmote({
    id: "spell-cast",
    name: "Spell Cast",
    description: "Casts a magic spell",
    glbPath: "/animations/emotes/spell-cast.glb",
    duration: 2.5,
    loop: false,
    category: "combat",
    drawerGroup: "combat",
  }),
  defineEmote({
    id: "range",
    name: "Range",
    description: "Fires a ranged weapon",
    glbPath: "/animations/emotes/range.glb",
    duration: 2,
    loop: false,
    category: "combat",
    drawerGroup: "combat",
  }),
  defineEmote({
    id: "death",
    name: "Death",
    description: "Falls down defeated",
    glbPath: "/animations/emotes/death.glb",
    duration: 3,
    loop: false,
    category: "combat",
    drawerGroup: "combat",
  }),
  defineEmote({
    id: "idle",
    name: "Idle",
    description: "Stands idle",
    glbPath: "/animations/emotes/idle.glb",
    duration: 5,
    loop: true,
    category: "idle",
    drawerGroup: "idle",
    autoEligible: true,
  }),
  defineEmote({
    id: "talk",
    name: "Talk",
    description: "Talks animatedly",
    glbPath: "/animations/emotes/talk.glb",
    duration: 3,
    loop: true,
    category: "idle",
    drawerGroup: "idle",
    autoEligible: true,
  }),
  defineEmote({
    id: "squat",
    name: "Squat",
    description: "Squats down",
    glbPath: "/animations/emotes/squat.glb",
    duration: 3,
    loop: true,
    category: "idle",
    drawerGroup: "idle",
    autoEligible: true,
  }),
  defineEmote({
    id: "fishing",
    name: "Fishing",
    description: "Casts a fishing line",
    glbPath: "/animations/emotes/fishing.glb",
    duration: 5,
    loop: true,
    category: "idle",
    drawerGroup: "idle",
    autoEligible: true,
  }),
  defineEmote({
    id: "float",
    name: "Float",
    description: "Floats in the air",
    glbPath: "/animations/emotes/float.glb",
    duration: 4,
    loop: true,
    category: "idle",
    drawerGroup: "idle",
    autoEligible: true,
  }),
  defineEmote({
    id: "jump",
    name: "Jump",
    description: "Jumps up",
    glbPath: "/animations/emotes/jump.glb",
    duration: 1.5,
    loop: false,
    category: "movement",
    drawerGroup: "movement",
  }),
  defineEmote({
    id: "flip",
    name: "Flip",
    description: "Does a backflip",
    glbPath: "/animations/emotes/flip.glb",
    duration: 2,
    loop: false,
    category: "movement",
    drawerGroup: "movement",
  }),
  defineEmote({
    id: "run",
    name: "Run",
    description: "Runs in place",
    glbPath: "/animations/emotes/run.glb",
    duration: 3,
    loop: true,
    category: "movement",
    drawerGroup: "movement",
  }),
  defineEmote({
    id: "walk",
    name: "Walk",
    description: "Walks in place",
    glbPath: "/animations/emotes/walk.glb",
    duration: 3,
    loop: true,
    category: "movement",
    drawerGroup: "movement",
  }),
  defineEmote({
    id: "crawling",
    name: "Crawling",
    description: "Crawls on the ground",
    glbPath: "/animations/emotes/crawling.glb",
    duration: 3,
    loop: true,
    category: "movement",
    drawerGroup: "movement",
  }),
  defineEmote({
    id: "fall",
    name: "Fall",
    description: "Falls down",
    glbPath: "/animations/emotes/fall.glb",
    duration: 2,
    loop: false,
    category: "movement",
    drawerGroup: "movement",
  }),
  defineEmote({
    id: "walking",
    name: "Walking",
    description: "Walks in place with the Alice walk cycle",
    glbPath: "/animations/alice/movement/walking.glb",
    duration: 3,
    loop: true,
    category: "movement",
    drawerGroup: "movement",
    pinnedInActionDrawer: true,
    autoEligible: true,
  }),
  defineEmote({
    id: "casual-walk",
    name: "Casual Walk",
    description: "Casual in-place walk cycle",
    glbPath: "/animations/alice/movement/casual-walk.glb",
    duration: 3,
    loop: true,
    category: "movement",
    drawerGroup: "movement",
    autoEligible: true,
  }),
  defineEmote({
    id: "running",
    name: "Running",
    description: "Runs in place with the Alice run cycle",
    glbPath: "/animations/alice/movement/running.glb",
    duration: 3,
    loop: true,
    category: "movement",
    drawerGroup: "movement",
    pinnedInActionDrawer: true,
    autoEligible: true,
  }),
  defineEmote({
    id: "backflip",
    name: "Backflip",
    description: "Launches into a backflip",
    glbPath: "/animations/alice/movement/backflip.glb",
    duration: 2.2,
    loop: false,
    category: "movement",
    drawerGroup: "movement",
    pinnedInActionDrawer: true,
  }),
  defineEmote({
    id: "power-spin-jump",
    name: "Power Spin Jump",
    description: "Performs a dramatic spinning jump",
    glbPath: "/animations/alice/movement/power-spin-jump.glb",
    duration: 2.6,
    loop: false,
    category: "movement",
    drawerGroup: "movement",
  }),
  defineEmote({
    id: "big-heart-gesture",
    name: "Big Heart Gesture",
    description: "Makes a big heart gesture toward the audience",
    glbPath: "/animations/alice/gesture/big-heart-gesture.glb",
    duration: 3,
    loop: false,
    category: "greeting",
    drawerGroup: "gesture",
    pinnedInActionDrawer: true,
    autoEligible: true,
  }),
  defineEmote({
    id: "cheer-both-hands-01",
    name: "Cheer Both Hands",
    description: "Cheers with both hands raised",
    glbPath: "/animations/alice/gesture/cheer-both-hands-01.glb",
    duration: 3,
    loop: false,
    category: "greeting",
    drawerGroup: "gesture",
    pinnedInActionDrawer: true,
    autoEligible: true,
  }),
  defineEmote({
    id: "all-night-dance",
    name: "All Night Dance",
    description: "Breaks into a full dance loop",
    glbPath: "/animations/alice/dance/all-night-dance.glb",
    duration: 4,
    loop: true,
    category: "dance",
    drawerGroup: "dance",
    pinnedInActionDrawer: true,
    autoEligible: true,
  }),
  defineEmote({
    id: "breakdance-1990",
    name: "Breakdance 1990",
    description: "Spins through a classic breakdance combo",
    glbPath: "/animations/alice/dance/breakdance-1990.glb",
    duration: 4,
    loop: true,
    category: "dance",
    drawerGroup: "dance",
    autoEligible: true,
  }),
  defineEmote({
    id: "cherish-pop-dance",
    name: "Cherish Pop Dance",
    description: "Performs a stylized pop dance loop",
    glbPath: "/animations/alice/dance/cherish-pop-dance.glb",
    duration: 4,
    loop: true,
    category: "dance",
    drawerGroup: "dance",
    autoEligible: true,
  }),
  defineEmote({
    id: "angry-ground-stomp-01",
    name: "Angry Ground Stomp",
    description: "Slams the stage with a forceful stomp",
    glbPath: "/animations/alice/combat/angry-ground-stomp-01.glb",
    duration: 2.2,
    loop: false,
    category: "combat",
    drawerGroup: "combat",
  }),
  defineEmote({
    id: "angry-stomp",
    name: "Angry Stomp",
    description: "Unleashes an angry stomp animation",
    glbPath: "/animations/alice/combat/angry-stomp.glb",
    duration: 2.2,
    loop: false,
    category: "combat",
    drawerGroup: "combat",
  }),
  defineEmote({
    id: "head-down-charge",
    name: "Head Down Charge",
    description: "Lowers forward into a charging stance",
    glbPath: "/animations/alice/combat/head-down-charge.glb",
    duration: 2.4,
    loop: false,
    category: "combat",
    drawerGroup: "combat",
  }),
  defineEmote({
    id: "circle-crunch",
    name: "Circle Crunch",
    description: "Loops a crunch-style exercise motion",
    glbPath: "/animations/alice/exercise/circle-crunch.glb",
    duration: 3,
    loop: true,
    category: "other",
    drawerGroup: "exercise",
  }),
  defineEmote({
    id: "catching-breath",
    name: "Catching Breath",
    description: "Subtle breathing idle used in the background pool",
    glbPath: "/animations/alice/idle/catching-breath.glb",
    duration: 6,
    loop: true,
    category: "idle",
    drawerGroup: "idle",
    autoEligible: true,
    idleVariant: true,
  }),
  defineEmote({
    id: "idle-03",
    name: "Idle 03",
    description: "Alice idle variant 03",
    glbPath: "/animations/alice/idle/idle-03.glb",
    duration: 6,
    loop: true,
    category: "idle",
    drawerGroup: "idle",
    autoEligible: true,
    idleVariant: true,
  }),
  defineEmote({
    id: "idle-04",
    name: "Idle 04",
    description: "Alice idle variant 04",
    glbPath: "/animations/alice/idle/idle-04.glb",
    duration: 6,
    loop: true,
    category: "idle",
    drawerGroup: "idle",
    autoEligible: true,
    idleVariant: true,
  }),
  defineEmote({
    id: "idle-07",
    name: "Idle 07",
    description: "Alice idle variant 07",
    glbPath: "/animations/alice/idle/idle-07.glb",
    duration: 6,
    loop: true,
    category: "idle",
    drawerGroup: "idle",
    autoEligible: true,
    idleVariant: true,
  }),
  defineEmote({
    id: "idle-09",
    name: "Idle 09",
    description: "Alice idle variant 09",
    glbPath: "/animations/alice/idle/idle-09.glb",
    duration: 6,
    loop: true,
    category: "idle",
    drawerGroup: "idle",
    autoEligible: true,
    idleVariant: true,
  }),
  defineEmote({
    id: "idle-15",
    name: "Idle 15",
    description: "Alice idle variant 15",
    glbPath: "/animations/alice/idle/idle-15.glb",
    duration: 6,
    loop: true,
    category: "idle",
    drawerGroup: "idle",
    autoEligible: true,
    idleVariant: true,
  }),
];

/**
 * Map for O(1) emote lookup by ID
 */
export const EMOTE_BY_ID = new Map<string, EmoteDef>(
  EMOTE_CATALOG.map((emote) => [emote.id, emote]),
);

/**
 * Get emote definition by ID
 */
export function getEmote(id: string): EmoteDef | undefined {
  return EMOTE_BY_ID.get(id);
}

/**
 * Get all emotes in a specific category
 */
export function getEmotesByCategory(category: EmoteCategory): EmoteDef[] {
  return EMOTE_CATALOG.filter((emote) => emote.category === category);
}

/**
 * Validate if an emote ID exists
 */
export function isValidEmote(id: string): boolean {
  return EMOTE_BY_ID.has(id);
}
