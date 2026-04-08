import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { JSDOM } from "jsdom";

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_WAIT_INTERVAL_MS = 120;
const DEFAULT_WEB_PARTITION = "persist:milady-browser";
const DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE =
  "Milady browser workspace desktop bridge is unavailable.";

/**
 * Simple async mutex to serialise mutations to webWorkspaceState.
 * Prevents concurrent requests from corrupting tab state or history.
 */
let webStateLock: Promise<void> = Promise.resolve();
function withWebStateLock<T>(fn: () => T | Promise<T>): Promise<T> {
  const next = webStateLock.then(fn, fn);
  webStateLock = next.then(
    () => {},
    () => {},
  );
  return next;
}

export type BrowserWorkspaceMode = "desktop" | "web";

export type BrowserWorkspaceOperation =
  | "list"
  | "open"
  | "navigate"
  | "show"
  | "hide"
  | "close"
  | "eval"
  | "screenshot";

export type BrowserWorkspaceSubaction =
  | BrowserWorkspaceOperation
  | "back"
  | "batch"
  | "check"
  | "clipboard"
  | "click"
  | "fill"
  | "find"
  | "focus"
  | "forward"
  | "frame"
  | "get"
  | "hover"
  | "inspect"
  | "keydown"
  | "keyup"
  | "keyboardinserttext"
  | "keyboardtype"
  | "console"
  | "cookies"
  | "diff"
  | "press"
  | "drag"
  | "errors"
  | "highlight"
  | "mouse"
  | "network"
  | "pdf"
  | "profiler"
  | "reload"
  | "scroll"
  | "scrollinto"
  | "select"
  | "set"
  | "snapshot"
  | "state"
  | "storage"
  | "tab"
  | "trace"
  | "type"
  | "dblclick"
  | "upload"
  | "uncheck"
  | "wait"
  | "window";

export type BrowserWorkspaceGetMode =
  | "attr"
  | "box"
  | "checked"
  | "count"
  | "enabled"
  | "html"
  | "styles"
  | "text"
  | "title"
  | "url"
  | "value"
  | "visible";

export type BrowserWorkspaceFindBy =
  | "alt"
  | "first"
  | "label"
  | "last"
  | "nth"
  | "placeholder"
  | "role"
  | "testid"
  | "text"
  | "title";

export type BrowserWorkspaceFindAction =
  | "check"
  | "click"
  | "fill"
  | "focus"
  | "hover"
  | "text"
  | "type"
  | "uncheck";

export type BrowserWorkspaceWaitState = "hidden" | "visible";

export type BrowserWorkspaceScrollDirection =
  | "down"
  | "left"
  | "right"
  | "up";

export type BrowserWorkspaceClipboardAction =
  | "copy"
  | "paste"
  | "read"
  | "write";

export type BrowserWorkspaceMouseAction = "down" | "move" | "up" | "wheel";

export type BrowserWorkspaceMouseButton = "left" | "middle" | "right";

export type BrowserWorkspaceSetAction =
  | "credentials"
  | "device"
  | "geo"
  | "headers"
  | "media"
  | "offline"
  | "viewport";

export type BrowserWorkspaceCookieAction = "clear" | "get" | "set";

export type BrowserWorkspaceStorageArea = "local" | "session";

export type BrowserWorkspaceStorageAction = "clear" | "get" | "set";

export type BrowserWorkspaceNetworkAction =
  | "harstart"
  | "harstop"
  | "request"
  | "requests"
  | "route"
  | "unroute";

export type BrowserWorkspaceDialogAction = "accept" | "dismiss" | "status";

export type BrowserWorkspaceDiffAction = "screenshot" | "snapshot" | "url";

export type BrowserWorkspaceTraceAction = "start" | "stop";

export type BrowserWorkspaceProfilerAction = "start" | "stop";

export type BrowserWorkspaceStateAction = "load" | "save";

export type BrowserWorkspaceFrameAction = "main" | "select";

export type BrowserWorkspaceTabAction = "close" | "list" | "new" | "switch";

export type BrowserWorkspaceWindowAction = "new";

export type BrowserWorkspaceConsoleAction = "clear" | "list";

export interface BrowserWorkspaceTab {
  id: string;
  title: string;
  url: string;
  partition: string;
  visible: boolean;
  createdAt: string;
  updatedAt: string;
  lastFocusedAt: string | null;
}

export interface BrowserWorkspaceSnapshot {
  mode: BrowserWorkspaceMode;
  tabs: BrowserWorkspaceTab[];
}

export interface BrowserWorkspaceBridgeConfig {
  baseUrl: string;
  token: string | null;
}

export interface OpenBrowserWorkspaceTabRequest {
  url?: string;
  title?: string;
  show?: boolean;
  partition?: string;
  width?: number;
  height?: number;
}

export interface NavigateBrowserWorkspaceTabRequest {
  id: string;
  url: string;
}

export interface EvaluateBrowserWorkspaceTabRequest {
  id: string;
  script: string;
}

export interface BrowserWorkspaceDomElementSummary {
  ref?: string;
  selector: string;
  tag: string;
  text: string;
  type: string | null;
  name: string | null;
  href: string | null;
  value: string | null;
}

export interface BrowserWorkspaceCommand {
  subaction: BrowserWorkspaceSubaction;
  operation?: BrowserWorkspaceSubaction | "goto" | "read";
  action?: BrowserWorkspaceFindAction;
  baselinePath?: string;
  button?: BrowserWorkspaceMouseButton;
  clipboardAction?: BrowserWorkspaceClipboardAction;
  compact?: boolean;
  consoleAction?: BrowserWorkspaceConsoleAction;
  cookieAction?: BrowserWorkspaceCookieAction;
  deltaX?: number;
  deltaY?: number;
  device?: string;
  dialogAction?: BrowserWorkspaceDialogAction;
  diffAction?: BrowserWorkspaceDiffAction;
  domain?: string;
  id?: string;
  entryKey?: string;
  filePath?: string;
  files?: string[];
  frameAction?: BrowserWorkspaceFrameAction;
  fullPage?: boolean;
  headers?: Record<string, string>;
  url?: string;
  secondaryUrl?: string;
  title?: string;
  script?: string;
  show?: boolean;
  partition?: string;
  selector?: string;
  text?: string;
  value?: string;
  attribute?: string;
  direction?: BrowserWorkspaceScrollDirection;
  exact?: boolean;
  findBy?: BrowserWorkspaceFindBy;
  index?: number;
  key?: string;
  latitude?: number;
  longitude?: number;
  media?: "dark" | "light";
  method?: string;
  mouseAction?: BrowserWorkspaceMouseAction;
  networkAction?: BrowserWorkspaceNetworkAction;
  offline?: boolean;
  outputPath?: string;
  getMode?: BrowserWorkspaceGetMode;
  name?: string;
  pixels?: number;
  profilerAction?: BrowserWorkspaceProfilerAction;
  promptText?: string;
  requestId?: string;
  responseBody?: string;
  responseHeaders?: Record<string, string>;
  responseStatus?: number;
  role?: string;
  scale?: number;
  setAction?: BrowserWorkspaceSetAction;
  state?: BrowserWorkspaceWaitState;
  stateAction?: BrowserWorkspaceStateAction;
  status?: string;
  storageAction?: BrowserWorkspaceStorageAction;
  storageArea?: BrowserWorkspaceStorageArea;
  tabAction?: BrowserWorkspaceTabAction;
  timeoutMs?: number;
  traceAction?: BrowserWorkspaceTraceAction;
  windowAction?: BrowserWorkspaceWindowAction;
  width?: number;
  x?: number;
  y?: number;
  username?: string;
  password?: string;
  ms?: number;
  milliseconds?: number;
  steps?: BrowserWorkspaceCommand[];
}

export interface BrowserWorkspaceCommandResult {
  mode: BrowserWorkspaceMode;
  subaction: BrowserWorkspaceSubaction;
  tab?: BrowserWorkspaceTab;
  tabs?: BrowserWorkspaceTab[];
  closed?: boolean;
  value?: unknown;
  elements?: BrowserWorkspaceDomElementSummary[];
  snapshot?: { data: string };
  steps?: BrowserWorkspaceCommandResult[];
}

interface BrowserWorkspaceConsoleEntry {
  level: "error" | "info" | "log" | "warn";
  message: string;
  timestamp: string;
}

interface BrowserWorkspaceErrorEntry {
  message: string;
  stack: string | null;
  timestamp: string;
}

interface BrowserWorkspaceDialogState {
  defaultValue: string | null;
  message: string;
  open: boolean;
  type: "alert" | "beforeunload" | "confirm" | "prompt";
}

interface BrowserWorkspaceMouseState {
  buttons: BrowserWorkspaceMouseButton[];
  x: number;
  y: number;
}

interface BrowserWorkspaceSettingsState {
  credentials: { password: string; username: string } | null;
  device: string | null;
  geo: { latitude: number; longitude: number } | null;
  headers: Record<string, string>;
  media: "dark" | "light" | null;
  offline: boolean;
  viewport: { height: number; scale: number; width: number } | null;
}

interface BrowserWorkspaceNetworkRoute {
  abort: boolean;
  body: string | null;
  headers: Record<string, string>;
  pattern: string;
  status: number | null;
}

interface BrowserWorkspaceNetworkRequestRecord {
  id: string;
  matchedRoute: string | null;
  method: string;
  resourceType: string;
  responseBody: string | null;
  responseHeaders: Record<string, string>;
  status: number | null;
  timestamp: string;
  url: string;
}

interface BrowserWorkspaceTraceRecord {
  active: boolean;
  entries: Array<Record<string, unknown>>;
}

interface BrowserWorkspaceProfilerRecord {
  active: boolean;
  entries: Array<Record<string, unknown>>;
}

interface BrowserWorkspaceHarRecord {
  active: boolean;
  entries: BrowserWorkspaceNetworkRequestRecord[];
  startedAt: string | null;
}

interface BrowserWorkspaceSnapshotRecord {
  bodyText: string;
  title: string;
  url: string;
}

interface BrowserWorkspaceRuntimeState {
  consoleEntries: BrowserWorkspaceConsoleEntry[];
  currentFrame: string | null;
  dialog: BrowserWorkspaceDialogState | null;
  errors: BrowserWorkspaceErrorEntry[];
  highlightedSelector: string | null;
  lastScreenshotData: string | null;
  lastSnapshot: BrowserWorkspaceSnapshotRecord | null;
  mouse: BrowserWorkspaceMouseState;
  networkHar: BrowserWorkspaceHarRecord;
  networkNextRequestId: number;
  networkRequests: BrowserWorkspaceNetworkRequestRecord[];
  networkRoutes: BrowserWorkspaceNetworkRoute[];
  settings: BrowserWorkspaceSettingsState;
  trace: BrowserWorkspaceTraceRecord;
  profiler: BrowserWorkspaceProfilerRecord;
}

interface WebBrowserWorkspaceTabState extends BrowserWorkspaceTab {
  dom: JSDOM | null;
  history: string[];
  historyIndex: number;
  loadedUrl: string | null;
}

const webWorkspaceState: {
  nextId: number;
  tabs: WebBrowserWorkspaceTabState[];
} = {
  nextId: 1,
  tabs: [],
};

const browserWorkspaceElementRefs = new Map<string, Map<string, string>>();
const browserWorkspaceRuntimeState = new Map<string, BrowserWorkspaceRuntimeState>();
let browserWorkspaceClipboardText = "";

