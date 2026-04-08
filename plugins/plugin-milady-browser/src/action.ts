import type {
  Action,
  ActionExample,
  HandlerOptions,
  IAgentRuntime,
  Memory,
} from "@elizaos/core";
import {
  type BrowserWorkspaceCommand,
  type BrowserWorkspaceCommandResult,
  type BrowserWorkspaceGetMode,
  type BrowserWorkspaceSubaction,
  executeBrowserWorkspaceCommand,
} from "@miladyai/agent/services/browser-workspace";

type BrowserWorkspaceActionRequest = BrowserWorkspaceCommand;

const URL_RE = /https?:\/\/[^\s)]+/i;
const TAB_ID_RE = /\b(btab_\d+)\b/i;

function getMessageText(message: Memory): string {
  return typeof message.content?.text === "string" ? message.content.text : "";
}

function normalizeSubaction(
  value: string | undefined,
): BrowserWorkspaceSubaction | null {
  if (!value) return null;
  switch (value.trim().toLowerCase()) {
    case "back":
    case "batch":
    case "click":
    case "close":
    case "eval":
    case "fill":
    case "forward":
    case "get":
    case "hide":
    case "inspect":
    case "list":
    case "navigate":
    case "open":
    case "press":
    case "reload":
    case "show":
    case "snapshot":
    case "type":
    case "wait":
      return value.trim().toLowerCase() as BrowserWorkspaceSubaction;
    default:
      return null;
  }
}

function normalizeGetMode(value: string | undefined): BrowserWorkspaceGetMode | null {
  if (!value) return null;
  switch (value.trim().toLowerCase()) {
    case "attr":
    case "count":
    case "html":
    case "text":
    case "title":
    case "url":
    case "value":
      return value.trim().toLowerCase() as BrowserWorkspaceGetMode;
    default:
      return null;
  }
}

function parseBooleanLike(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
}

