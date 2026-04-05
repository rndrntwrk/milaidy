import type { IAgentRuntime } from "@elizaos/core";
import type {
  AppLaunchResult,
  AppSessionActionResult,
  AppSessionState,
} from "../../../packages/agent/src/contracts/apps";
import type { AppLaunchSessionContext } from "../../../packages/agent/src/services/app-package-modules";

const APP_NAME = "@elizaos/app-defense-of-the-agents";
const APP_DISPLAY_NAME = "Defense of the Agents";
const DEFAULT_API_BASE_URL = "https://wc2-agentic-dev-3o6un.ondigitalocean.app";
const DEFAULT_HERO_CLASS = "mage";
const DEFAULT_HERO_LANE = "mid";
const DEFAULT_GAME_ID = 1;
const GAME_SEARCH_LIMIT = 5;
const FETCH_TIMEOUT_MS = 4_000;
const DEPLOY_MESSAGE_LIMIT = 140;
const EXPLICIT_MESSAGE_PREFIXES = ["say ", "message ", "announce "];

type HeroClass = "melee" | "ranged" | "mage";
type HeroLane = "top" | "mid" | "bot";

interface DefenseAbility {
  id: string;
  level: number;
}

interface DefenseHero {
  name: string;
  faction: string;
  class: HeroClass;
  lane: HeroLane;
  hp: number;
  maxHp: number;
  alive: boolean;
  level: number;
  xp: number;
  xpToNext: number;
  abilities: DefenseAbility[];
  abilityChoices?: string[];
}

interface DefenseLaneState {
  human: number;
  orc: number;
  frontline: number;
}

interface DefenseTowerState {
  faction: string;
  lane: HeroLane;
  hp: number;
  maxHp: number;
  alive: boolean;
}

interface DefenseBaseState {
  hp: number;
  maxHp: number;
}

interface DefenseGameState {
  tick: number;
  agents: Record<string, string[]>;
  lanes: Record<HeroLane, DefenseLaneState>;
  towers: DefenseTowerState[];
  bases: Record<string, DefenseBaseState>;
  heroes: DefenseHero[];
  winner: string | null;
}

interface DefenseRegistrationResponse {
  message?: string;
  apiKey?: string;
}

interface DefenseDeploymentResponse {
  message?: string;
  gameId?: number;
}

interface DefenseDeploymentBody {
  heroClass?: HeroClass;
  heroLane?: HeroLane;
  abilityChoice?: string;
  action?: "recall";
  message?: string;
}

interface RuntimeLike {
  agentId?: string;
  character?: {
    name?: string;
    settings?: {
      secrets?: Record<string, string>;
    };
    secrets?: Record<string, string>;
  };
  getSetting?: (key: string) => string | null | undefined;
  setSetting?: (key: string, value: string, secret?: boolean) => void;
}

interface SessionContext {
  apiBaseUrl: string;
  apiKey?: string;
  agentName: string;
  preferredGameId?: number;
  defaultHeroClass: HeroClass;
  defaultLane: HeroLane;
  runtime: IAgentRuntime | null;
}

interface LocatedHeroState {
  gameId: number;
  state: DefenseGameState;
  hero: DefenseHero | null;
}

const HERO_CLASS_VALUES = new Set<HeroClass>(["melee", "ranged", "mage"]);
const HERO_LANE_VALUES = new Set<HeroLane>(["top", "mid", "bot"]);

const KNOWN_ABILITIES = [
  "cleave",
  "thorns",
  "divine_shield",
  "volley",
  "bloodlust",
  "critical_strike",
  "fireball",
  "tornado",
  "raise_skeleton",
  "fortitude",
  "fury",
] as const;

function asRuntimeLike(value: unknown): RuntimeLike | null {
  return value && typeof value === "object" ? (value as RuntimeLike) : null;
}