function normalizeEnvValue(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeBrowserWorkspaceText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBrowserWorkspaceNumberLike(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getBrowserWorkspaceTimestamp(): string {
  return new Date().toISOString();
}

function getBrowserWorkspaceElementRefStateKey(
  mode: BrowserWorkspaceMode,
  tabId: string,
): string {
  return `${mode}:${tabId}`;
}

function createBrowserWorkspaceRuntimeState(): BrowserWorkspaceRuntimeState {
  return {
    consoleEntries: [],
    currentFrame: null,
    dialog: null,
    errors: [],
    highlightedSelector: null,
    lastScreenshotData: null,
    lastSnapshot: null,
    mouse: { buttons: [], x: 0, y: 0 },
    networkHar: { active: false, entries: [], startedAt: null },
    networkNextRequestId: 1,
    networkRequests: [],
    networkRoutes: [],
    settings: {
      credentials: null,
      device: null,
      geo: null,
      headers: {},
      media: null,
      offline: false,
      viewport: null,
    },
    trace: { active: false, entries: [] },
    profiler: { active: false, entries: [] },
  };
}

function getBrowserWorkspaceRuntimeStateKey(
  mode: BrowserWorkspaceMode,
  tabId: string,
): string {
  return `${mode}:${tabId}`;
}

function getBrowserWorkspaceRuntimeState(
  mode: BrowserWorkspaceMode,
  tabId: string,
): BrowserWorkspaceRuntimeState {
  const key = getBrowserWorkspaceRuntimeStateKey(mode, tabId);
  let state = browserWorkspaceRuntimeState.get(key);
  if (!state) {
    state = createBrowserWorkspaceRuntimeState();
    browserWorkspaceRuntimeState.set(key, state);
  }
  return state;
}

function clearBrowserWorkspaceRuntimeState(
  mode: BrowserWorkspaceMode,
  tabId: string,
): void {
  browserWorkspaceRuntimeState.delete(getBrowserWorkspaceRuntimeStateKey(mode, tabId));
}

function resetBrowserWorkspaceRuntimeNavigationState(
  state: BrowserWorkspaceRuntimeState,
): void {
  state.currentFrame = null;
  state.dialog = null;
  state.highlightedSelector = null;
}

function appendBrowserWorkspaceTraceEntry(
  state: BrowserWorkspaceRuntimeState,
  entry: Record<string, unknown>,
): void {
  if (!state.trace.active) {
    return;
  }
  state.trace.entries.push({ ...entry, timestamp: getBrowserWorkspaceTimestamp() });
}

function appendBrowserWorkspaceProfilerEntry(
  state: BrowserWorkspaceRuntimeState,
  entry: Record<string, unknown>,
): void {
  if (!state.profiler.active) {
    return;
  }
  state.profiler.entries.push({
    ...entry,
    timestamp: getBrowserWorkspaceTimestamp(),
  });
}

function clearBrowserWorkspaceElementRefs(
  mode: BrowserWorkspaceMode,
  tabId: string,
): void {
  browserWorkspaceElementRefs.delete(
    getBrowserWorkspaceElementRefStateKey(mode, tabId),
  );
}

function registerBrowserWorkspaceElementRefs(
  mode: BrowserWorkspaceMode,
  tabId: string,
  elements: BrowserWorkspaceDomElementSummary[],
): BrowserWorkspaceDomElementSummary[] {
  if (elements.length === 0) {
    clearBrowserWorkspaceElementRefs(mode, tabId);
    return [];
  }

  const refs = new Map<string, string>();
  const augmented = elements.map((element, index) => {
    const ref = `@e${index + 1}`;
    refs.set(ref, element.selector);
    return { ...element, ref };
  });
  browserWorkspaceElementRefs.set(
    getBrowserWorkspaceElementRefStateKey(mode, tabId),
    refs,
  );
  return augmented;
}

function resolveBrowserWorkspaceElementRef(
  mode: BrowserWorkspaceMode,
  tabId: string,
  ref: string,
): string | null {
  return (
    browserWorkspaceElementRefs
      .get(getBrowserWorkspaceElementRefStateKey(mode, tabId))
      ?.get(ref.trim()) ?? null
  );
}

function resolveBrowserWorkspaceCommandElementRefs(
  command: BrowserWorkspaceCommand,
  mode: BrowserWorkspaceMode,
  tabId: string,
): BrowserWorkspaceCommand {
  const selector = command.selector?.trim();
  if (!selector) {
    return command;
  }

  const match = selector.match(/^(@e\d+)([\s\S]*)$/i);
  if (!match?.[1]) {
    return command;
  }

  const resolvedSelector = resolveBrowserWorkspaceElementRef(mode, tabId, match[1]);
  if (!resolvedSelector) {
    throw new Error(
      `Unknown browser snapshot element ref ${match[1]}. Run snapshot or inspect again before reusing element refs.`,
    );
  }

  return {
    ...command,
    selector: `${resolvedSelector}${match[2] ?? ""}`,
  };
}

function assertBrowserWorkspaceUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed === "about:blank") {
    return trimmed;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`browser workspace rejected invalid URL: ${rawUrl}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `browser workspace only supports http/https URLs, got ${parsed.protocol}`,
    );
  }

  return parsed.toString();
}

function createBrowserWorkspaceDesktopOnlyMessage(
  subaction: BrowserWorkspaceSubaction,
): string {
  return `Milady browser workspace ${subaction} is only available in the desktop app.`;
}

function createBrowserWorkspaceNotFoundError(tabId: string): Error {
  return new Error(
    `Browser workspace request failed (404): Tab ${tabId} was not found.`,
  );
}

function createBrowserWorkspaceCommandTargetError(
  subaction: BrowserWorkspaceSubaction,
): Error {
  return new Error(
    `Milady browser workspace ${subaction} requires a current tab. Open or show a tab first, or pass an explicit id.`,
  );
}

function inferBrowserWorkspaceTitle(url: string): string {
  if (url === "about:blank") {
    return "New Tab";
  }

  try {
    return new URL(url).hostname.replace(/^www\./, "") || "Milady Browser";
  } catch {
    return "Milady Browser";
  }
}

function cloneBrowserWorkspaceTab(tab: BrowserWorkspaceTab): BrowserWorkspaceTab {
  return { ...tab };
}

function cloneBrowserWorkspaceTabs(
  tabs: BrowserWorkspaceTab[],
): BrowserWorkspaceTab[] {
  return tabs.map((tab) => cloneBrowserWorkspaceTab(tab));
}

function cloneWebBrowserWorkspaceTabState(
  tab: WebBrowserWorkspaceTabState,
): BrowserWorkspaceTab {
  return {
    id: tab.id,
    title: tab.title,
    url: tab.url,
    partition: tab.partition,
    visible: tab.visible,
    createdAt: tab.createdAt,
    updatedAt: tab.updatedAt,
    lastFocusedAt: tab.lastFocusedAt,
  };
}

function clearWebBrowserWorkspaceTabElementRefs(tabId: string): void {
  clearBrowserWorkspaceElementRefs("web", tabId);
}

function createEmptyWebBrowserWorkspaceDom(url: string): JSDOM {
  return new JSDOM(
    "<!doctype html><html lang=\"en\"><head><title>New Tab</title></head><body></body></html>",
    {
      pretendToBeVisual: true,
      url,
    },
  );
}

function getWebBrowserWorkspaceTabIndex(tabId: string): number {
  return webWorkspaceState.tabs.findIndex((tab) => tab.id === tabId);
}

function getWebBrowserWorkspaceTabState(tabId: string): WebBrowserWorkspaceTabState {
  const tab = webWorkspaceState.tabs.find((entry) => entry.id === tabId);
  if (!tab) {
    throw createBrowserWorkspaceNotFoundError(tabId);
  }
  return tab;
}

function getCurrentWebBrowserWorkspaceTabState(): WebBrowserWorkspaceTabState | null {
  if (webWorkspaceState.tabs.length === 0) {
    return null;
  }

  return (
    webWorkspaceState.tabs.find((tab) => tab.visible) ??
    [...webWorkspaceState.tabs].sort((left, right) => {
      const leftTime = left.lastFocusedAt ?? left.updatedAt;
      const rightTime = right.lastFocusedAt ?? right.updatedAt;
      return rightTime.localeCompare(leftTime) || left.id.localeCompare(right.id);
    })[0] ??
    null
  );
}

function createWebBrowserWorkspaceTab(
  request: OpenBrowserWorkspaceTabRequest,
): WebBrowserWorkspaceTabState {
  const now = getBrowserWorkspaceTimestamp();
  const url = assertBrowserWorkspaceUrl(request.url?.trim() || "about:blank");
  const visible = request.show === true;
  return {
    id: `btab_${webWorkspaceState.nextId++}`,
    title: request.title?.trim() || inferBrowserWorkspaceTitle(url),
    url,
    partition: request.partition?.trim() || DEFAULT_WEB_PARTITION,
    visible,
    createdAt: now,
    updatedAt: now,
    lastFocusedAt: visible ? now : null,
    dom: url === "about:blank" ? createEmptyWebBrowserWorkspaceDom(url) : null,
    history: [url],
    historyIndex: 0,
    loadedUrl: url === "about:blank" ? url : null,
  };
}

function buildBrowserWorkspaceCssStringLiteral(value: string): string {
  return JSON.stringify(value);
}

function buildBrowserWorkspaceElementSelector(element: Element): string {
  const escapedId =
    typeof (globalThis as { CSS?: { escape?: (value: string) => string } }).CSS
      ?.escape === "function"
      ? (globalThis as { CSS: { escape: (value: string) => string } }).CSS.escape(
          element.id,
        )
      : element.id.replace(/[^a-zA-Z0-9_-]/g, "\\$&");

  if (element.id) {
    return `#${escapedId}`;
  }

  const testId = element.getAttribute("data-testid")?.trim();
  if (testId) {
    return `[data-testid=${buildBrowserWorkspaceCssStringLiteral(testId)}]`;
  }

  const name = element.getAttribute("name")?.trim();
  if (name) {
    return `${element.tagName.toLowerCase()}[name=${buildBrowserWorkspaceCssStringLiteral(name)}]`;
  }

  const type = element.getAttribute("type")?.trim();
  if (type) {
    return `${element.tagName.toLowerCase()}[type=${buildBrowserWorkspaceCssStringLiteral(type)}]`;
  }

  const parent = element.parentElement;
  if (!parent) {
    return element.tagName.toLowerCase();
  }

  const siblings = parent.children;
  let index = 1;
  for (let cursor = 0; cursor < siblings.length; cursor += 1) {
    const sibling = siblings.item(cursor);
    if (!sibling || sibling.tagName !== element.tagName) {
      continue;
    }
    if (sibling === element) {
      break;
    }
    index += 1;
  }

  return `${element.tagName.toLowerCase()}:nth-of-type(${index})`;
}

function createBrowserWorkspaceElementSummary(
  element: Element,
): BrowserWorkspaceDomElementSummary {
  const inputLike =
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.tagName === "SELECT";

  const elementValue = inputLike
    ? ((element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)
        .value ?? null)
    : null;

  return {
    selector: buildBrowserWorkspaceElementSelector(element),
    tag: element.tagName.toLowerCase(),
    text: normalizeBrowserWorkspaceText(
      inputLike ? elementValue : element.textContent,
    ),
    type: element.getAttribute("type"),
    name: element.getAttribute("name"),
    href: element.getAttribute("href"),
    value: typeof elementValue === "string" ? elementValue : null,
  };
}

function collectBrowserWorkspaceInspectElements(
  document: Document,
): BrowserWorkspaceDomElementSummary[] {
  const elements = Array.from(
    document.querySelectorAll(
      "a, button, input, textarea, select, form, [role='button'], [data-testid]",
    ),
  );
  const summaries: BrowserWorkspaceDomElementSummary[] = [];
  const seenSelectors = new Set<string>();

  for (const element of elements) {
    const summary = createBrowserWorkspaceElementSummary(element);
    if (seenSelectors.has(summary.selector)) {
      continue;
    }
    seenSelectors.add(summary.selector);
    summaries.push(summary);
    if (summaries.length >= 40) {
      break;
    }
  }

  return summaries;
}

function getBrowserWorkspaceElementSearchTexts(element: Element): string[] {
  const labelText =
    element.id && element.ownerDocument
      ? Array.from(
          element.ownerDocument.querySelectorAll(`label[for="${element.id}"]`),
        )
          .map((label) => label.textContent)
          .join(" ")
      : "";
  return [
    element.textContent,
    element.getAttribute("aria-label"),
    element.getAttribute("placeholder"),
    element.getAttribute("title"),
    element.getAttribute("name"),
    element.getAttribute("alt"),
    element.getAttribute("data-testid"),
    labelText,
    (element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value,
  ]
    .map((value) => normalizeBrowserWorkspaceText(value))
    .filter(Boolean);
}

function browserWorkspaceTextMatches(
  candidate: string,
  wanted: string,
  exact = false,
): boolean {
  const normalizedCandidate = normalizeBrowserWorkspaceText(candidate).toLowerCase();
  const normalizedWanted = normalizeBrowserWorkspaceText(wanted).toLowerCase();
  if (!normalizedCandidate || !normalizedWanted) {
    return false;
  }
  return exact
    ? normalizedCandidate === normalizedWanted
    : normalizedCandidate.includes(normalizedWanted);
}

function isBrowserWorkspaceElementVisible(element: Element): boolean {
  if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") {
    return false;
  }

  const htmlElement = element as HTMLElement;
  const inlineDisplay = htmlElement.style?.display?.trim().toLowerCase();
  const inlineVisibility = htmlElement.style?.visibility?.trim().toLowerCase();
  if (inlineDisplay === "none" || inlineVisibility === "hidden") {
    return false;
  }

  return true;
}