function parseNumberLike(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseCommandRecord(
  raw: Record<string, unknown>,
): BrowserWorkspaceCommand | null {
  const subaction = normalizeSubaction(
    typeof raw.subaction === "string"
      ? raw.subaction
      : typeof raw.operation === "string"
        ? raw.operation
        : undefined,
  );
  if (!subaction) return null;

  return {
    subaction,
    id: typeof raw.id === "string" ? raw.id : undefined,
    url: typeof raw.url === "string" ? raw.url : undefined,
    title: typeof raw.title === "string" ? raw.title : undefined,
    script: typeof raw.script === "string" ? raw.script : undefined,
    show: parseBooleanLike(raw.show),
    partition: typeof raw.partition === "string" ? raw.partition : undefined,
    selector: typeof raw.selector === "string" ? raw.selector : undefined,
    text:
      typeof raw.text === "string"
        ? raw.text
        : typeof raw.targetText === "string"
          ? raw.targetText
          : undefined,
    value: typeof raw.value === "string" ? raw.value : undefined,
    attribute:
      typeof raw.attribute === "string"
        ? raw.attribute
        : typeof raw.attr === "string"
          ? raw.attr
          : undefined,
    key: typeof raw.key === "string" ? raw.key : undefined,
    getMode: normalizeGetMode(
      typeof raw.getMode === "string"
        ? raw.getMode
        : typeof raw.mode === "string"
          ? raw.mode
          : undefined,
    ) ?? undefined,
    timeoutMs: parseNumberLike(raw.timeoutMs),
    steps: Array.isArray(raw.steps)
      ? raw.steps
          .map((entry) =>
            entry && typeof entry === "object"
              ? parseCommandRecord(entry as Record<string, unknown>)
              : null,
          )
          .filter((entry): entry is BrowserWorkspaceCommand => Boolean(entry))
      : undefined,
  };
}

function parseStepsParam(value: unknown): BrowserWorkspaceCommand[] | undefined {
  if (Array.isArray(value)) {
    const steps = value
      .map((entry) =>
        entry && typeof entry === "object"
          ? parseCommandRecord(entry as Record<string, unknown>)
          : null,
      )
      .filter((entry): entry is BrowserWorkspaceCommand => Boolean(entry));
    return steps.length > 0 ? steps : undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parseStepsParam(parsed);
  } catch {
    return undefined;
  }
}

function parseRequest(
  message: Memory,
  options?: HandlerOptions,
): BrowserWorkspaceActionRequest | null {
  const messageText = getMessageText(message);
  const params = (options?.parameters ?? {}) as Record<string, unknown>;
  const fromParams = normalizeSubaction(
    typeof params.subaction === "string"
      ? params.subaction
      : typeof params.operation === "string"
        ? params.operation
        : undefined,
  );
  const url =
    typeof params.url === "string"
      ? params.url
      : (messageText.match(URL_RE)?.[0] ?? undefined);
  const id =
    typeof params.id === "string"
      ? params.id
      : (messageText.match(TAB_ID_RE)?.[1] ?? undefined);
  const steps =
    parseStepsParam(params.steps) ?? parseStepsParam(params.stepsJson);
  const lower = messageText.toLowerCase();
  const inferred =
    fromParams ??
    (steps?.length ? "batch" : null) ??
    (/\b(list|tabs?)\b/.test(lower)
      ? "list"
      : /\b(snapshot|screenshot)\b/.test(lower)
        ? "snapshot"
        : /\b(open|new tab|browse)\b/.test(lower) && Boolean(url)
          ? "open"
          : /\bnavigate\b/.test(lower) && Boolean(url)
            ? "navigate"
            : /\bshow\b/.test(lower)
              ? "show"
              : /\bhide\b|\bbackground\b/.test(lower)
                ? "hide"
                : /\bclose\b/.test(lower)
                  ? "close"
                  : /\binspect\b|\bscan page\b|\bwhat.*page\b/.test(lower)
                    ? "inspect"
                    : /\bclick\b/.test(lower) &&
                        (typeof params.selector === "string" ||
                          typeof params.text === "string")
                      ? "click"
                      : /\bfill\b|\benter\b|\btype into\b/.test(lower) &&
                          (typeof params.selector === "string" ||
                            typeof params.text === "string")
                        ? "fill"
                        : /\bwait\b/.test(lower)
                          ? "wait"
                          : /\bget\b|\bread\b|\bextract\b/.test(lower)
                            ? "get"
                            : /\beval\b|\bexecute js\b|\brun script\b/.test(lower)
                              ? "eval"
                              : null);

  if (!inferred) return null;

  return {
    subaction: inferred,
    id,
    url,
    title: typeof params.title === "string" ? params.title : undefined,
    script: typeof params.script === "string" ? params.script : undefined,
    show: parseBooleanLike(params.show),
    partition:
      typeof params.partition === "string" ? params.partition : undefined,
    selector: typeof params.selector === "string" ? params.selector : undefined,
    text:
      typeof params.text === "string"
        ? params.text
        : typeof params.targetText === "string"
          ? params.targetText
          : undefined,
    value: typeof params.value === "string" ? params.value : undefined,
    attribute:
      typeof params.attribute === "string"
        ? params.attribute
        : typeof params.attr === "string"
          ? params.attr
          : undefined,
    key: typeof params.key === "string" ? params.key : undefined,
    getMode:
      normalizeGetMode(
        typeof params.getMode === "string"
          ? params.getMode
          : typeof params.mode === "string"
            ? params.mode
            : undefined,
      ) ?? undefined,
    timeoutMs: parseNumberLike(params.timeoutMs),
    steps,
  };
}

function stringifyResult(value: unknown): string {
  try {
    const rendered = JSON.stringify(value);
    if (!rendered) return "null";
    return rendered.length > 320 ? `${rendered.slice(0, 317)}...` : rendered;
  } catch {
    return String(value);
  }
}

function formatSingleCommandResult(result: BrowserWorkspaceCommandResult): string {
  switch (result.subaction) {
    case "list": {
      if (!result.tabs?.length) {
        return "Milady browser workspace has no open tabs.";
      }
      return [
        `Milady browser workspace has ${result.tabs.length} tab${result.tabs.length === 1 ? "" : "s"} open:`,
        ...result.tabs.map(
          (tab) =>
            `- ${tab.id} [${tab.visible ? "visible" : "background"}] ${tab.url}`,
        ),
      ].join("\n");
    }
    case "open": {
      const tab = result.tab;
      return tab
        ? `Opened ${tab.visible ? "visible" : "background"} browser tab ${tab.id} at ${tab.url}.`
        : "Opened a browser tab.";
    }
    case "navigate": {
      return result.tab
        ? `Navigated ${result.tab.id} to ${result.tab.url}.`
        : "Navigated the browser tab.";
    }
    case "show": {
      return result.tab
        ? `Showing browser tab ${result.tab.id} (${result.tab.url}).`
        : "Showing the browser tab.";
    }
    case "hide": {
      return result.tab
        ? `Moved browser tab ${result.tab.id} into the background.`
        : "Moved the browser tab into the background.";
    }
    case "close":
      return result.closed
        ? "Closed browser tab."
        : "The requested browser tab was not open.";
    case "eval":
      return `Evaluated JavaScript in the browser tab: ${stringifyResult(result.value)}`;
    case "snapshot":
      return `Captured a browser snapshot (${result.snapshot?.data.length ?? 0} base64 chars).`;
    case "inspect": {
      const prefix =
        result.value && typeof result.value === "object" && !Array.isArray(result.value)
          ? (result.value as { title?: string; url?: string })
          : null;
      const head = `Inspected ${prefix?.title ? `${prefix.title} ` : ""}${prefix?.url ? `at ${prefix.url}` : "the current page"}.`;
      if (!result.elements?.length) {
        return `${head} No interactive elements were found.`;
      }
      return [
        head,
        ...result.elements
          .slice(0, 8)
          .map(
            (element) =>
              `- ${element.selector} <${element.tag}> ${element.text || element.value || ""}`.trim(),
          ),
      ].join("\n");
    }
    case "get":
      return `Read from the browser: ${stringifyResult(result.value)}`;
    case "fill":
    case "type":
      return `Updated browser input: ${stringifyResult(result.value)}`;
    case "click":
      return `Clicked the browser element: ${stringifyResult(result.value)}`;
    case "press":
      return `Sent a key press in the browser: ${stringifyResult(result.value)}`;
    case "wait":
      return `Wait condition satisfied in the browser: ${stringifyResult(result.value)}`;
    case "back":
      return `Moved the browser tab back: ${stringifyResult(result.value)}`;
    case "forward":
      return `Moved the browser tab forward: ${stringifyResult(result.value)}`;
    case "reload":
      return `Reloaded the browser tab: ${stringifyResult(result.value)}`;
    default:
      return stringifyResult(result.value);
  }
}

function formatBrowserWorkspaceCommandResult(
  result: BrowserWorkspaceCommandResult,
): string {
  if (result.subaction !== "batch") {
    return formatSingleCommandResult(result);
  }

  const steps = Array.isArray(result.steps) ? result.steps : [];
  if (steps.length === 0) {
    return "Completed an empty browser batch.";
  }

  return [
    `Completed ${steps.length} browser subaction${steps.length === 1 ? "" : "s"}.`,
    ...steps.map((step) => `- ${formatSingleCommandResult(step)}`),
  ].join("\n");
}

export const manageMiladyBrowserWorkspaceAction: Action = {
  name: "MANAGE_MILADY_BROWSER_WORKSPACE",
  description:
    "Use the Milady browser workspace through one main action. Pass a subaction such as list, open, navigate, show, hide, close, inspect, click, fill, type, press, wait, get, back, forward, reload, eval, snapshot, or batch. Use batch with stepsJson to run a series of browser subactions in order.",
  similes: [
    "browser command",
    "browser subaction",
    "open browser tab",
    "inspect browser page",
    "click browser element",
  ],
  parameters: [
    {
      name: "subaction",
      description:
        "Browser subaction to run: list, open, navigate, show, hide, close, inspect, click, fill, type, press, wait, get, back, forward, reload, eval, snapshot, or batch.",
      required: false,
      schema: {
        type: "string",
        enum: [
          "list",
          "open",
          "navigate",
          "show",
          "hide",
          "close",
          "inspect",
          "click",
          "fill",
          "type",
          "press",
          "wait",
          "get",
          "back",
          "forward",
          "reload",
          "eval",
          "snapshot",
          "batch",
        ],
      },
    },
    {
      name: "operation",
      description:
        "Legacy alias for subaction. Prefer subaction for all new browser calls.",
      required: false,
      schema: { type: "string" },
    },
    {
      name: "id",
      description:
        "Optional browser workspace tab ID, such as btab_1. Omit it to target the current visible tab.",
      required: false,
      schema: { type: "string" },
    },
    {
      name: "url",
      description: "Target URL to open, navigate to, or wait for.",
      required: false,
      schema: { type: "string" },
    },
    {
      name: "selector",
      description: "CSS selector for browser element subactions.",
      required: false,
      schema: { type: "string" },
    },
    {
      name: "text",
      description:
        "Visible text matcher for browser element subactions when selector is not available.",
      required: false,
      schema: { type: "string" },
    },
    {
      name: "value",
      description: "Value to fill, type, or otherwise pass to the browser.",
      required: false,
      schema: { type: "string" },
    },
    {
      name: "attribute",
      description: "Attribute name for get attr lookups.",
      required: false,
      schema: { type: "string" },
    },
    {
      name: "getMode",
      description:
        "Lookup mode for get: text, html, value, attr, title, url, or count.",
      required: false,
      schema: {
        type: "string",
        enum: ["text", "html", "value", "attr", "title", "url", "count"],
      },
    },
    {
      name: "key",
      description: "Keyboard key for press, such as Enter or Tab.",
      required: false,
      schema: { type: "string" },
    },
    {
      name: "script",
      description: "JavaScript source to run for eval subactions.",
      required: false,
      schema: { type: "string" },
    },
    {
      name: "stepsJson",
      description:
        "JSON array of browser subaction objects for batch mode. Example: [{\"subaction\":\"open\",\"url\":\"https://example.com\",\"show\":true},{\"subaction\":\"inspect\"}]",
      required: false,
      schema: { type: "string" },
    },
    {
      name: "timeoutMs",
      description: "Optional timeout in milliseconds for wait subactions.",
      required: false,
      schema: { type: "number" },
    },
    {
      name: "show",
      description:
        "Whether a newly opened tab should be visible immediately.",
      required: false,
      schema: { type: "boolean" },
    },
    {
      name: "title",
      description: "Optional browser tab title override when opening a tab.",
      required: false,
      schema: { type: "string" },
    },
    {
      name: "partition",
      description: "Optional browser partition to use for the tab session.",
      required: false,
      schema: { type: "string" },
    },
  ],
  validate: async (
    _runtime: IAgentRuntime,
    message: Memory,
    options?: HandlerOptions,
  ) => {
    if (parseRequest(message, options)) {
      return true;
    }
    return /\b(browser|tab|tabs|webpage|website|iframe|page)\b/i.test(
      getMessageText(message),
    );
  },
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state,
    options,
    callback,
  ) => {
    const request = parseRequest(message, options);
    if (!request) {
      const text =
        "Could not determine the browser subaction. Pass subaction plus selector/url/value explicitly, or use batch with stepsJson.";
      await callback?.({ text });
      return { success: false, text };
    }

    if (
      request.subaction === "eval" &&
      !(
        (options?.parameters as Record<string, unknown> | undefined)?.subaction ??
        (options?.parameters as Record<string, unknown> | undefined)?.operation
      )
    ) {
      const text =
        "For safety, JavaScript evaluation must be requested with explicit parameters (subaction: 'eval', id if needed, script). Natural-language eval inference is disabled.";
      await callback?.({ text });
      return { success: false, text };
    }

    if (request.subaction === "batch" && (!request.steps || request.steps.length === 0)) {
      const text =
        "Browser batch mode requires stepsJson with at least one subaction step.";
      await callback?.({ text });
      return { success: false, text };
    }

    try {
      const result = await executeBrowserWorkspaceCommand(request);
      const text = formatBrowserWorkspaceCommandResult(result);
      await callback?.({ text });
      return { success: true, text, data: result };
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      await callback?.({ text });
      return { success: false, text };
    }
  },
  examples: [
    [
      {
        name: "user",
        content: {
          text: "Use one browser action to open https://example.com, inspect the page, and read the h1 text.",
        },
      },
      {
        name: "assistant",
        content: {
          text: "Completed 3 browser subactions.\n- Opened visible browser tab btab_1 at https://example.com/.\n- Inspected Example Domain at https://example.com/.\n- Read from the browser: \"Example Domain\"",
        },
      },
    ],
  ] as ActionExample[][],
};