function resolveSettingLike(
  runtime: IAgentRuntime | RuntimeLike | null | undefined,
  key: string,
): string | undefined {
  const fromRuntime = runtime?.getSetting?.(key);
  if (typeof fromRuntime === "string" && fromRuntime.trim().length > 0) {
    return fromRuntime.trim();
  }
  const fromEnv = process.env[key];
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return undefined;
}

function persistSetting(
  runtime: IAgentRuntime | null,
  key: string,
  value: string,
  secret = false,
): void {
  process.env[key] = value;
  const runtimeLike = asRuntimeLike(runtime);
  runtimeLike?.setSetting?.(key, value, secret);

  const character = runtimeLike?.character;
  if (!character) return;

  if (!character.settings) {
    character.settings = {};
  }
  if (!character.settings.secrets) {
    character.settings.secrets = {};
  }
  character.settings.secrets[key] = value;

  if (!character.secrets) {
    character.secrets = {};
  }
  character.secrets[key] = value;
}

function normalizeHeroClass(value: string | undefined): HeroClass {
  const normalized = value?.trim().toLowerCase();
  if (normalized && HERO_CLASS_VALUES.has(normalized as HeroClass)) {
    return normalized as HeroClass;
  }
  return DEFAULT_HERO_CLASS;
}

function normalizeHeroLane(value: string | undefined): HeroLane {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return DEFAULT_HERO_LANE;
  if (normalized === "middle") return "mid";
  if (normalized === "bottom") return "bot";
  if (HERO_LANE_VALUES.has(normalized as HeroLane)) {
    return normalized as HeroLane;
  }
  return DEFAULT_HERO_LANE;
}

function normalizeGameId(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;
  return parsed;
}

function truncateMessage(value: string): string {
  return value.trim().slice(0, DEPLOY_MESSAGE_LIMIT);
}

function resolveAgentName(
  runtime: IAgentRuntime | null,
  explicitSessionId?: string | null,
): string {
  if (explicitSessionId?.trim()) {
    return explicitSessionId.trim();
  }

  const configured =
    resolveSettingLike(runtime, "DEFENSE_OF_THE_AGENTS_AGENT_NAME") ??
    resolveSettingLike(runtime, "BOT_NAME");
  if (configured?.trim()) {
    return configured.trim();
  }

  const runtimeLike = asRuntimeLike(runtime);
  const characterName = runtimeLike?.character?.name?.trim();
  if (characterName) {
    return characterName;
  }

  const agentId = runtimeLike?.agentId?.trim();
  if (agentId) {
    return `milady-${agentId.slice(0, 8)}`;
  }

  return "Milady";
}

function resolveSessionContext(
  runtime: IAgentRuntime | null,
  explicitSessionId?: string | null,
): SessionContext {
  return {
    apiBaseUrl: (
      resolveSettingLike(runtime, "DEFENSE_OF_THE_AGENTS_API_URL") ??
      DEFAULT_API_BASE_URL
    ).replace(/\/+$/, ""),
    apiKey: resolveSettingLike(runtime, "DEFENSE_OF_THE_AGENTS_API_KEY"),
    agentName: resolveAgentName(runtime, explicitSessionId),
    preferredGameId: normalizeGameId(
      resolveSettingLike(runtime, "DEFENSE_OF_THE_AGENTS_GAME_ID"),
    ),
    defaultHeroClass: normalizeHeroClass(
      resolveSettingLike(runtime, "DEFENSE_OF_THE_AGENTS_DEFAULT_HERO_CLASS"),
    ),
    defaultLane: normalizeHeroLane(
      resolveSettingLike(runtime, "DEFENSE_OF_THE_AGENTS_DEFAULT_LANE"),
    ),
    runtime,
  };
}

async function fetchJson<T>(url: URL, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  const text = await response.text();
  const data = text.trim().length > 0 ? (JSON.parse(text) as T) : ({} as T);

  if (!response.ok) {
    throw new Error(
      `Defense of the Agents API error (${response.status}): ${text.trim() || response.statusText}`,
    );
  }

  return data;
}