function findBrowserWorkspaceElementByLabel(
  document: Document,
  labelText: string,
  exact = false,
): Element | null {
  const labels = Array.from(document.querySelectorAll("label"));
  for (const label of labels) {
    if (!browserWorkspaceTextMatches(label.textContent ?? "", labelText, exact)) {
      continue;
    }

    const forId = label.getAttribute("for")?.trim();
    if (forId) {
      const explicit = document.getElementById(forId);
      if (explicit) {
        return explicit;
      }
    }

    const nested = label.querySelector("input, textarea, select, button");
    if (nested) {
      return nested;
    }
  }
  return null;
}

function getBrowserWorkspaceNativeRole(element: Element): string | null {
  const explicitRole = element.getAttribute("role")?.trim().toLowerCase();
  if (explicitRole) {
    return explicitRole;
  }

  const tag = element.tagName.toLowerCase();
  if (tag === "a" && element.getAttribute("href")) return "link";
  if (tag === "button") return "button";
  if (tag === "select") return "combobox";
  if (tag === "option") return "option";
  if (tag === "textarea") return "textbox";
  if (tag === "form") return "form";
  if (/^h[1-6]$/.test(tag)) return "heading";
  if (tag === "input") {
    const input = element as HTMLInputElement;
    const type = (input.type || "text").toLowerCase();
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (
      ["button", "submit", "reset", "image"].includes(type)
    ) {
      return "button";
    }
    return "textbox";
  }
  return null;
}

function findBrowserWorkspaceElementByRole(
  document: Document,
  role: string,
  name?: string,
  exact = false,
): Element | null {
  const wantedRole = role.trim().toLowerCase();
  if (!wantedRole) {
    return null;
  }

  const candidates = Array.from(
    document.querySelectorAll(
      "a, button, input, textarea, select, option, form, h1, h2, h3, h4, h5, h6, [role], [data-testid]",
    ),
  );
  for (const candidate of candidates) {
    if (getBrowserWorkspaceNativeRole(candidate) !== wantedRole) {
      continue;
    }
    if (!name?.trim()) {
      return candidate;
    }
    const haystacks = getBrowserWorkspaceElementSearchTexts(candidate);
    if (haystacks.some((value) => browserWorkspaceTextMatches(value, name, exact))) {
      return candidate;
    }
  }
  return null;
}

