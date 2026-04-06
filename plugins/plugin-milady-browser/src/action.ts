import type {
  Action,
  ActionExample,
  HandlerOptions,
  IAgentRuntime,
  Memory,
} from "@elizaos/core";
import {
  type BrowserWorkspaceOperation,
  closeBrowserWorkspaceTab,
  evaluateBrowserWorkspaceTab,
  hideBrowserWorkspaceTab,
  listBrowserWorkspaceTabs,
  navigateBrowserWorkspaceTab,
  openBrowserWorkspaceTab,
  showBrowserWorkspaceTab,
  snapshotBrowserWorkspaceTab,
} from "@miladyai/agent/services/browser-workspace";

type BrowserWorkspaceActionRequest = {
  operation: BrowserWorkspaceOperation;
  id?: string;
  url?: string;
  title?: string;
  script?: string;
  show?: boolean;
  partition?: string;
};

const URL_RE = /https?:\/\/[^\s)]+/i;
const TAB_ID_RE = /\b(btab_\d+)\b/i;

function getMessageText(message: Memory): string {
  return typeof message.content?.text === "string" ? message.content.text : "";
}

function normalizeOperation(
  value: string | undefined,
): BrowserWorkspaceOperation | null {
  if (!value) return null;
  switch (value.trim().toLowerCase()) {
    case "list":
    case "open":
    case "navigate":
    case "show":
    case "hide":
    case "close":
    case "eval":
    case "snapshot":
      return value.trim().toLowerCase() as BrowserWorkspaceOperation;
    default:
      return null;
  }
}

function parseRequest(
  message: Memory,
  options?: HandlerOptions,
): BrowserWorkspaceActionRequest | null {
  const text = getMessageText(message);
  const params = (options?.parameters ?? {}) as Record<string, unknown>;
  const fromParams = normalizeOperation(
    typeof params.operation === "string" ? params.operation : undefined,
  );
  const url =
    typeof params.url === "string"
      ? params.url
      : (text.match(URL_RE)?.[0] ?? undefined);
  const id =
    typeof params.id === "string"
      ? params.id
      : (text.match(TAB_ID_RE)?.[1] ?? undefined);
  const title = typeof params.title === "string" ? params.title : undefined;
  const script = typeof params.script === "string" ? params.script : undefined;
  const partition =
    typeof params.partition === "string" ? params.partition : undefined;
  const show = typeof params.show === "boolean" ? params.show : undefined;

  const lower = text.toLowerCase();
  const inferred =
    fromParams ??
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
                  : /\beval\b|\bexecute js\b|\brun script\b/.test(lower)
                    ? "eval"
                    : null);

  if (!inferred) return null;
  return {
    operation: inferred,
    id,
    url,
    title,
    script,
    show,
    partition,
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

async function runBrowserWorkspaceOperation(
  request: BrowserWorkspaceActionRequest,
): Promise<string> {
  switch (request.operation) {
    case "list": {
      const tabs = await listBrowserWorkspaceTabs();
      if (tabs.length === 0) {
        return "Milady browser workspace has no open tabs.";
      }
      return [
        `Milady browser workspace has ${tabs.length} tab${tabs.length === 1 ? "" : "s"} open:`,
        ...tabs.map(
          (tab) =>
            `- ${tab.id} [${tab.visible ? "visible" : "background"}] ${tab.url}`,
        ),
      ].join("\n");
    }
    case "open": {
      const tab = await openBrowserWorkspaceTab({
        url: request.url,
        title: request.title,
        show: request.show ?? false,
        partition: request.partition,
      });
      return `Opened ${tab.visible ? "visible" : "background"} browser tab ${tab.id} at ${tab.url}.`;
    }
    case "navigate": {
      if (!request.id || !request.url) {
        throw new Error("navigate requires both id and url");
      }
      const tab = await navigateBrowserWorkspaceTab({
        id: request.id,
        url: request.url,
      });
      return `Navigated ${tab.id} to ${tab.url}.`;
    }
    case "show": {
      if (!request.id) throw new Error("show requires an id");
      const tab = await showBrowserWorkspaceTab(request.id);
      return `Showing browser tab ${tab.id} (${tab.url}).`;
    }
    case "hide": {
      if (!request.id) throw new Error("hide requires an id");
      const tab = await hideBrowserWorkspaceTab(request.id);
      return `Moved browser tab ${tab.id} into the background.`;
    }
    case "close": {
      if (!request.id) throw new Error("close requires an id");
      const closed = await closeBrowserWorkspaceTab(request.id);
      return closed
        ? `Closed browser tab ${request.id}.`
        : `Browser tab ${request.id} was not open.`;
    }
    case "eval": {
      if (!request.id || !request.script) {
        throw new Error("eval requires both id and script");
      }
      const result = await evaluateBrowserWorkspaceTab({
        id: request.id,
        script: request.script,
      });
      return `Evaluated JavaScript in ${request.id}: ${stringifyResult(result)}`;
    }
    case "snapshot": {
      if (!request.id) throw new Error("snapshot requires an id");
      const snapshot = await snapshotBrowserWorkspaceTab(request.id);
      return `Captured a snapshot for ${request.id} (${snapshot.data.length} base64 chars).`;
    }
  }
}

export const manageMiladyBrowserWorkspaceAction: Action = {
  name: "MANAGE_MILADY_BROWSER_WORKSPACE",
  description:
    "Open, list, navigate, show, hide, close, snapshot, or evaluate browser tabs inside the Milady browser workspace, whether it is backed by the desktop shell or the web iframe surface.",
  similes: [
    "open browser tab",
    "list browser tabs",
    "show browser tab",
    "hide browser tab",
    "close browser tab",
  ],
  validate: async (
    _runtime: IAgentRuntime,
    message: Memory,
    options?: HandlerOptions,
  ) => {
    if (parseRequest(message, options)) {
      return true;
    }
    return /\b(browser|tab|tabs|webpage|website)\b/i.test(
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
        "Could not determine the browser workspace operation. Pass operation/id/url/script explicitly or ask to open, list, navigate, show, hide, close, eval, or snapshot a tab.";
      await callback?.({ text });
      return { success: false, text };
    }

    // Guard: eval must come from explicit parameters, not inferred from
    // natural language alone — mitigates prompt-injection risk where a
    // malicious page title or message tricks the agent into running JS.
    if (
      request.operation === "eval" &&
      !(options?.parameters as Record<string, unknown> | undefined)?.operation
    ) {
      const text =
        "For safety, JavaScript evaluation must be requested with explicit parameters (operation: 'eval', id, script). Natural-language eval inference is disabled.";
      await callback?.({ text });
      return { success: false, text };
    }

    try {
      const text = await runBrowserWorkspaceOperation(request);
      await callback?.({ text });
      return { success: true, text };
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
          text: "Open a browser tab to https://example.com in the background",
        },
      },
      {
        name: "assistant",
        content: {
          text: "Opened background browser tab btab_1 at https://example.com/.",
        },
      },
    ],
  ] as ActionExample[][],
};