async function fetchGameState(
  apiBaseUrl: string,
  gameId: number,
): Promise<DefenseGameState> {
  const url = new URL("/api/game/state", apiBaseUrl);
  url.searchParams.set("game", String(gameId));
  return fetchJson<DefenseGameState>(url);
}

function findHero(
  state: DefenseGameState,
  agentName: string,
): DefenseHero | null {
  return (
    state.heroes.find(
      (hero) =>
        hero.name.trim().toLowerCase() === agentName.trim().toLowerCase(),
    ) ?? null
  );
}

async function locateHeroState(
  ctx: Pick<SessionContext, "apiBaseUrl" | "agentName" | "preferredGameId">,
): Promise<LocatedHeroState> {
  const candidates = [
    ctx.preferredGameId,
    ...Array.from({ length: GAME_SEARCH_LIMIT }, (_, index) => index + 1),
  ].filter((value, index, values): value is number => {
    return typeof value === "number" && values.indexOf(value) === index;
  });

  let fallbackState: LocatedHeroState | null = null;

  for (const gameId of candidates) {
    const state = await fetchGameState(ctx.apiBaseUrl, gameId);
    const hero = findHero(state, ctx.agentName);
    if (!fallbackState) {
      fallbackState = {
        gameId,
        state,
        hero,
      };
    }
    if (hero) {
      return {
        gameId,
        state,
        hero,
      };
    }
  }

  return (
    fallbackState ?? {
      gameId: ctx.preferredGameId ?? DEFAULT_GAME_ID,
      state: await fetchGameState(
        ctx.apiBaseUrl,
        ctx.preferredGameId ?? DEFAULT_GAME_ID,
      ),
      hero: null,
    }
  );
}

async function registerAgent(ctx: SessionContext): Promise<string> {
  const url = new URL("/api/agents/register", ctx.apiBaseUrl);
  const response = await fetchJson<DefenseRegistrationResponse>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agentName: ctx.agentName,
    }),
  });

  if (!response.apiKey?.trim()) {
    throw new Error(
      "Defense of the Agents register response did not include an API key.",
    );
  }

  persistSetting(
    ctx.runtime,
    "DEFENSE_OF_THE_AGENTS_AGENT_NAME",
    ctx.agentName,
  );
  persistSetting(
    ctx.runtime,
    "DEFENSE_OF_THE_AGENTS_API_KEY",
    response.apiKey.trim(),
    true,
  );

  return response.apiKey.trim();
}

async function ensureApiKey(ctx: SessionContext): Promise<string> {
  if (ctx.apiKey?.trim()) {
    persistSetting(
      ctx.runtime,
      "DEFENSE_OF_THE_AGENTS_AGENT_NAME",
      ctx.agentName,
    );
    return ctx.apiKey.trim();
  }
  return registerAgent(ctx);
}

