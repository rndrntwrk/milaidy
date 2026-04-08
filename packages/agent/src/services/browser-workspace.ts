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
  | "snapshot";

export type BrowserWorkspaceSubaction =
  | BrowserWorkspaceOperation
  | "back"
  | "batch"
  | "click"
  | "fill"
  | "forward"
  | "get"
  | "inspect"
  | "press"
  | "reload"
  | "type"
  | "wait";

export type BrowserWorkspaceGetMode =
  | "attr"
  | "count"
  | "html"
  | "text"
  | "title"
  | "url"
  | "value";

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
  id?: string;
  url?: string;
  title?: string;
  script?: string;
  show?: boolean;
  partition?: string;
  selector?: string;
  text?: string;
  value?: string;
  attribute?: string;
  key?: string;
  getMode?: BrowserWorkspaceGetMode;
  timeoutMs?: number;
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

function getBrowserWorkspaceTimestamp(): string {
  return new Date().toISOString();
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
): Element | null {
  const normalizedSelector = selector?.trim();
  if (normalizedSelector) {
    return document.querySelector(normalizedSelector);
  }

  const normalizedText = text?.trim();
  if (normalizedText) {
    return findBrowserWorkspaceElementByText(document, normalizedText);
  }

  return null;
}

function ensureBrowserWorkspaceFormControlElement(
  element: Element,
  subaction: "fill" | "type",
): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.tagName === "SELECT"
  ) {
    return element;
  }

  throw new Error(
    `Milady browser workspace ${subaction} requires an input, textarea, or select target.`,
  );
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
  const findTarget = () => {
    if (command.selector) return document.querySelector(command.selector);
    if (command.text) return findByText(command.text);
    return null;
  };
  const inspect = () =>
    Array.from(
      document.querySelectorAll(
        "a, button, input, textarea, select, form, [role='button'], [data-testid]"
      )
    )
      .slice(0, 40)
      .map((element) => serialize(element));
  const setInputValue = (appendMode) => {
    const element = findTarget();
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
  const getResult = () => {
    if (command.getMode === "title") return document.title;
    if (command.getMode === "url") return location.href;
    if (command.getMode === "count") {
      if (!command.selector) throw new Error("count requires selector");
      return document.querySelectorAll(command.selector).length;
    }
    const element = findTarget();
    if (!element) throw new Error("Target element was not found.");
    switch (command.getMode) {
      case "attr":
        if (!command.attribute) throw new Error("attr lookups require attribute");
        return element.getAttribute(command.attribute);
      case "html":
        return element.innerHTML;
      case "text":
        return normalize(element.textContent);
      case "value":
        return element.value ?? element.getAttribute?.("value");
      default:
        return normalize(element.textContent);
    }
  };
  const waitForCondition = () =>
    new Promise((resolve, reject) => {
      const deadline = Date.now() + (Number(command.timeoutMs) || 4000);
      const check = () => {
        try {
          if (command.selector && document.querySelector(command.selector)) {
            resolve({ ok: true, selector: command.selector });
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
    case "get":
      return { value: getResult() };
    case "click": {
      const element = findTarget();
      if (!element) throw new Error("Target element was not found.");
      if (typeof element.click === "function") element.click();
      return { clicked: true, element: serialize(element), url: location.href };
    }
    case "fill":
      return setInputValue(false);
    case "type":
      return setInputValue(true);
    case "press": {
      const target = findTarget() ?? document.activeElement ?? document.body;
      const key = command.key || "Enter";
      target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      target.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
      return { key, url: location.href };
    }
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

  if (command.subaction === "inspect") {
    const value =
      result && typeof result === "object" && !Array.isArray(result)
        ? (result as {
            elements?: BrowserWorkspaceDomElementSummary[];
          })
        : null;
    return {
      mode: "desktop",
      subaction: command.subaction,
      elements: Array.isArray(value?.elements) ? value.elements : [],
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
    searchParams.append(key, typeof value === "string" ? value : value.name);
  }

  if (method === "get") {
    const nextUrl = new URL(submitUrl);
    nextUrl.search = searchParams.toString();
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
    const tab = getWebBrowserWorkspaceTabState(id);
    const dom = await ensureLoadedWebBrowserWorkspaceTabDocument(tab);
    const document = dom.window.document;

    switch (command.subaction) {
      case "inspect": {
        return {
          mode: "web",
          subaction: command.subaction,
          elements: collectBrowserWorkspaceInspectElements(document),
          value: {
            title: tab.title,
            url: tab.url,
          },
        };
      }
      case "get": {
        if (command.getMode === "title") {
          return {
            mode: "web",
            subaction: command.subaction,
            value: tab.title,
          };
        }
        if (command.getMode === "url") {
          return {
            mode: "web",
            subaction: command.subaction,
            value: tab.url,
          };
        }
        if (command.getMode === "count") {
          if (!command.selector?.trim()) {
            throw new Error("Milady browser workspace get count requires selector.");
          }
          return {
            mode: "web",
            subaction: command.subaction,
            value: document.querySelectorAll(command.selector).length,
          };
        }

        const element = resolveBrowserWorkspaceElement(
          document,
          command.selector,
          command.text,
        );
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
          case "html":
            value = element.innerHTML;
            break;
          case "value":
            value =
              element.tagName === "INPUT" ||
              element.tagName === "TEXTAREA" ||
              element.tagName === "SELECT"
                ? (
                    element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
                  ).value
                : null;
            break;
          case "text":
          default:
            value = normalizeBrowserWorkspaceText(element.textContent);
            break;
        }

        return {
          mode: "web",
          subaction: command.subaction,
          value,
        };
      }
      case "fill":
      case "type": {
        const element = resolveBrowserWorkspaceElement(
          document,
          command.selector,
          command.text,
        );
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
        control.value = nextValue;
        if (control.tagName === "TEXTAREA") {
          control.textContent = nextValue;
        }
        control.setAttribute("value", nextValue);
        return {
          mode: "web",
          subaction: command.subaction,
          value: {
            selector: buildBrowserWorkspaceElementSelector(control),
            value: nextValue,
          },
        };
      }
      case "click": {
        const element = resolveBrowserWorkspaceElement(
          document,
          command.selector,
          command.text,
        );
        if (!element) {
          throw new Error("Target element was not found.");
        }

        const tag = element.tagName.toLowerCase();
        if (tag === "a") {
          const href = element.getAttribute("href")?.trim();
          if (!href) {
            throw new Error("Target link does not have an href.");
          }
          const nextUrl = new URL(href, tab.url).toString();
          tab.url = assertBrowserWorkspaceUrl(nextUrl);
          tab.title = inferBrowserWorkspaceTitle(tab.url);
          tab.dom = null;
          tab.loadedUrl = null;
          pushWebBrowserWorkspaceHistory(tab, tab.url);
          await loadWebBrowserWorkspaceTabDocument(tab);
          return {
            mode: "web",
            subaction: command.subaction,
            tab: cloneWebBrowserWorkspaceTabState(tab),
            value: {
              selector: buildBrowserWorkspaceElementSelector(element),
              url: tab.url,
            },
          };
        }

        const inputElement = tag === "input" ? (element as HTMLInputElement) : null;
        const inputType = inputElement?.type?.toLowerCase() ?? "";
        if (inputElement && (inputType === "checkbox" || inputType === "radio")) {
          inputElement.checked =
            inputType === "radio" ? true : !inputElement.checked;
          return {
            mode: "web",
            subaction: command.subaction,
            value: {
              selector: buildBrowserWorkspaceElementSelector(element),
              checked: inputElement.checked,
            },
          };
        }

        const submitForm = findClosestBrowserWorkspaceForm(element);
        if (
          submitForm &&
          (tag === "form" ||
            tag === "button" ||
            (tag === "input" &&
              ["button", "image", "submit"].includes(inputType || "submit")))
        ) {
          await submitWebBrowserWorkspaceForm(tab, submitForm);
          return {
            mode: "web",
            subaction: command.subaction,
            tab: cloneWebBrowserWorkspaceTabState(tab),
            value: {
              selector: buildBrowserWorkspaceElementSelector(element),
              url: tab.url,
            },
          };
        }

        return {
          mode: "web",
          subaction: command.subaction,
          value: {
            selector: buildBrowserWorkspaceElementSelector(element),
            text: normalizeBrowserWorkspaceText(element.textContent),
          },
        };
      }
      case "press": {
        const key = command.key?.trim() || "Enter";
        const element = resolveBrowserWorkspaceElement(
          document,
          command.selector,
          command.text,
        );
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

        return {
          mode: "web",
          subaction: command.subaction,
          value: { key },
        };
      }
      case "wait": {
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
            ? Boolean(currentDocument.querySelector(command.selector))
            : false;
          const matchesText = command.text?.trim()
            ? normalizeBrowserWorkspaceText(currentDocument.body?.textContent).includes(
                command.text.trim(),
              )
            : false;
          const matchesUrl = command.url?.trim()
            ? tab.url.includes(command.url.trim())
            : false;

          if (
            matchesSelector ||
            matchesText ||
            matchesUrl ||
            (!command.selector && !command.text && !command.url)
          ) {
            return {
              mode: "web",
              subaction: command.subaction,
              value: {
                selector: command.selector ?? null,
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
      return {
        mode: getBrowserWorkspaceMode(env),
        subaction: command.subaction,
        tab: await openBrowserWorkspaceTab(
          {
            partition: command.partition,
            show: command.show,
            title: command.title,
            url: command.url,
          },
          env,
        ),
      };
    case "navigate": {
      const id = isBrowserWorkspaceBridgeConfigured(env)
        ? await resolveDesktopBrowserWorkspaceTargetTabId(command, env)
        : findWebBrowserWorkspaceTargetTabId(command);
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
    case "snapshot": {
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
        return executeDesktopBrowserWorkspaceDomCommand(command, env);
      }

      return withWebStateLock(async () => {
        const id = findWebBrowserWorkspaceTargetTabId(command);
        const tab = getWebBrowserWorkspaceTabState(id);

        if (command.subaction === "reload") {
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
    case "click":
    case "fill":
    case "get":
    case "press":
    case "type":
    case "wait":
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