function trimBrowserWorkspaceQuotedValue(value: string): string {
  const trimmed = value.trim();
  const hasTextMatch = trimmed.match(/^has-text\((['"])([\s\S]*?)\1\)$/i);
  if (hasTextMatch?.[2]) {
    return hasTextMatch[2].trim();
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normalizeBrowserWorkspaceSelectorSyntax(selector: string): string {
  let normalized = selector.trim();
  normalized = normalized.replace(
    /^role\s*[:=]\s*([a-z0-9_-]+)\s+name\s*[:=]\s*(.+)$/i,
    "role=$1[name=$2]",
  );
  normalized = normalized.replace(
    /^((?:label|text|placeholder|alt|title|testid|data-testid)\s*[:=]\s*(?:has-text\((['"])[\s\S]*?\2\)|"[^"]+"|'[^']+'|[^>]+?))\s+((?:input|textarea|select)[\s\S]*)$/i,
    "$1 >> $3",
  );
  return normalized;
}

function parseBrowserWorkspaceSemanticSelector(
  selector: string,
): Pick<
  BrowserWorkspaceCommand,
  "findBy" | "name" | "role" | "selector" | "text"
> | null {
  const trimmed = normalizeBrowserWorkspaceSelectorSyntax(selector);
  const match = trimmed.match(/^([a-z-]+)\s*[:=]\s*(.+)$/i);
  if (!match) {
    return null;
  }

  const kind = match[1]?.trim().toLowerCase();
  const rawValue = match[2]?.trim() ?? "";
  if (!kind || !rawValue) {
    return null;
  }

  switch (kind) {
    case "alt":
      return { findBy: "alt", text: trimBrowserWorkspaceQuotedValue(rawValue) };
    case "css":
      return { selector: trimBrowserWorkspaceQuotedValue(rawValue) };
    case "data-testid":
    case "testid":
      return { findBy: "testid", text: trimBrowserWorkspaceQuotedValue(rawValue) };
    case "label":
      return { findBy: "label", text: trimBrowserWorkspaceQuotedValue(rawValue) };
    case "placeholder":
      return {
        findBy: "placeholder",
        text: trimBrowserWorkspaceQuotedValue(rawValue),
      };
    case "role": {
      const roleMatch = rawValue.match(
        /^([a-z0-9_-]+)(?:\s*\[\s*name\s*[:=]\s*(.+?)\s*\])?$/i,
      );
      if (!roleMatch?.[1]) {
        return null;
      }
      return {
        findBy: "role",
        name: roleMatch[2]
          ? trimBrowserWorkspaceQuotedValue(roleMatch[2])
          : undefined,
        role: roleMatch[1].trim().toLowerCase(),
      };
    }
    case "text":
      return { findBy: "text", text: trimBrowserWorkspaceQuotedValue(rawValue) };
    case "title":
      return { findBy: "title", text: trimBrowserWorkspaceQuotedValue(rawValue) };
    default:
      return null;
  }
}

function mergeBrowserWorkspaceSelectorCommand(
  command: BrowserWorkspaceCommand | undefined,
  selector: string,
): BrowserWorkspaceCommand | null {
  const parsed = parseBrowserWorkspaceSemanticSelector(selector);
  if (!parsed) {
    return null;
  }

  return {
    ...command,
    ...parsed,
    selector: parsed.selector,
  } as BrowserWorkspaceCommand;
}

function queryBrowserWorkspaceSelector(
  root: Document | Element,
  selector: string,
): Element | null {
  try {
    return root.querySelector(selector);
  } catch {
    throw new Error(`Invalid selector ${selector}`);
  }
}

function queryAllBrowserWorkspaceSelector(
  root: Document | Element,
  selector: string,
): Element[] {
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    throw new Error(`Invalid selector ${selector}`);
  }
}

function resolveBrowserWorkspaceFindElement(
  document: Document,
  command: BrowserWorkspaceCommand,
): Element | null {
  switch (command.findBy) {
    case "alt":
      return Array.from(document.querySelectorAll("[alt]")).find((element) =>
        browserWorkspaceTextMatches(element.getAttribute("alt") ?? "", command.text ?? "", command.exact),
      ) ?? null;
    case "first":
      return command.selector?.trim()
        ? queryBrowserWorkspaceSelector(document, command.selector)
        : null;
    case "label":
      return command.text?.trim()
        ? findBrowserWorkspaceElementByLabel(document, command.text, command.exact)
        : null;
    case "last":
      return command.selector?.trim()
        ? queryAllBrowserWorkspaceSelector(document, command.selector).at(-1) ?? null
        : null;
    case "nth":
      if (!command.selector?.trim()) {
        return null;
      }
      if (typeof command.index !== "number" || !Number.isInteger(command.index)) {
        return null;
      }
      return queryAllBrowserWorkspaceSelector(document, command.selector).at(
        command.index,
      ) ?? null;
    case "placeholder":
      return Array.from(document.querySelectorAll("[placeholder]")).find((element) =>
        browserWorkspaceTextMatches(
          element.getAttribute("placeholder") ?? "",
          command.text ?? "",
          command.exact,
        ),
      ) ?? null;
    case "role":
      return command.role?.trim()
        ? findBrowserWorkspaceElementByRole(
            document,
            command.role,
            command.name,
            command.exact,
          )
        : null;
    case "testid":
      return command.text?.trim()
        ? document.querySelector(`[data-testid=${buildBrowserWorkspaceCssStringLiteral(command.text)}]`)
        : null;
    case "text":
      return command.text?.trim()
        ? findBrowserWorkspaceElementByText(document, command.text)
        : null;
    case "title":
      return Array.from(document.querySelectorAll("[title]")).find((element) =>
        browserWorkspaceTextMatches(
          element.getAttribute("title") ?? "",
          command.text ?? "",
          command.exact,
        ),
      ) ?? null;
    default:
      return null;
  }
}

function findBrowserWorkspaceElementByText(
  document: Document,
  needle: string,
): Element | null {
  const wanted = normalizeBrowserWorkspaceText(needle).toLowerCase();
  if (!wanted) {
    return null;
  }

  const candidates = Array.from(
    document.querySelectorAll(
      "a, button, input, textarea, select, option, label, h1, h2, h3, [role='button'], [data-testid]",
    ),
  );

  for (const element of candidates) {
    const haystacks = [
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("placeholder"),
      element.getAttribute("title"),
      element.getAttribute("name"),
      (element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)
        .value,
    ]
      .map((value) => normalizeBrowserWorkspaceText(value))
      .filter(Boolean)
      .map((value) => value.toLowerCase());

    if (haystacks.some((value) => value.includes(wanted))) {
      return element;
    }
  }

  return null;
}

function resolveBrowserWorkspaceElement(
  document: Document,
  selector?: string,
  text?: string,
  command?: BrowserWorkspaceCommand,
): Element | null {
  const normalizedSelector = selector
    ? normalizeBrowserWorkspaceSelectorSyntax(selector)
    : undefined;
  if (normalizedSelector) {
    const selectorChain = normalizedSelector
      .split(/\s*>>\s*/)
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (selectorChain.length > 1) {
      let current = resolveBrowserWorkspaceElement(
        document,
        selectorChain[0],
        undefined,
        command,
      );
      for (let index = 1; current && index < selectorChain.length; index += 1) {
        const segment = selectorChain[index];
        if (!segment) {
          continue;
        }
        if (
          typeof (current as Element).matches === "function" &&
          (current as Element).matches(segment)
        ) {
          continue;
        }
        if (
          /^(input|textarea|select)(?:\[[^\]]+\])?$/i.test(segment) &&
          (current.tagName === "INPUT" ||
            current.tagName === "TEXTAREA" ||
            current.tagName === "SELECT")
        ) {
          continue;
        }
        current = queryBrowserWorkspaceSelector(current, segment);
      }
      return current;
    }
    const semanticCommand = mergeBrowserWorkspaceSelectorCommand(
      command,
      normalizedSelector,
    );
    if (semanticCommand) {
      return resolveBrowserWorkspaceFindElement(document, semanticCommand);
    }
    return queryBrowserWorkspaceSelector(document, normalizedSelector);
  }

  if (command?.findBy) {
    return resolveBrowserWorkspaceFindElement(document, command);
  }

  const normalizedText = text?.trim();
  if (normalizedText) {
    return findBrowserWorkspaceElementByText(document, normalizedText);
  }

  return null;
}

function ensureBrowserWorkspaceFormControlElement(
  element: Element,
  subaction: "fill" | "keyboardinserttext" | "keyboardtype" | "select" | "type",
): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.tagName === "SELECT"
  ) {
    return element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  }

  throw new Error(
    `Milady browser workspace ${subaction} requires an input, textarea, or select target.`,
  );
}

function ensureBrowserWorkspaceCheckboxElement(
  element: Element,
  subaction: "check" | "uncheck",
): HTMLInputElement {
  if (element.tagName === "INPUT") {
    const input = element as HTMLInputElement;
    const type = input.type.trim().toLowerCase();
    if (type === "checkbox" || type === "radio") {
      return input;
    }
  }

  throw new Error(
    `Milady browser workspace ${subaction} requires a checkbox or radio input target.`,
  );
}

function getBrowserWorkspaceElementStyles(
  element: Element,
  window: Window,
): Record<string, string | null> {
  const computed = window.getComputedStyle(element);
  return {
    display: computed.display || null,
    visibility: computed.visibility || null,
    opacity: computed.opacity || null,
  };
}

function normalizeBrowserWorkspaceCommand(
  command: BrowserWorkspaceCommand,
): BrowserWorkspaceCommand {
  const raw = command as BrowserWorkspaceCommand & Record<string, unknown>;
  const normalizedSubaction =
    typeof raw.subaction === "string"
      ? raw.subaction.trim().toLowerCase()
      : typeof raw.operation === "string"
        ? raw.operation.trim().toLowerCase()
        : "";
  const subaction =
    normalizedSubaction === "goto"
      ? "navigate"
      : normalizedSubaction === "read"
        ? "get"
        : command.subaction;
  const timeoutMs =
    parseBrowserWorkspaceNumberLike(command.timeoutMs) ??
    parseBrowserWorkspaceNumberLike(raw.ms) ??
    parseBrowserWorkspaceNumberLike(raw.milliseconds);

  return {
    ...command,
    subaction,
    timeoutMs,
    steps: Array.isArray(command.steps)
      ? command.steps.map((step) => normalizeBrowserWorkspaceCommand(step))
      : command.steps,
  };
}

function getBrowserWorkspaceElementBox(
  element: Element,
): {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
  x: number;
  y: number;
} {
  const box =
    typeof (element as HTMLElement).getBoundingClientRect === "function"
      ? (element as HTMLElement).getBoundingClientRect()
      : {
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
          x: 0,
          y: 0,
        };
  return {
    bottom: box.bottom,
    height: box.height,
    left: box.left,
    right: box.right,
    top: box.top,
    width: box.width,
    x: box.x,
    y: box.y,
  };
}

function getBrowserWorkspaceElementValue(
  element: Element,
): string | boolean | null {
  if (
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.tagName === "SELECT"
  ) {
    const control =
      element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (element.tagName === "INPUT") {
      const input = control as HTMLInputElement;
      const type = input.type.trim().toLowerCase();
      if (type === "checkbox" || type === "radio") {
        return input.checked;
      }
    }
    return control.value;
  }
  return null;
}

function findClosestBrowserWorkspaceForm(
  element: Element | null,
): HTMLFormElement | null {
  if (!element) {
    return null;
  }
  return (element.tagName === "FORM"
    ? element
    : element.closest("form")) as HTMLFormElement | null;
}

async function activateWebBrowserWorkspaceElement(
  tab: WebBrowserWorkspaceTabState,
  element: Element,
  subaction: "click" | "dblclick",
): Promise<BrowserWorkspaceCommandResult> {
  const tag = element.tagName.toLowerCase();
  if (tag === "a") {
    const href = element.getAttribute("href")?.trim();
    if (!href) {
      throw new Error("Target link does not have an href.");
    }
    const nextUrl = new URL(href, tab.url).toString();
    clearWebBrowserWorkspaceTabElementRefs(tab.id);
    tab.url = assertBrowserWorkspaceUrl(nextUrl);
    tab.title = inferBrowserWorkspaceTitle(tab.url);
    tab.dom = null;
    tab.loadedUrl = null;
    pushWebBrowserWorkspaceHistory(tab, tab.url);
    await loadWebBrowserWorkspaceTabDocument(tab);
    return {
      mode: "web",
      subaction,
      tab: cloneWebBrowserWorkspaceTabState(tab),
      value: {
        clickCount: subaction === "dblclick" ? 2 : 1,
        selector: buildBrowserWorkspaceElementSelector(element),
        url: tab.url,
      },
    };
  }

  const inputElement = tag === "input" ? (element as HTMLInputElement) : null;
  const inputType = inputElement?.type?.toLowerCase() ?? "";
  if (inputElement && (inputType === "checkbox" || inputType === "radio")) {
    inputElement.checked = inputType === "radio" ? true : !inputElement.checked;
    return {
      mode: "web",
      subaction,
      value: {
        checked: inputElement.checked,
        clickCount: subaction === "dblclick" ? 2 : 1,
        selector: buildBrowserWorkspaceElementSelector(element),
      },
    };
  }

  const submitForm = findClosestBrowserWorkspaceForm(element);
  if (
    submitForm &&
    (tag === "form" ||
      tag === "button" ||
      (tag === "input" && ["button", "image", "submit"].includes(inputType || "submit")))
  ) {
    await submitWebBrowserWorkspaceForm(tab, submitForm);
    return {
      mode: "web",
      subaction,
      tab: cloneWebBrowserWorkspaceTabState(tab),
      value: {
        clickCount: subaction === "dblclick" ? 2 : 1,
        selector: buildBrowserWorkspaceElementSelector(element),
        url: tab.url,
      },
    };
  }

  return {
    mode: "web",
    subaction,
    value: {
      clickCount: subaction === "dblclick" ? 2 : 1,
      selector: buildBrowserWorkspaceElementSelector(element),
      text: normalizeBrowserWorkspaceText(element.textContent),
    },
  };
}

function setBrowserWorkspaceControlValue(
  control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  nextValue: string,
): void {
  control.value = nextValue;
  if (control.tagName === "TEXTAREA") {
    control.textContent = nextValue;
  }
  control.setAttribute("value", nextValue);
}

function scrollWebBrowserWorkspaceTarget(
  dom: JSDOM,
  element: Element | null,
  direction: BrowserWorkspaceScrollDirection,
  pixels: number,
): {
  axis: "x" | "y";
  selector: string | null;
  value: number;
} {
  const resolvedPixels = Number.isFinite(pixels) ? Math.max(1, Math.abs(pixels)) : 240;
  const axis = direction === "left" || direction === "right" ? "x" : "y";
  const delta =
    direction === "up" || direction === "left" ? -resolvedPixels : resolvedPixels;

  if (element && element instanceof dom.window.HTMLElement) {
    if (axis === "y") {
      element.scrollTop = (element.scrollTop || 0) + delta;
      return {
        axis,
        selector: buildBrowserWorkspaceElementSelector(element),
        value: element.scrollTop,
      };
    }
    element.scrollLeft = (element.scrollLeft || 0) + delta;
    return {
      axis,
      selector: buildBrowserWorkspaceElementSelector(element),
      value: element.scrollLeft,
    };
  }

  const key = axis === "y" ? "__miladyScrollY" : "__miladyScrollX";
  const current = Number((dom.window as unknown as Record<string, unknown>)[key] ?? 0);
  const next = current + delta;
  (dom.window as unknown as Record<string, unknown>)[key] = next;
  return {
    axis,
    selector: null,
    value: next,
  };
}

function ensureBrowserWorkspaceDom(
  tab: WebBrowserWorkspaceTabState,
): JSDOM {
  if (tab.dom && tab.loadedUrl === tab.url) {
    return tab.dom;
  }

  throw new Error(
    `Browser workspace tab ${tab.id} is not loaded yet. Reload or inspect the page first.`,
  );
}

async function loadWebBrowserWorkspaceTabDocument(
  tab: WebBrowserWorkspaceTabState,
): Promise<void> {
  if (tab.url === "about:blank") {
    tab.dom = createEmptyWebBrowserWorkspaceDom(tab.url);
    tab.loadedUrl = tab.url;
    tab.title = "New Tab";
    tab.updatedAt = getBrowserWorkspaceTimestamp();
    return;
  }

  const response = await fetch(tab.url, {
    redirect: "follow",
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `Browser workspace web load failed (${response.status}): ${tab.url}`,
    );
  }

  const html = await response.text();
  const finalUrl = assertBrowserWorkspaceUrl(response.url?.trim() || tab.url);
  const dom = new JSDOM(html, {
    pretendToBeVisual: true,
    url: finalUrl,
  });

  tab.dom = dom;
  tab.loadedUrl = finalUrl;
  tab.url = finalUrl;
  tab.title =
    normalizeBrowserWorkspaceText(dom.window.document.title) ||
    inferBrowserWorkspaceTitle(finalUrl);
  tab.updatedAt = getBrowserWorkspaceTimestamp();
  tab.history[tab.historyIndex] = finalUrl;
}

async function ensureLoadedWebBrowserWorkspaceTabDocument(
  tab: WebBrowserWorkspaceTabState,
): Promise<JSDOM> {
  if (!tab.dom || tab.loadedUrl !== tab.url) {
    await loadWebBrowserWorkspaceTabDocument(tab);
  }
  return ensureBrowserWorkspaceDom(tab);
}

function pushWebBrowserWorkspaceHistory(
  tab: WebBrowserWorkspaceTabState,
  nextUrl: string,
): void {
  const nextHistory = tab.history.slice(0, tab.historyIndex + 1);
  nextHistory.push(nextUrl);
  tab.history = nextHistory;
  tab.historyIndex = nextHistory.length - 1;
}

function findWebBrowserWorkspaceTargetTabId(
  command: BrowserWorkspaceCommand,
): string {
  if (command.id?.trim()) {
    return command.id.trim();
  }
  const current = getCurrentWebBrowserWorkspaceTabState();
  if (!current) {
    throw createBrowserWorkspaceCommandTargetError(command.subaction);
  }
  return current.id;
}

function resolveBrowserWorkspaceCurrentTab(
  tabs: BrowserWorkspaceTab[],
): BrowserWorkspaceTab | null {
  if (tabs.length === 0) {
    return null;
  }

  return (
    tabs.find((tab) => tab.visible) ??
    [...tabs].sort((left, right) => {
      const leftTime = left.lastFocusedAt ?? left.updatedAt;
      const rightTime = right.lastFocusedAt ?? right.updatedAt;
      return rightTime.localeCompare(leftTime) || left.id.localeCompare(right.id);
    })[0] ??
    null
  );
}

async function resolveDesktopBrowserWorkspaceTargetTabId(
  command: BrowserWorkspaceCommand,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  if (command.id?.trim()) {
    return command.id.trim();
  }

  const tabs = await listBrowserWorkspaceTabs(env);
  const current = resolveBrowserWorkspaceCurrentTab(tabs);
  if (!current) {
    throw createBrowserWorkspaceCommandTargetError(command.subaction);
  }
  return current.id;
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    return (await response.text()).trim().slice(0, 240);
  } catch {
    return "";
  }
}

async function requestBrowserWorkspace<T>(
  path: string,
  init?: RequestInit,
  env: NodeJS.ProcessEnv = process.env,
): Promise<T> {
  const config = resolveBrowserWorkspaceBridgeConfig(env);
  if (!config) {
    throw new Error(getBrowserWorkspaceUnavailableMessage());
  }

  const headers = new Headers(init?.headers ?? {});
  headers.set("Accept", "application/json");
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  if (config.token) {
    headers.set("Authorization", `Bearer ${config.token}`);
  }

  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    const details = await readErrorBody(response);
    throw new Error(
      `Browser workspace request failed (${response.status})${details ? `: ${details}` : ""}`,
    );
  }

  return (await response.json()) as T;
}

function createDesktopBrowserWorkspaceCommandScript(
  command: BrowserWorkspaceCommand,
): string {
  return `
(() => {
  const command = ${JSON.stringify(command)};
  const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
  const textMatches = (candidate, wanted, exact = false) => {
    const left = normalize(candidate).toLowerCase();
    const right = normalize(wanted).toLowerCase();
    if (!left || !right) return false;
    return exact ? left === right : left.includes(right);
  };
  const selectorFor = (element) => {
    if (!element) return "";
    if (element.id) return "#" + element.id.replace(/[^a-zA-Z0-9_-]/g, "\\\\$&");
    const testId = element.getAttribute?.("data-testid");
    if (testId) return \`[data-testid="\${testId}"]\`;
    const name = element.getAttribute?.("name");
    if (name) return \`\${element.tagName.toLowerCase()}[name="\${name}"]\`;
    const type = element.getAttribute?.("type");
    if (type) return \`\${element.tagName.toLowerCase()}[type="\${type}"]\`;
    let index = 1;
    let previous = element.previousElementSibling;
    while (previous) {
      if (previous.tagName === element.tagName) index += 1;
      previous = previous.previousElementSibling;
    }
    return \`\${element.tagName.toLowerCase()}:nth-of-type(\${index})\`;
  };
  const serialize = (element) => {
    const value =
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
        ? element.value
        : null;
    return {
      selector: selectorFor(element),
      tag: element.tagName.toLowerCase(),
      text: normalize(value ?? element.textContent),
      type: element.getAttribute?.("type"),
      name: element.getAttribute?.("name"),
      href: element.getAttribute?.("href"),
      value: typeof value === "string" ? value : null,
    };
  };
  const searchTexts = (element) => {
    const labelText = element.id
      ? Array.from(document.querySelectorAll('label[for="' + element.id + '"]'))
          .map((label) => label.textContent)
          .join(" ")
      : "";
    return [
      element.textContent,
      element.getAttribute?.("aria-label"),
      element.getAttribute?.("placeholder"),
      element.getAttribute?.("title"),
      element.getAttribute?.("name"),
      element.getAttribute?.("alt"),
      element.getAttribute?.("data-testid"),
      labelText,
      element.value,
    ]
      .map((value) => normalize(value))
      .filter(Boolean);
  };
  const isVisible = (element) => {
    if (!element) return false;
    if (element.hasAttribute?.("hidden") || element.getAttribute?.("aria-hidden") === "true") {
      return false;
    }
    const style = element.style || {};
    return style.display !== "none" && style.visibility !== "hidden";
  };
  const nativeRole = (element) => {
    const explicit = element.getAttribute?.("role")?.trim()?.toLowerCase();
    if (explicit) return explicit;
    const tag = element.tagName.toLowerCase();
    if (tag === "a" && element.getAttribute?.("href")) return "link";
    if (tag === "button") return "button";
    if (tag === "select") return "combobox";
    if (tag === "option") return "option";
    if (tag === "textarea") return "textbox";
    if (tag === "form") return "form";
    if (/^h[1-6]$/.test(tag)) return "heading";
    if (tag === "input") {
      const type = (element.type || "text").toLowerCase();
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (["button", "submit", "reset", "image"].includes(type)) return "button";
      return "textbox";
    }
    return null;
  };
  const findByText = (wanted) => {
    const needle = normalize(wanted).toLowerCase();
    if (!needle) return null;
    const elements = Array.from(document.querySelectorAll(
      "a, button, input, textarea, select, option, label, h1, h2, h3, [role='button'], [data-testid]"
    ));
    for (const element of elements) {
      const haystacks = [
        element.textContent,
        element.getAttribute?.("aria-label"),
        element.getAttribute?.("placeholder"),
        element.getAttribute?.("title"),
        element.getAttribute?.("name"),
        element.value,
      ]
        .map((value) => normalize(value))
        .filter(Boolean)
        .map((value) => value.toLowerCase());
      if (haystacks.some((value) => value.includes(needle))) {
        return element;
      }
    }
    return null;
  };
  const findByLabel = (wanted, exact = false) => {
    const labels = Array.from(document.querySelectorAll("label"));
    for (const label of labels) {
      if (!textMatches(label.textContent, wanted, exact)) continue;
      const forId = label.getAttribute("for");
      if (forId) {
        const explicit = document.getElementById(forId);
        if (explicit) return explicit;
      }
      const nested = label.querySelector("input, textarea, select, button");
      if (nested) return nested;
    }
    return null;
  };
  const findByRole = (role, name, exact = false) => {
    const candidates = Array.from(
      document.querySelectorAll(
        "a, button, input, textarea, select, option, form, h1, h2, h3, h4, h5, h6, [role], [data-testid]"
      )
    );
    for (const candidate of candidates) {
      if (nativeRole(candidate) !== role.trim().toLowerCase()) continue;
      if (!name) return candidate;
      if (searchTexts(candidate).some((value) => textMatches(value, name, exact))) {
        return candidate;
      }
    }
    return null;
  };
  const trimQuoted = (value) => {
    const trimmed = String(value || "").trim();
    const hasTextMatch = trimmed.match(/^has-text\((['"])([\s\S]*?)\\1\)$/i);
    if (hasTextMatch?.[2]) {
      return hasTextMatch[2].trim();
    }
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1).trim();
    }
    return trimmed;
  };
  const normalizeSelectorSyntax = (selector) => {
    let normalized = String(selector || "").trim();
    normalized = normalized.replace(
      /^role\s*[:=]\s*([a-z0-9_-]+)\s+name\s*[:=]\s*(.+)$/i,
      "role=$1[name=$2]"
    );
    normalized = normalized.replace(
      /^((?:label|text|placeholder|alt|title|testid|data-testid)\s*[:=]\s*(?:has-text\((['"])[\s\S]*?\\2\)|"[^"]+"|'[^']+'|[^>]+?))\s+((?:input|textarea|select)[\s\S]*)$/i,
      "$1 >> $3"
    );
    return normalized;
  };
  const parseSemanticSelector = (selector) => {
    const trimmed = normalizeSelectorSyntax(selector);
    const match = trimmed.match(/^([a-z-]+)\s*[:=]\s*(.+)$/i);
    if (!match) return null;
    const kind = match[1]?.trim()?.toLowerCase();
    const rawValue = match[2]?.trim() || "";
    if (!kind || !rawValue) return null;
    switch (kind) {
      case "alt":
        return { findBy: "alt", text: trimQuoted(rawValue) };
      case "css":
        return { selector: trimQuoted(rawValue) };
      case "data-testid":
      case "testid":
        return { findBy: "testid", text: trimQuoted(rawValue) };
      case "label":
        return { findBy: "label", text: trimQuoted(rawValue) };
      case "placeholder":
        return { findBy: "placeholder", text: trimQuoted(rawValue) };
      case "role": {
        const roleMatch = rawValue.match(
          /^([a-z0-9_-]+)(?:\s*\[\s*name\s*[:=]\s*(.+?)\s*\])?$/i
        );
        if (!roleMatch?.[1]) return null;
        return {
          findBy: "role",
          name: roleMatch[2] ? trimQuoted(roleMatch[2]) : undefined,
          role: roleMatch[1].trim().toLowerCase(),
        };
      }
      case "text":
        return { findBy: "text", text: trimQuoted(rawValue) };
      case "title":
        return { findBy: "title", text: trimQuoted(rawValue) };
      default:
        return null;
    }
  };
  const mergeSelectorCommand = (selector) => {
    const parsed = parseSemanticSelector(selector);
    if (!parsed) return null;
    return { ...command, ...parsed, selector: parsed.selector };
  };
  const queryOne = (selector) => {
    try {
      return document.querySelector(selector);
    } catch {
      throw new Error("Invalid selector " + selector);
    }
  };
  const queryAll = (selector) => {
    try {
      return Array.from(document.querySelectorAll(selector));
    } catch {
      throw new Error("Invalid selector " + selector);
    }
  };
  const findSemantic = (targetCommand = command) => {
    switch (targetCommand.findBy) {
      case "alt":
        return Array.from(document.querySelectorAll("[alt]")).find((element) =>
          textMatches(
            element.getAttribute("alt"),
            targetCommand.text,
            targetCommand.exact
          )
        ) || null;
      case "first":
        return targetCommand.selector ? queryOne(targetCommand.selector) : null;
      case "label":
        return targetCommand.text
          ? findByLabel(targetCommand.text, targetCommand.exact)
          : null;
      case "last":
        return targetCommand.selector
          ? queryAll(targetCommand.selector).at(-1) || null
          : null;
      case "nth":
        return targetCommand.selector && Number.isInteger(targetCommand.index)
          ? queryAll(targetCommand.selector).at(targetCommand.index) || null
          : null;
      case "placeholder":
        return Array.from(document.querySelectorAll("[placeholder]")).find((element) =>
          textMatches(
            element.getAttribute("placeholder"),
            targetCommand.text,
            targetCommand.exact
          )
        ) || null;
      case "role":
        return targetCommand.role
          ? findByRole(
              targetCommand.role,
              targetCommand.name,
              targetCommand.exact
            )
          : null;
      case "testid":
        return targetCommand.text
          ? document.querySelector('[data-testid="' + targetCommand.text + '"]')
          : null;
      case "text":
        return targetCommand.text ? findByText(targetCommand.text) : null;
      case "title":
        return Array.from(document.querySelectorAll("[title]")).find((element) =>
          textMatches(
            element.getAttribute("title"),
            targetCommand.text,
            targetCommand.exact
          )
        ) || null;
      default:
        return null;
    }
  };
  const findTarget = () => {
    if (command.selector) {
      const selectorChain = normalizeSelectorSyntax(command.selector)
        .split(/\s*>>\s*/)
        .map((segment) => segment.trim())
        .filter(Boolean);
      if (selectorChain.length > 1) {
        let current = queryTarget(selectorChain[0]);
        for (let index = 1; current && index < selectorChain.length; index += 1) {
          const segment = selectorChain[index];
          if (!segment) continue;
          if (typeof current.matches === "function" && current.matches(segment)) {
            continue;
          }
          if (
            /^(input|textarea|select)(?:\[[^\]]+\])?$/i.test(segment) &&
            (current.tagName === "INPUT" ||
              current.tagName === "TEXTAREA" ||
              current.tagName === "SELECT")
          ) {
            continue;
          }
          current = queryOneWithin(current, segment);
        }
        return current;
      }
      return queryTarget(command.selector);
    }
    if (command.findBy) return findSemantic();
    if (command.text) return findByText(command.text);
    return null;
  };
  const queryOneWithin = (root, selector) => {
    try {
      return root.querySelector(selector);
    } catch {
      throw new Error("Invalid selector " + selector);
    }
  };
  const queryTarget = (selector) => {
    const semantic = mergeSelectorCommand(selector);
    if (semantic) return findSemantic(semantic);
    return queryOne(selector);
  };
  const inspect = () =>
    Array.from(
      document.querySelectorAll(
        "a, button, input, textarea, select, form, [role='button'], [data-testid]"
      )
    )
      .slice(0, 40)
      .map((element) => serialize(element));
  const snapshot = () => ({
    title: document.title,
    url: location.href,
    bodyText: normalize(document.body?.textContent).slice(0, 800),
    elements: inspect(),
  });
  const setInputValue = (appendMode, target) => {
    const element = target || findTarget();
    if (!element) {
      throw new Error("Target element was not found.");
    }
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      )
    ) {
      throw new Error("Target element is not an input, textarea, or select.");
    }
    const nextValue = appendMode ? \`\${element.value ?? ""}\${command.value ?? ""}\` : (command.value ?? "");
    element.value = nextValue;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return { selector: selectorFor(element), value: element.value };
  };
  const setChecked = (targetValue) => {
    const element = findTarget();
    if (!element) throw new Error("Target element was not found.");
    if (!(element instanceof HTMLInputElement)) {
      throw new Error("Target element is not a checkbox or radio input.");
    }
    const type = (element.type || "").toLowerCase();
    if (type !== "checkbox" && type !== "radio") {
      throw new Error("Target element is not a checkbox or radio input.");
    }
    element.checked = targetValue;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return { checked: element.checked, selector: selectorFor(element) };
  };
  const setSelectValue = () => {
    const element = findTarget();
    if (!element) throw new Error("Target element was not found.");
    if (!(element instanceof HTMLSelectElement)) {
      throw new Error("Target element is not a select.");
    }
    const targetValue = command.value ?? "";
    const option = Array.from(element.options).find(
      (entry) =>
        entry.value === targetValue || textMatches(entry.textContent, targetValue, true)
    );
    if (!option) {
      throw new Error("Select option was not found.");
    }
    element.value = option.value;
    option.selected = true;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return { selector: selectorFor(element), value: element.value };
  };
  const focusElement = (element) => {
    if (!element) throw new Error("Target element was not found.");
    if (typeof element.focus === "function") {
      element.focus();
    }
    return {
      focused: document.activeElement === element,
      selector: selectorFor(element),
    };
  };
  const hoverElement = (element) => {
    if (!element) throw new Error("Target element was not found.");
    element.setAttribute("data-milady-hover", "true");
    return { hovered: true, selector: selectorFor(element) };
  };
  const activateElement = (subaction, element) => {
    if (!element) throw new Error("Target element was not found.");
    if (subaction === "dblclick") {
      element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    }
    if (typeof element.click === "function") {
      element.click();
    }
    return {
      clickCount: subaction === "dblclick" ? 2 : 1,
      element: serialize(element),
      url: location.href,
    };
  };
  const keyboardTarget = () => findTarget() || document.activeElement || document.body;
  const keyboardWrite = (appendMode) => {
    const target = keyboardTarget();
    if (
      !(
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      )
    ) {
      throw new Error("Keyboard text input requires an input, textarea, or select target.");
    }
    return setInputValue(appendMode, target);
  };
  const keyPhase = (phase) => {
    const target = keyboardTarget();
    const key = command.key || "Enter";
    target.dispatchEvent(new KeyboardEvent(phase, { key, bubbles: true }));
    return { key, phase, selector: selectorFor(target) };
  };
  const scrollTarget = () => findTarget();
  const scroll = () => {
    const target = scrollTarget();
    const direction = command.direction || "down";
    const pixels = Math.max(1, Math.abs(Number(command.pixels) || 240));
    const axis = direction === "left" || direction === "right" ? "x" : "y";
    const delta = direction === "up" || direction === "left" ? -pixels : pixels;
    if (target instanceof HTMLElement) {
      if (axis === "y") {
        target.scrollTop = (target.scrollTop || 0) + delta;
        return { axis, selector: selectorFor(target), value: target.scrollTop };
      }
      target.scrollLeft = (target.scrollLeft || 0) + delta;
      return { axis, selector: selectorFor(target), value: target.scrollLeft };
    }
    if (axis === "y") {
      window.scrollBy(0, delta);
      return { axis, selector: null, value: window.scrollY };
    }
    window.scrollBy(delta, 0);
    return { axis, selector: null, value: window.scrollX };
  };
  const getResult = () => {
    if (command.getMode === "title") return document.title;
    if (command.getMode === "url") return location.href;
    if (command.getMode === "count") {
      if (!command.selector) throw new Error("count requires selector");
      const semantic = mergeSelectorCommand(command.selector);
      return semantic ? Number(Boolean(findSemantic(semantic))) : queryAll(command.selector).length;
    }
    const element = findTarget();
    if (!element) throw new Error("Target element was not found.");
    switch (command.getMode) {
      case "attr":
        if (!command.attribute) throw new Error("attr lookups require attribute");
        return element.getAttribute(command.attribute);
      case "box":
        return element.getBoundingClientRect();
      case "checked":
        return element instanceof HTMLInputElement
          ? Boolean(element.checked)
          : element instanceof HTMLOptionElement
            ? Boolean(element.selected)
            : false;
      case "enabled":
        return "disabled" in element ? !Boolean(element.disabled) : true;
      case "html":
        return element.innerHTML;
      case "styles": {
        const computed = getComputedStyle(element);
        return {
          display: computed.display || null,
          visibility: computed.visibility || null,
          opacity: computed.opacity || null,
        };
      }
      case "text":
        return normalize(element.textContent);
      case "value":
        return element.value ?? element.getAttribute?.("value");
      case "visible":
        return isVisible(element);
      default:
        return normalize(element.textContent);
    }
  };
  const waitForCondition = () =>
    new Promise((resolve, reject) => {
      if (
        !command.selector &&
        !command.findBy &&
        !command.text &&
        !command.url &&
        !command.script &&
        Number.isFinite(Number(command.timeoutMs))
      ) {
        const waitedMs = Math.max(0, Number(command.timeoutMs) || 0);
        setTimeout(() => resolve({ ok: true, waitedMs }), waitedMs);
        return;
      }
      const deadline = Date.now() + (Number(command.timeoutMs) || 4000);
      const check = () => {
        try {
          if (command.selector && findTarget()) {
            const found = findTarget();
            const visible =
              !command.state || command.state === "visible"
                ? found && isVisible(found)
                : !found || !isVisible(found);
            if (visible) {
              resolve({ ok: true, selector: command.selector, state: command.state || "visible" });
              return;
            }
          }
          if (
            command.findBy &&
            (!command.state || command.state === "visible") &&
            findSemantic()
          ) {
            resolve({ findBy: command.findBy, ok: true });
            return;
          }
          if (command.text && normalize(document.body?.textContent).includes(command.text)) {
            resolve({ ok: true, text: command.text });
            return;
          }
          if (command.url && location.href.includes(command.url)) {
            resolve({ ok: true, url: location.href });
            return;
          }
          if (command.script) {
            const fn = new Function("document", "window", "location", "return (" + command.script + ");");
            if (fn(document, window, location)) {
              resolve({ ok: true, script: true });
              return;
            }
          }
          if (Date.now() >= deadline) {
            reject(new Error("Timed out waiting for browser workspace condition."));
            return;
          }
          setTimeout(check, 100);
        } catch (error) {
          reject(error);
        }
      };
      check();
    });

  switch (command.subaction) {
    case "inspect":
      return { title: document.title, url: location.href, elements: inspect() };
    case "snapshot":
      return snapshot();
    case "get":
      return { value: getResult() };
    case "find": {
      const element = findTarget();
      if (!element) throw new Error("Target element was not found.");
      switch (command.action) {
        case "check":
          return setChecked(true);
        case "click":
          return activateElement("click", element);
        case "fill":
          return setInputValue(false, element);
        case "focus":
          return focusElement(element);
        case "hover":
          return hoverElement(element);
        case "text":
        case undefined:
          return { element: serialize(element), value: normalize(element.textContent) };
        case "type":
          return setInputValue(true, element);
        case "uncheck":
          return setChecked(false);
        default:
          throw new Error("Unsupported find action.");
      }
    }
    case "click": {
      const element = findTarget();
      return activateElement("click", element);
    }
    case "dblclick": {
      const element = findTarget();
      return activateElement("dblclick", element);
    }
    case "check":
      return setChecked(true);
    case "fill":
      return setInputValue(false);
    case "focus": {
      const element = findTarget();
      return focusElement(element);
    }
    case "hover": {
      const element = findTarget();
      return hoverElement(element);
    }
    case "keyboardinserttext":
      return keyboardWrite(false);
    case "keyboardtype":
      return keyboardWrite(true);
    case "keydown":
      return keyPhase("keydown");
    case "keyup":
      return keyPhase("keyup");
    case "type":
      return setInputValue(true);
    case "press": {
      const target = findTarget() ?? document.activeElement ?? document.body;
      const key = command.key || "Enter";
      target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      target.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
      return { key, url: location.href };
    }
    case "scroll":
      return scroll();
    case "scrollinto": {
      const element = findTarget();
      if (!element) throw new Error("Target element was not found.");
      if (typeof element.scrollIntoView === "function") {
        element.scrollIntoView();
      }
      return { scrolled: true, selector: selectorFor(element) };
    }
    case "select":
      return setSelectValue();
    case "uncheck":
      return setChecked(false);
    case "wait":
      return waitForCondition();
    case "back":
      history.back();
      return { url: location.href, title: document.title };
    case "forward":
      history.forward();
      return { url: location.href, title: document.title };
    case "reload":
      location.reload();
      return { url: location.href, title: document.title };
    default:
      throw new Error(\`Unsupported desktop browser subaction: \${command.subaction}\`);
  }
})()
`.trim();
}

async function executeDesktopBrowserWorkspaceDomCommand(
  command: BrowserWorkspaceCommand,
  env: NodeJS.ProcessEnv,
): Promise<BrowserWorkspaceCommandResult> {
  const id = await resolveDesktopBrowserWorkspaceTargetTabId(command, env);
  command = resolveBrowserWorkspaceCommandElementRefs(command, "desktop", id);
  const result = await evaluateBrowserWorkspaceTab(
    {
      id,
      script: createDesktopBrowserWorkspaceCommandScript({
        ...command,
        id,
      }),
    },
    env,
  );

  if (command.subaction === "inspect" || command.subaction === "snapshot") {
    const value =
      result && typeof result === "object" && !Array.isArray(result)
        ? (result as {
            bodyText?: string;
            elements?: BrowserWorkspaceDomElementSummary[];
          })
        : null;
    const elements = registerBrowserWorkspaceElementRefs(
      "desktop",
      id,
      Array.isArray(value?.elements) ? value.elements : [],
    );
    return {
      mode: "desktop",
      subaction: command.subaction,
      elements,
      value: result,
    };
  }

  return {
    mode: "desktop",
    subaction: command.subaction,
    value:
      result && typeof result === "object" && !Array.isArray(result)
        ? ((result as { value?: unknown }).value ?? result)
        : result,
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function submitWebBrowserWorkspaceForm(
  tab: WebBrowserWorkspaceTabState,
  form: HTMLFormElement,
): Promise<void> {
  const dom = ensureBrowserWorkspaceDom(tab);
  const action = form.getAttribute("action")?.trim() || tab.url;
  const method = (form.getAttribute("method")?.trim() || "get").toLowerCase();
  const submitUrl = new URL(action, tab.url).toString();
  const formData = new dom.window.FormData(form);
  const searchParams = new URLSearchParams();

  for (const [key, value] of formData.entries()) {
    searchParams.append(key, String(value));
  }

  if (method === "get") {
    const nextUrl = new URL(submitUrl);
    nextUrl.search = searchParams.toString();
    clearWebBrowserWorkspaceTabElementRefs(tab.id);
    tab.url = nextUrl.toString();
    tab.title = inferBrowserWorkspaceTitle(tab.url);
    tab.dom = null;
    tab.loadedUrl = null;
    pushWebBrowserWorkspaceHistory(tab, tab.url);
    await loadWebBrowserWorkspaceTabDocument(tab);
    return;
  }

  const response = await fetch(submitUrl, {
    body: searchParams.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
    },
    method: method.toUpperCase(),
    redirect: "follow",
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `Browser workspace form submit failed (${response.status}): ${submitUrl}`,
    );
  }

  const html = await response.text();
  const finalUrl = assertBrowserWorkspaceUrl(response.url?.trim() || submitUrl);
  const nextDom = new JSDOM(html, {
    pretendToBeVisual: true,
    url: finalUrl,
  });
  clearWebBrowserWorkspaceTabElementRefs(tab.id);
  tab.url = finalUrl;
  tab.dom = nextDom;
  tab.loadedUrl = finalUrl;
  tab.title =
    normalizeBrowserWorkspaceText(nextDom.window.document.title) ||
    inferBrowserWorkspaceTitle(finalUrl);
  tab.updatedAt = getBrowserWorkspaceTimestamp();
  pushWebBrowserWorkspaceHistory(tab, finalUrl);
}

async function executeWebBrowserWorkspaceDomCommand(
  command: BrowserWorkspaceCommand,
): Promise<BrowserWorkspaceCommandResult> {
  return withWebStateLock(async () => {
    const id = findWebBrowserWorkspaceTargetTabId(command);
    command = resolveBrowserWorkspaceCommandElementRefs(command, "web", id);
    const tab = getWebBrowserWorkspaceTabState(id);
    const dom = await ensureLoadedWebBrowserWorkspaceTabDocument(tab);
    const document = dom.window.document;
    const resolveTarget = () =>
      resolveBrowserWorkspaceElement(document, command.selector, command.text, command);

    switch (command.subaction) {
      case "inspect":
        clearWebBrowserWorkspaceTabElementRefs(tab.id);
        return {
          mode: "web",
          subaction: command.subaction,
          elements: registerBrowserWorkspaceElementRefs(
            "web",
            tab.id,
            collectBrowserWorkspaceInspectElements(document),
          ),
          value: {
            title: tab.title,
            url: tab.url,
          },
        };
      case "snapshot":
        clearWebBrowserWorkspaceTabElementRefs(tab.id);
        return {
          mode: "web",
          subaction: command.subaction,
          elements: registerBrowserWorkspaceElementRefs(
            "web",
            tab.id,
            collectBrowserWorkspaceInspectElements(document),
          ),
          value: {
            bodyText: normalizeBrowserWorkspaceText(document.body?.textContent).slice(
              0,
              800,
            ),
            title: tab.title,
            url: tab.url,
          },
        };
      case "get": {
        if (command.getMode === "title") {
          return { mode: "web", subaction: command.subaction, value: tab.title };
        }
        if (command.getMode === "url") {
          return { mode: "web", subaction: command.subaction, value: tab.url };
        }
        if (command.getMode === "count") {
          if (!command.selector?.trim()) {
            throw new Error("Milady browser workspace get count requires selector.");
          }
          const semanticCommand = mergeBrowserWorkspaceSelectorCommand(
            command,
            command.selector,
          );
          return {
            mode: "web",
            subaction: command.subaction,
            value: semanticCommand
              ? Number(
                  Boolean(
                    resolveBrowserWorkspaceFindElement(document, semanticCommand),
                  ),
                )
              : queryAllBrowserWorkspaceSelector(document, command.selector)
                  .length,
          };
        }

        const element = resolveTarget();
        if (!element) {
          throw new Error("Target element was not found.");
        }

        let value: unknown;
        switch (command.getMode) {
          case "attr":
            if (!command.attribute?.trim()) {
              throw new Error("Milady browser workspace attr lookups require attribute.");
            }
            value = element.getAttribute(command.attribute);
            break;
          case "box":
            value = getBrowserWorkspaceElementBox(element);
            break;
          case "checked":
            value =
              element.tagName === "INPUT"
                ? Boolean((element as HTMLInputElement).checked)
                : element.tagName === "OPTION"
                  ? Boolean((element as HTMLOptionElement).selected)
                  : false;
            break;
          case "enabled":
            value =
              "disabled" in element
                ? !Boolean(
                    (
                      element as
                        | HTMLButtonElement
                        | HTMLInputElement
                        | HTMLSelectElement
                        | HTMLTextAreaElement
                    ).disabled,
                  )
                : true;
            break;
          case "html":
            value = element.innerHTML;
            break;
          case "styles":
            value = getBrowserWorkspaceElementStyles(element, dom.window);
            break;
          case "value":
            value = getBrowserWorkspaceElementValue(element);
            break;
          case "visible":
            value = isBrowserWorkspaceElementVisible(element);
            break;
          case "text":
          default:
            value = normalizeBrowserWorkspaceText(element.textContent);
            break;
        }

        return { mode: "web", subaction: command.subaction, value };
      }
      case "find": {
        const element = resolveTarget();
        if (!element) {
          throw new Error("Target element was not found.");
        }

        switch (command.action) {
          case "check": {
            const input = ensureBrowserWorkspaceCheckboxElement(element, "check");
            input.checked = true;
            return {
              mode: "web",
              subaction: command.subaction,
              value: {
                checked: input.checked,
                selector: buildBrowserWorkspaceElementSelector(input),
              },
            };
          }
          case "click":
            return {
              ...(await activateWebBrowserWorkspaceElement(tab, element, "click")),
              subaction: command.subaction,
            };
          case "fill": {
            const control = ensureBrowserWorkspaceFormControlElement(element, "fill");
            setBrowserWorkspaceControlValue(control, command.value ?? "");
            return {
              mode: "web",
              subaction: command.subaction,
              value: {
                selector: buildBrowserWorkspaceElementSelector(control),
                value: control.value,
              },
            };
          }
          case "focus":
            if (typeof (element as HTMLElement).focus === "function") {
              (element as HTMLElement).focus();
            }
            return {
              mode: "web",
              subaction: command.subaction,
              value: {
                focused: document.activeElement === element,
                selector: buildBrowserWorkspaceElementSelector(element),
              },
            };
          case "hover":
            element.setAttribute("data-milady-hover", "true");
            return {
              mode: "web",
              subaction: command.subaction,
              value: {
                hovered: true,
                selector: buildBrowserWorkspaceElementSelector(element),
              },
            };
          case "type": {
            const control = ensureBrowserWorkspaceFormControlElement(element, "type");
            setBrowserWorkspaceControlValue(
              control,
              `${control.value ?? ""}${command.value ?? ""}`,
            );
            return {
              mode: "web",
              subaction: command.subaction,
              value: {
                selector: buildBrowserWorkspaceElementSelector(control),
                value: control.value,
              },
            };
          }
          case "uncheck": {
            const input = ensureBrowserWorkspaceCheckboxElement(element, "uncheck");
            input.checked = false;
            return {
              mode: "web",
              subaction: command.subaction,
              value: {
                checked: input.checked,
                selector: buildBrowserWorkspaceElementSelector(input),
              },
            };
          }
          case "text":
          case undefined:
            return {
              mode: "web",
              subaction: command.subaction,
              value: {
                element: createBrowserWorkspaceElementSummary(element),
                text: normalizeBrowserWorkspaceText(element.textContent),
              },
            };
          default:
            throw new Error(`Unsupported browser workspace find action: ${command.action}`);
        }
      }
      case "check": {
        const element = resolveTarget();
        if (!element) {
          throw new Error("Target element was not found.");
        }
        const input = ensureBrowserWorkspaceCheckboxElement(element, "check");
        input.checked = true;
        return {
          mode: "web",
          subaction: command.subaction,
          value: {
            checked: input.checked,
            selector: buildBrowserWorkspaceElementSelector(input),
          },
        };
      }
      case "fill":
      case "type": {
        const element = resolveTarget();
        if (!element) {
          throw new Error("Target element was not found.");
        }
        const control = ensureBrowserWorkspaceFormControlElement(
          element,
          command.subaction,
        );
        const nextValue =
          command.subaction === "type"
            ? `${control.value ?? ""}${command.value ?? ""}`
            : (command.value ?? "");
        setBrowserWorkspaceControlValue(control, nextValue);
        return {
          mode: "web",
          subaction: command.subaction,
          value: {
            selector: buildBrowserWorkspaceElementSelector(control),
            value: nextValue,
          },
        };
      }
      case "focus": {
        const element = resolveTarget();
        if (!element) {
          throw new Error("Target element was not found.");
        }
        if (typeof (element as HTMLElement).focus === "function") {
          (element as HTMLElement).focus();
        }
        return {
          mode: "web",
          subaction: command.subaction,
          value: {
            focused: document.activeElement === element,
            selector: buildBrowserWorkspaceElementSelector(element),
          },
        };
      }
      case "hover": {
        const element = resolveTarget();
        if (!element) {
          throw new Error("Target element was not found.");
        }
        element.setAttribute("data-milady-hover", "true");
        return {
          mode: "web",
          subaction: command.subaction,
          value: {
            hovered: true,
            selector: buildBrowserWorkspaceElementSelector(element),
          },
        };
      }
      case "keyboardinserttext":
      case "keyboardtype": {
        const active = document.activeElement;
        if (
          !active ||
          !(
            active.tagName === "INPUT" ||
            active.tagName === "TEXTAREA" ||
            active.tagName === "SELECT"
          )
        ) {
          throw new Error(
            "Milady browser workspace keyboard text input requires a focused input target.",
          );
        }
        const control = ensureBrowserWorkspaceFormControlElement(
          active,
          command.subaction === "keyboardtype" ? "type" : "keyboardinserttext",
        );
        const nextValue =
          command.subaction === "keyboardtype"
            ? `${control.value ?? ""}${command.value ?? ""}`
            : (command.value ?? "");
        setBrowserWorkspaceControlValue(control, nextValue);
        return {
          mode: "web",
          subaction: command.subaction,
          value: {
            selector: buildBrowserWorkspaceElementSelector(control),
            value: control.value,
          },
        };
      }
      case "keydown":
      case "keyup":
        return {
          mode: "web",
          subaction: command.subaction,
          value: {
            key: command.key?.trim() || "Enter",
            selector:
              document.activeElement && document.activeElement instanceof Element
                ? buildBrowserWorkspaceElementSelector(document.activeElement)
                : null,
          },
        };
      case "click": {
        const element = resolveTarget();
        if (!element) {
          throw new Error("Target element was not found.");
        }
        return activateWebBrowserWorkspaceElement(tab, element, "click");
      }
      case "dblclick": {
        const element = resolveTarget();
        if (!element) {
          throw new Error("Target element was not found.");
        }
        return activateWebBrowserWorkspaceElement(tab, element, "dblclick");
      }
      case "press": {
        const key = command.key?.trim() || "Enter";
        const element = resolveTarget();
        const form = findClosestBrowserWorkspaceForm(element);

        if (key === "Enter" && form) {
          await submitWebBrowserWorkspaceForm(tab, form);
          return {
            mode: "web",
            subaction: command.subaction,
            tab: cloneWebBrowserWorkspaceTabState(tab),
            value: { key, url: tab.url },
          };
        }

        return { mode: "web", subaction: command.subaction, value: { key } };
      }
      case "scroll": {
        return {
          mode: "web",
          subaction: command.subaction,
          value: scrollWebBrowserWorkspaceTarget(
            dom,
            resolveTarget(),
            command.direction ?? "down",
            command.pixels ?? 240,
          ),
        };
      }
      case "scrollinto": {
        const element = resolveTarget();
        if (!element) {
          throw new Error("Target element was not found.");
        }
        if (typeof (element as HTMLElement).focus === "function") {
          (element as HTMLElement).focus();
        }
        return {
          mode: "web",
          subaction: command.subaction,
          value: {
            scrolled: true,
            selector: buildBrowserWorkspaceElementSelector(element),
          },
        };
      }
      case "select": {
        const element = resolveTarget();
        if (!element) {
          throw new Error("Target element was not found.");
        }
        if (element.tagName !== "SELECT") {
          throw new Error("Milady browser workspace select requires a select target.");
        }
        const select = ensureBrowserWorkspaceFormControlElement(element, "select");
        const option = Array.from((select as HTMLSelectElement).options).find(
          (entry) =>
            entry.value === (command.value ?? "") ||
            browserWorkspaceTextMatches(
              entry.textContent ?? "",
              command.value ?? "",
              true,
            ),
        );
        if (!option) {
          throw new Error("Select option was not found.");
        }
        (select as HTMLSelectElement).value = option.value;
        option.selected = true;
        return {
          mode: "web",
          subaction: command.subaction,
          value: {
            selector: buildBrowserWorkspaceElementSelector(select),
            value: (select as HTMLSelectElement).value,
          },
        };
      }
      case "uncheck": {
        const element = resolveTarget();
        if (!element) {
          throw new Error("Target element was not found.");
        }
        const input = ensureBrowserWorkspaceCheckboxElement(element, "uncheck");
        input.checked = false;
        return {
          mode: "web",
          subaction: command.subaction,
          value: {
            checked: input.checked,
            selector: buildBrowserWorkspaceElementSelector(input),
          },
        };
      }
      case "wait": {
        if (
          !command.selector &&
          !command.findBy &&
          !command.text &&
          !command.url &&
          !command.script &&
          typeof command.timeoutMs === "number" &&
          Number.isFinite(command.timeoutMs)
        ) {
          const waitedMs = Math.max(0, command.timeoutMs);
          await sleep(waitedMs);
          return {
            mode: "web",
            subaction: command.subaction,
            value: { waitedMs },
          };
        }
        const timeoutMs =
          typeof command.timeoutMs === "number" && Number.isFinite(command.timeoutMs)
            ? Math.max(100, command.timeoutMs)
            : DEFAULT_TIMEOUT_MS;
        const deadline = Date.now() + timeoutMs;

        while (Date.now() <= deadline) {
          await ensureLoadedWebBrowserWorkspaceTabDocument(tab);
          const currentDom = ensureBrowserWorkspaceDom(tab);
          const currentDocument = currentDom.window.document;

          const matchesSelector = command.selector?.trim()
            ? (() => {
              const found = resolveBrowserWorkspaceElement(
                currentDocument,
                command.selector,
                undefined,
                command,
              );
              if (!command.state || command.state === "visible") {
                  return found ? isBrowserWorkspaceElementVisible(found) : false;
              }
              return !found || !isBrowserWorkspaceElementVisible(found);
            })()
            : false;
          const matchesFind = command.findBy
            ? Boolean(resolveBrowserWorkspaceFindElement(currentDocument, command))
            : false;
          const matchesText = command.text?.trim()
            ? normalizeBrowserWorkspaceText(currentDocument.body?.textContent).includes(
                command.text.trim(),
              )
            : false;
          const matchesUrl = command.url?.trim()
            ? tab.url.includes(command.url.trim())
            : false;
          const matchesScript = command.script?.trim()
            ? Boolean(
                new Function(
                  "document",
                  "window",
                  "location",
                  `return (${command.script});`,
                )(currentDocument, currentDom.window, currentDom.window.location),
              )
            : false;

          if (
            matchesSelector ||
            matchesFind ||
            matchesText ||
            matchesUrl ||
            matchesScript ||
            (!command.selector &&
              !command.findBy &&
              !command.text &&
              !command.url &&
              !command.script)
          ) {
            return {
              mode: "web",
              subaction: command.subaction,
              value: {
                findBy: command.findBy ?? null,
                selector: command.selector ?? null,
                state: command.state ?? null,
                text: command.text ?? null,
                url: tab.url,
              },
            };
          }

          await sleep(DEFAULT_WAIT_INTERVAL_MS);
        }

        throw new Error("Timed out waiting for browser workspace condition.");
      }
      default:
        throw new Error(
          `Unsupported web browser workspace subaction: ${command.subaction}`,
        );
    }
  });
}

export function resolveBrowserWorkspaceBridgeConfig(
  env: NodeJS.ProcessEnv = process.env,
): BrowserWorkspaceBridgeConfig | null {
  const baseUrl =
    normalizeEnvValue(env.MILADY_BROWSER_WORKSPACE_URL) ??
    normalizeEnvValue(env.ELIZA_BROWSER_WORKSPACE_URL);
  if (!baseUrl) {
    return null;
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    token:
      normalizeEnvValue(env.MILADY_BROWSER_WORKSPACE_TOKEN) ??
      normalizeEnvValue(env.ELIZA_BROWSER_WORKSPACE_TOKEN),
  };
}

export function isBrowserWorkspaceBridgeConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return resolveBrowserWorkspaceBridgeConfig(env) !== null;
}

export function getBrowserWorkspaceMode(
  env: NodeJS.ProcessEnv = process.env,
): BrowserWorkspaceMode {
  return isBrowserWorkspaceBridgeConfigured(env) ? "desktop" : "web";
}

export function getBrowserWorkspaceUnavailableMessage(): string {
  return DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE;
}

export async function getBrowserWorkspaceSnapshot(
  env: NodeJS.ProcessEnv = process.env,
): Promise<BrowserWorkspaceSnapshot> {
  return {
    mode: getBrowserWorkspaceMode(env),
    tabs: await listBrowserWorkspaceTabs(env),
  };
}

export async function listBrowserWorkspaceTabs(
  env: NodeJS.ProcessEnv = process.env,
): Promise<BrowserWorkspaceTab[]> {
  if (!isBrowserWorkspaceBridgeConfigured(env)) {
    return cloneBrowserWorkspaceTabs(
      webWorkspaceState.tabs.map((tab) => cloneWebBrowserWorkspaceTabState(tab)),
    );
  }

  const payload = await requestBrowserWorkspace<{
    tabs?: BrowserWorkspaceTab[];
  }>("/tabs", undefined, env);
  return Array.isArray(payload.tabs) ? payload.tabs : [];
}

export async function openBrowserWorkspaceTab(
  request: OpenBrowserWorkspaceTabRequest,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BrowserWorkspaceTab> {
  if (!isBrowserWorkspaceBridgeConfigured(env)) {
    return withWebStateLock(() => {
      const tab = createWebBrowserWorkspaceTab(request);
      clearWebBrowserWorkspaceTabElementRefs(tab.id);
      if (tab.visible) {
        webWorkspaceState.tabs = webWorkspaceState.tabs.map((entry) => ({
          ...entry,
          visible: false,
        }));
      }
      webWorkspaceState.tabs = [...webWorkspaceState.tabs, tab];
      return cloneWebBrowserWorkspaceTabState(tab);
    });
  }

  const payload = await requestBrowserWorkspace<{ tab: BrowserWorkspaceTab }>(
    "/tabs",
    {
      method: "POST",
      body: JSON.stringify(request),
    },
    env,
  );
  return payload.tab;
}

export async function navigateBrowserWorkspaceTab(
  request: NavigateBrowserWorkspaceTabRequest,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BrowserWorkspaceTab> {
  const nextUrl = assertBrowserWorkspaceUrl(request.url);

  if (!isBrowserWorkspaceBridgeConfigured(env)) {
    return withWebStateLock(() => {
      const index = getWebBrowserWorkspaceTabIndex(request.id);
      if (index < 0) {
        throw createBrowserWorkspaceNotFoundError(request.id);
      }

      const existing = webWorkspaceState.tabs[index];
      const updatedAt = getBrowserWorkspaceTimestamp();
      clearWebBrowserWorkspaceTabElementRefs(existing.id);
      pushWebBrowserWorkspaceHistory(existing, nextUrl);
      const nextTab: WebBrowserWorkspaceTabState = {
        ...existing,
        title: inferBrowserWorkspaceTitle(nextUrl),
        url: nextUrl,
        updatedAt,
        dom: nextUrl === "about:blank" ? createEmptyWebBrowserWorkspaceDom(nextUrl) : null,
        loadedUrl: nextUrl === "about:blank" ? nextUrl : null,
      };
      webWorkspaceState.tabs[index] = nextTab;
      return cloneWebBrowserWorkspaceTabState(nextTab);
    });
  }

  const payload = await requestBrowserWorkspace<{ tab: BrowserWorkspaceTab }>(
    `/tabs/${encodeURIComponent(request.id)}/navigate`,
    {
      method: "POST",
      body: JSON.stringify({ url: nextUrl }),
    },
    env,
  );
  return payload.tab;
}

export async function showBrowserWorkspaceTab(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BrowserWorkspaceTab> {
  if (!isBrowserWorkspaceBridgeConfigured(env)) {
    return withWebStateLock(() => {
      getWebBrowserWorkspaceTabState(id);
      const lastFocusedAt = getBrowserWorkspaceTimestamp();
      webWorkspaceState.tabs = webWorkspaceState.tabs.map((tab) => ({
        ...tab,
        visible: tab.id === id,
        lastFocusedAt: tab.id === id ? lastFocusedAt : tab.lastFocusedAt,
        updatedAt: tab.id === id ? lastFocusedAt : tab.updatedAt,
      }));
      return cloneWebBrowserWorkspaceTabState(getWebBrowserWorkspaceTabState(id));
    });
  }

  const payload = await requestBrowserWorkspace<{ tab: BrowserWorkspaceTab }>(
    `/tabs/${encodeURIComponent(id)}/show`,
    { method: "POST" },
    env,
  );
  return payload.tab;
}

export async function hideBrowserWorkspaceTab(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BrowserWorkspaceTab> {
  if (!isBrowserWorkspaceBridgeConfigured(env)) {
    return withWebStateLock(() => {
      const index = getWebBrowserWorkspaceTabIndex(id);
      if (index < 0) {
        throw createBrowserWorkspaceNotFoundError(id);
      }

      const updatedAt = getBrowserWorkspaceTimestamp();
      const nextTab: WebBrowserWorkspaceTabState = {
        ...webWorkspaceState.tabs[index],
        visible: false,
        updatedAt,
      };
      webWorkspaceState.tabs[index] = nextTab;
      return cloneWebBrowserWorkspaceTabState(nextTab);
    });
  }

  const payload = await requestBrowserWorkspace<{ tab: BrowserWorkspaceTab }>(
    `/tabs/${encodeURIComponent(id)}/hide`,
    { method: "POST" },
    env,
  );
  return payload.tab;
}

export async function closeBrowserWorkspaceTab(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  if (!isBrowserWorkspaceBridgeConfigured(env)) {
    return withWebStateLock(() => {
      const initialLength = webWorkspaceState.tabs.length;
      clearWebBrowserWorkspaceTabElementRefs(id);
      webWorkspaceState.tabs = webWorkspaceState.tabs.filter(
        (tab) => tab.id !== id,
      );
      return webWorkspaceState.tabs.length !== initialLength;
    });
  }

  const payload = await requestBrowserWorkspace<{ closed?: boolean }>(
    `/tabs/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    env,
  );
  return payload.closed === true;
}

export async function evaluateBrowserWorkspaceTab(
  request: EvaluateBrowserWorkspaceTabRequest,
  env: NodeJS.ProcessEnv = process.env,
): Promise<unknown> {
  if (!isBrowserWorkspaceBridgeConfigured(env)) {
    throw new Error(createBrowserWorkspaceDesktopOnlyMessage("eval"));
  }

  const payload = await requestBrowserWorkspace<{ result: unknown }>(
    `/tabs/${encodeURIComponent(request.id)}/eval`,
    {
      method: "POST",
      body: JSON.stringify({ script: request.script }),
    },
    env,
  );
  return payload.result;
}

export async function snapshotBrowserWorkspaceTab(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ data: string }> {
  if (!isBrowserWorkspaceBridgeConfigured(env)) {
    throw new Error(createBrowserWorkspaceDesktopOnlyMessage("snapshot"));
  }

  return await requestBrowserWorkspace<{ data: string }>(
    `/tabs/${encodeURIComponent(id)}/snapshot`,
    undefined,
    env,
  );
}

export async function executeBrowserWorkspaceCommand(
  command: BrowserWorkspaceCommand,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BrowserWorkspaceCommandResult> {
  command = normalizeBrowserWorkspaceCommand(command);
  switch (command.subaction) {
    case "batch": {
      const steps = Array.isArray(command.steps) ? command.steps : [];
      if (steps.length === 0) {
        throw new Error("Milady browser workspace batch requires at least one step.");
      }
      const results: BrowserWorkspaceCommandResult[] = [];
      for (const step of steps) {
        results.push(await executeBrowserWorkspaceCommand(step, env));
      }
      return {
        mode: getBrowserWorkspaceMode(env),
        subaction: command.subaction,
        steps: results,
        value: results.at(-1)?.value,
      };
    }
    case "list":
      return {
        mode: getBrowserWorkspaceMode(env),
        subaction: command.subaction,
        tabs: await listBrowserWorkspaceTabs(env),
      };
    case "open":
      {
        const tab = await openBrowserWorkspaceTab(
          {
            partition: command.partition,
            show: command.show,
            title: command.title,
            url: command.url,
          },
          env,
        );
        clearBrowserWorkspaceElementRefs(getBrowserWorkspaceMode(env), tab.id);
        return {
          mode: getBrowserWorkspaceMode(env),
          subaction: command.subaction,
          tab,
        };
      }
    case "navigate": {
      const id = isBrowserWorkspaceBridgeConfigured(env)
        ? await resolveDesktopBrowserWorkspaceTargetTabId(command, env)
        : findWebBrowserWorkspaceTargetTabId(command);
      clearBrowserWorkspaceElementRefs(getBrowserWorkspaceMode(env), id);
      return {
        mode: getBrowserWorkspaceMode(env),
        subaction: command.subaction,
        tab: await navigateBrowserWorkspaceTab(
          {
            id,
            url: command.url ?? "",
          },
          env,
        ),
      };
    }
    case "show": {
      const id = isBrowserWorkspaceBridgeConfigured(env)
        ? await resolveDesktopBrowserWorkspaceTargetTabId(command, env)
        : findWebBrowserWorkspaceTargetTabId(command);
      return {
        mode: getBrowserWorkspaceMode(env),
        subaction: command.subaction,
        tab: await showBrowserWorkspaceTab(id, env),
      };
    }
    case "hide": {
      const id = isBrowserWorkspaceBridgeConfigured(env)
        ? await resolveDesktopBrowserWorkspaceTargetTabId(command, env)
        : findWebBrowserWorkspaceTargetTabId(command);
      return {
        mode: getBrowserWorkspaceMode(env),
        subaction: command.subaction,
        tab: await hideBrowserWorkspaceTab(id, env),
      };
    }
    case "close": {
      const id = isBrowserWorkspaceBridgeConfigured(env)
        ? await resolveDesktopBrowserWorkspaceTargetTabId(command, env)
        : findWebBrowserWorkspaceTargetTabId(command);
      clearBrowserWorkspaceElementRefs(getBrowserWorkspaceMode(env), id);
      return {
        mode: getBrowserWorkspaceMode(env),
        subaction: command.subaction,
        closed: await closeBrowserWorkspaceTab(id, env),
      };
    }
    case "eval": {
      const id = await resolveDesktopBrowserWorkspaceTargetTabId(command, env);
      return {
        mode: "desktop",
        subaction: command.subaction,
        value: await evaluateBrowserWorkspaceTab(
          {
            id,
            script: command.script ?? "",
          },
          env,
        ),
      };
    }
    case "screenshot": {
      const id = await resolveDesktopBrowserWorkspaceTargetTabId(command, env);
      return {
        mode: "desktop",
        subaction: command.subaction,
        snapshot: await snapshotBrowserWorkspaceTab(id, env),
      };
    }
    case "back":
    case "forward":
    case "reload": {
      if (isBrowserWorkspaceBridgeConfigured(env)) {
        const id = await resolveDesktopBrowserWorkspaceTargetTabId(command, env);
        clearBrowserWorkspaceElementRefs("desktop", id);
        return executeDesktopBrowserWorkspaceDomCommand(command, env);
      }

      return withWebStateLock(async () => {
        const id = findWebBrowserWorkspaceTargetTabId(command);
        const tab = getWebBrowserWorkspaceTabState(id);

        if (command.subaction === "reload") {
          clearWebBrowserWorkspaceTabElementRefs(tab.id);
          tab.dom = null;
          tab.loadedUrl = null;
          await loadWebBrowserWorkspaceTabDocument(tab);
          return {
            mode: "web",
            subaction: command.subaction,
            tab: cloneWebBrowserWorkspaceTabState(tab),
            value: { url: tab.url, title: tab.title },
          };
        }

        const delta = command.subaction === "back" ? -1 : 1;
        const nextIndex = tab.historyIndex + delta;
        if (nextIndex < 0 || nextIndex >= tab.history.length) {
          return {
            mode: "web",
            subaction: command.subaction,
            tab: cloneWebBrowserWorkspaceTabState(tab),
            value: { url: tab.url, title: tab.title, changed: false },
          };
        }

        tab.historyIndex = nextIndex;
        tab.url = tab.history[nextIndex] ?? tab.url;
        tab.title = inferBrowserWorkspaceTitle(tab.url);
        clearWebBrowserWorkspaceTabElementRefs(tab.id);
        tab.dom = null;
        tab.loadedUrl = null;
        await loadWebBrowserWorkspaceTabDocument(tab);
        return {
          mode: "web",
          subaction: command.subaction,
          tab: cloneWebBrowserWorkspaceTabState(tab),
          value: { url: tab.url, title: tab.title, changed: true },
        };
      });
    }
    case "inspect":
    case "snapshot":
    case "check":
    case "click":
    case "dblclick":
    case "find":
    case "fill":
    case "focus":
    case "get":
    case "hover":
    case "keydown":
    case "keyup":
    case "keyboardinserttext":
    case "keyboardtype":
    case "press":
    case "scroll":
    case "scrollinto":
    case "select":
    case "type":
    case "uncheck":
    case "wait":
      if (
        command.subaction === "wait" &&
        !command.selector &&
        !command.findBy &&
        !command.text &&
        !command.url &&
        !command.script &&
        typeof command.timeoutMs === "number" &&
        Number.isFinite(command.timeoutMs)
      ) {
        const waitedMs = Math.max(0, command.timeoutMs);
        await sleep(waitedMs);
        return {
          mode: getBrowserWorkspaceMode(env),
          subaction: command.subaction,
          value: { waitedMs },
        };
      }
      if (isBrowserWorkspaceBridgeConfigured(env)) {
        return executeDesktopBrowserWorkspaceDomCommand(command, env);
      }
      return executeWebBrowserWorkspaceDomCommand(command);
    default: {
      const exhaustive: never = command.subaction;
      throw new Error(`Unsupported browser workspace subaction: ${exhaustive}`);
    }
  }
}