async function deployHero(
  ctx: SessionContext,
  body: DefenseDeploymentBody,
): Promise<DefenseDeploymentResponse> {
  const apiKey = await ensureApiKey(ctx);
  const url = new URL("/api/strategy/deployment", ctx.apiBaseUrl);
  const response = await fetchJson<DefenseDeploymentResponse>(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (typeof response.gameId === "number" && Number.isFinite(response.gameId)) {
    persistSetting(
      ctx.runtime,
      "DEFENSE_OF_THE_AGENTS_GAME_ID",
      String(response.gameId),
    );
  }

  return response;
}

function toAbilityLabel(abilityId: string): string {
  return abilityId
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildSuggestedPrompts(
  state: DefenseGameState,
  hero: DefenseHero | null,
  ctx: Pick<SessionContext, "defaultHeroClass" | "defaultLane">,
): string[] {
  const prompts: string[] = [];

  if (!hero) {
    prompts.push(
      `Deploy as ${ctx.defaultHeroClass} in ${ctx.defaultLane} lane`,
    );
    prompts.push("Deploy as ranged in top lane");
    prompts.push("Deploy as melee in bot lane");
    return prompts;
  }

  const laneOrder: HeroLane[] = ["top", "mid", "bot"];
  for (const lane of laneOrder) {
    if (lane !== hero.lane) {
      prompts.push(`Move to ${lane} lane`);
    }
  }

  if (hero.abilityChoices?.length) {
    for (const choice of hero.abilityChoices.slice(0, 3)) {
      prompts.push(`Learn ${toAbilityLabel(choice)}`);
    }
  }

  const hpPercent = hero.maxHp > 0 ? hero.hp / hero.maxHp : 0;
  if (hero.alive && hpPercent <= 0.35) {
    prompts.push("Recall to base");
  }

  const pressureLane = laneOrder
    .map((lane) => ({
      lane,
      score:
        hero.faction === "orc"
          ? state.lanes[lane].orc - state.lanes[lane].human
          : state.lanes[lane].human - state.lanes[lane].orc,
    }))
    .sort((left, right) => left.score - right.score)[0]?.lane;
  if (pressureLane && pressureLane !== hero.lane) {
    prompts.push(`Reinforce ${pressureLane} lane`);
  }

  return Array.from(new Set(prompts)).slice(0, 4);
}

function buildSummary(
  hero: DefenseHero | null,
  state: DefenseGameState,
  gameId: number,
): string {
  if (!hero) {
    return `Agent registered. Send a deployment command to join game ${gameId}.`;
  }
  if (state.winner) {
    return `Game ${gameId} finished. ${state.winner} won.`;
  }
  const health = hero.maxHp > 0 ? `${hero.hp}/${hero.maxHp} HP` : "respawning";
  return `${toAbilityLabel(hero.class)} level ${hero.level} in ${hero.lane} lane, ${health}.`;
}

function buildGoalLabel(hero: DefenseHero | null): string | null {
  if (!hero) return "Deploy into the arena";
  if (hero.abilityChoices?.length) {
    return `Choose an ability for ${hero.name}`;
  }
  const hpPercent = hero.maxHp > 0 ? hero.hp / hero.maxHp : 0;
  if (hero.alive && hpPercent <= 0.35) {
    return "Low HP: consider recalling";
  }
  return `${toAbilityLabel(hero.class)} holding ${hero.lane} lane`;
}

function buildTelemetry(
  state: DefenseGameState,
  hero: DefenseHero | null,
  gameId: number,
): AppSessionState["telemetry"] {
  const activeLane = hero ? state.lanes[hero.lane] : state.lanes.mid;
  return {
    gameId,
    tick: state.tick,
    winner: state.winner,
    heroFaction: hero?.faction ?? null,
    heroClass: hero?.class ?? null,
    heroLane: hero?.lane ?? null,
    heroLevel: hero?.level ?? null,
    heroHp: hero?.hp ?? null,
    heroMaxHp: hero?.maxHp ?? null,
    heroAlive: hero?.alive ?? null,
    heroAbilityChoices: hero?.abilityChoices?.length ?? 0,
    humanAgents: state.agents.human?.length ?? 0,
    orcAgents: state.agents.orc?.length ?? 0,
    laneHumanUnits: activeLane?.human ?? null,
    laneOrcUnits: activeLane?.orc ?? null,
    laneFrontline: activeLane?.frontline ?? null,
  };
}

function buildSessionState(
  ctx: SessionContext,
  located: LocatedHeroState,
): AppSessionState {
  const { hero, state, gameId } = located;
  const status = state.winner
    ? "completed"
    : !hero
      ? "ready"
      : hero.alive
        ? "running"
        : "respawning";

  return {
    sessionId: ctx.agentName,
    appName: APP_NAME,
    mode: "spectate-and-steer",
    status,
    displayName: APP_DISPLAY_NAME,
    agentId: ctx.runtime?.agentId,
    canSendCommands: Boolean(
      ctx.apiKey ?? process.env.DEFENSE_OF_THE_AGENTS_API_KEY,
    ),
    controls: [],
    summary: buildSummary(hero, state, gameId),
    goalLabel: buildGoalLabel(hero),
    suggestedPrompts: buildSuggestedPrompts(state, hero, ctx),
    telemetry: buildTelemetry(state, hero, gameId),
  };
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ");
}

function parseExplicitMessage(content: string): string | undefined {
  const trimmed = content.trim();
  const normalized = normalizeText(trimmed);
  for (const prefix of EXPLICIT_MESSAGE_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      return truncateMessage(trimmed.slice(prefix.length));
    }
  }
  return undefined;
}

function parseAbilityChoice(
  content: string,
  hero: DefenseHero | null,
): string | undefined {
  const normalized = normalizeText(content);
  const choices = hero?.abilityChoices ?? KNOWN_ABILITIES;

  for (const choice of choices) {
    const label = normalizeText(choice);
    if (
      normalized.includes(label) ||
      normalized.includes(label.replace(/\s+/g, "")) ||
      normalized.includes(toAbilityLabel(choice).toLowerCase())
    ) {
      return choice;
    }
  }

  return undefined;
}

function parseStructuredDeployment(
  content: string,
): DefenseDeploymentBody | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{")) return null;

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const deployment: DefenseDeploymentBody = {};

    if (typeof parsed.heroClass === "string") {
      deployment.heroClass = normalizeHeroClass(parsed.heroClass);
    }
    if (typeof parsed.heroLane === "string") {
      deployment.heroLane = normalizeHeroLane(parsed.heroLane);
    }
    if (
      typeof parsed.abilityChoice === "string" &&
      parsed.abilityChoice.trim()
    ) {
      deployment.abilityChoice = parsed.abilityChoice.trim();
    }
    if (parsed.action === "recall") {
      deployment.action = "recall";
    }
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      deployment.message = truncateMessage(parsed.message);
    }

    return deployment;
  } catch {
    return null;
  }
}

function parseDeploymentCommand(
  content: string,
  ctx: SessionContext,
  hero: DefenseHero | null,
): DefenseDeploymentBody {
  const structured = parseStructuredDeployment(content);
  if (structured) {
    return {
      heroClass: structured.heroClass ?? hero?.class ?? ctx.defaultHeroClass,
      heroLane: structured.heroLane ?? hero?.lane ?? ctx.defaultLane,
      ...(structured.abilityChoice
        ? { abilityChoice: structured.abilityChoice }
        : {}),
      ...(structured.action ? { action: structured.action } : {}),
      ...(structured.message ? { message: structured.message } : {}),
    };
  }

  const normalized = normalizeText(content);
  const deployment: DefenseDeploymentBody = {
    heroClass: hero?.class ?? ctx.defaultHeroClass,
    heroLane: hero?.lane ?? ctx.defaultLane,
  };

  if (normalized.includes("melee")) deployment.heroClass = "melee";
  if (normalized.includes("ranged")) deployment.heroClass = "ranged";
  if (normalized.includes("mage")) deployment.heroClass = "mage";

  if (/\btop\b/.test(normalized)) deployment.heroLane = "top";
  if (/\bmid\b|\bmiddle\b/.test(normalized)) deployment.heroLane = "mid";
  if (/\bbot\b|\bbottom\b/.test(normalized)) deployment.heroLane = "bot";

  if (/\brecall\b|\bheal\b|\bbase\b|\bretreat\b/.test(normalized)) {
    deployment.action = "recall";
  }

  const abilityChoice = parseAbilityChoice(content, hero);
  if (abilityChoice) {
    deployment.abilityChoice = abilityChoice;
  }

  const explicitMessage = parseExplicitMessage(content);
  if (explicitMessage) {
    deployment.message = explicitMessage;
  }

  return deployment;
}

async function ensureJoinedGame(
  ctx: SessionContext,
): Promise<LocatedHeroState> {
  const current = await locateHeroState(ctx);
  if (current.hero) {
    if (current.gameId) {
      persistSetting(
        ctx.runtime,
        "DEFENSE_OF_THE_AGENTS_GAME_ID",
        String(current.gameId),
      );
    }
    return current;
  }

  const deployment = await deployHero(ctx, {
    heroClass: ctx.defaultHeroClass,
    heroLane: ctx.defaultLane,
  });
  const nextGameId =
    deployment.gameId ?? ctx.preferredGameId ?? DEFAULT_GAME_ID;
  const state = await fetchGameState(ctx.apiBaseUrl, nextGameId);
  return {
    gameId: nextGameId,
    state,
    hero: findHero(state, ctx.agentName),
  };
}

function parseSessionId(pathname: string): string | null {
  const match = pathname.match(/\/session\/([^/]+)(?:\/|$)/);
  if (!match?.[1]) return null;
  return decodeURIComponent(match[1]);
}

function parseSessionSubroute(pathname: string): "message" | "control" | null {
  if (pathname.endsWith("/message")) return "message";
  if (pathname.endsWith("/control")) return "control";
  return null;
}

async function readSessionState(
  runtime: IAgentRuntime | null,
  sessionId?: string | null,
  autoJoin = false,
): Promise<AppSessionState> {
  const ctx = resolveSessionContext(runtime, sessionId);
  const located = autoJoin
    ? await ensureJoinedGame(ctx)
    : await locateHeroState(ctx);

  if (typeof located.gameId === "number" && Number.isFinite(located.gameId)) {
    persistSetting(
      runtime,
      "DEFENSE_OF_THE_AGENTS_GAME_ID",
      String(located.gameId),
    );
  }

  return buildSessionState(ctx, located);
}

function okResponse(
  success: boolean,
  message: string,
  session?: AppSessionState | null,
): AppSessionActionResult {
  return {
    success,
    message,
    session: session ?? null,
  };
}

export async function resolveLaunchSession(
  ctx: AppLaunchSessionContext,
): Promise<AppLaunchResult["session"]> {
  return readSessionState(ctx.runtime, null, true);
}

export async function handleAppRoutes(ctx: {
  method: string;
  pathname: string;
  runtime: unknown | null;
  error: (response: unknown, message: string, status?: number) => void;
  json: (response: unknown, data: unknown, status?: number) => void;
  readJsonBody: () => Promise<unknown>;
  res: unknown;
}): Promise<boolean> {
  const sessionId = parseSessionId(ctx.pathname);
  if (!sessionId) return false;

  const runtime = (asRuntimeLike(ctx.runtime) as IAgentRuntime | null) ?? null;
  const subroute = parseSessionSubroute(ctx.pathname);

  try {
    if (ctx.method === "GET" && !subroute) {
      ctx.json(ctx.res, await readSessionState(runtime, sessionId));
      return true;
    }

    if (ctx.method === "POST" && subroute === "message") {
      const body = (await ctx.readJsonBody()) as { content?: string } | null;
      const content = body?.content?.trim();
      if (!content) {
        ctx.error(ctx.res, "Command content is required.", 400);
        return true;
      }

      const sessionCtx = resolveSessionContext(runtime, sessionId);
      const current = await locateHeroState(sessionCtx);
      const deployment = parseDeploymentCommand(
        content,
        sessionCtx,
        current.hero,
      );
      const response = await deployHero(sessionCtx, deployment);
      const refreshed = await readSessionState(runtime, sessionId);
      ctx.json(
        ctx.res,
        okResponse(
          true,
          response.message?.trim() || "Deployment received.",
          refreshed,
        ),
      );
      return true;
    }

    if (ctx.method === "POST" && subroute === "control") {
      ctx.error(
        ctx.res,
        "Defense of the Agents does not expose pause or resume controls.",
        400,
      );
      return true;
    }

    return false;
  } catch (error) {
    ctx.error(
      ctx.res,
      error instanceof Error
        ? error.message
        : "Defense of the Agents request failed.",
      502,
    );
    return true;
  }
}
