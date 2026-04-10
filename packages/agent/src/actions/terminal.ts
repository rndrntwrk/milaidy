/**
 * RUN_IN_TERMINAL action — runs a shell command on the server.
 *
 * When triggered the action:
 *   1. Extracts the command from the parameters, NL text, or MCP-style JSON
 *   2. POSTs to the local API server to execute it
 *   3. The API broadcasts output via WebSocket for real-time display
 *   4. Returns a descriptive text response
 *
 * @module actions/terminal
 */

import type { Action, HandlerOptions, Memory } from "@elizaos/core";

/** API port for posting terminal requests. */
const API_PORT = process.env.API_PORT || process.env.SERVER_PORT || "2138";

const FAIL = { success: false, text: "" } as const;

/**
 * Extract a command from handler options and message text.
 *
 * Resolution order:
 *   1. `parameters.command` — explicit parameter
 *   2. `parameters.arguments` — MCP-style JSON string like `{"command":"ls"}`
 *   3. Natural language extraction from message text
 */
function getCommand(
  options?: HandlerOptions,
  message?: Memory,
): string | undefined {
  const params = options?.parameters as
    | { command?: string; arguments?: string }
    | undefined;

  // 1. Explicit command parameter
  if (params?.command) return params.command;

  // 2. MCP-style JSON arguments
  if (typeof params?.arguments === "string") {
    try {
      const parsed = JSON.parse(params.arguments);
      if (parsed?.command) return parsed.command;
    } catch {
      // Not valid JSON — fall through
    }
  }

  // 3. Extract from natural language (look for common CLI patterns)
  const text = message?.content?.text;
  if (typeof text === "string" && text.length > 0) {
    // Match common shell commands after phrases like "run", "execute", etc.
    // Two-step: capture the phrase, then trim trailing prepositions
    // (e.g. "in the shell", "on the server").
    const match = text.match(
      /(?:run|execute|start|do)\s+(?:the\s+command\s+)?[`'"]*(.+?)[`'"]*[?.!]?\s*$/i,
    );
    if (match?.[1]) {
      const trimmed = match[1]
        .replace(/\s+(?:in|on|from|to|for|at)\s+(?:the\s+)?[\w\s]+$/i, "")
        .trim();
      if (trimmed) return trimmed;
    }
  }

  // Last resort: generate a reasonable command from the user's intent.
  // This fires when the LLM picks RUN_IN_TERMINAL but doesn't include the
  // command parameter (a known TOON parsing gap). Rather than failing silently,
  // infer the command from the message content.
  const lower = (text ?? "").toLowerCase();
  const cryptoMatch = lower.match(
    /\b(bitcoin|btc|ethereum|eth|solana|sol)\b/,
  );
  if (cryptoMatch) {
    const ids: Record<string, string> = {
      bitcoin: "bitcoin", btc: "bitcoin",
      ethereum: "ethereum", eth: "ethereum",
      solana: "solana", sol: "solana",
    };
    const id = ids[cryptoMatch[1]];
    if (id) {
      return `curl -s "https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true"`;
    }
  }
  if (/\b(?:disk|space|storage)\b/i.test(lower)) return "df -h /home/milady";
  if (/\b(?:uptime|load)\b/i.test(lower)) return "uptime";
  if (/\b(?:memory|ram)\b/i.test(lower)) return "free -h";
  if (/\b(?:process|top|memory.*usage)\b/i.test(lower)) return "ps aux --sort=-rss | head -15";

  return undefined;
}

export const terminalAction: Action = {
  name: "RUN_IN_TERMINAL",

  similes: [
    "RUN_COMMAND",
    "EXECUTE_COMMAND",
    "TERMINAL",
    "SHELL",
    "RUN_SHELL",
    "EXEC",
    "CALL_MCP_TOOL",
  ],

  description:
    "Run a single explicit shell command that the user provided directly. " +
    "Only use when the user gives a specific command like 'run ls -la' or 'execute npm install'. " +
    "Do NOT use for building projects, creating websites, or multi-step work — use CREATE_TASK instead.",

  validate: async (_runtime, message) => {
    const text = (message?.content?.text ?? "").trim();
    if (!text) return false;
    // Backtick-wrapped command
    if (/`[^`]+`/.test(text)) return true;
    // Code-fenced command
    if (/```/.test(text)) return true;
    // Explicit "run/execute" keyword
    if (/\b(?:run|execute)\s+\S/i.test(text)) return true;
    // Data lookups that need a real command (price, disk, uptime, curl)
    if (/\b(?:price|worth|cost|balance|disk|uptime|status|check|curl|fetch|tail|head|log)\b/i.test(text)) return true;
    return false;
  },

  handler: async (_runtime, _message, _state, options) => {
    const command = getCommand(
      options as HandlerOptions | undefined,
      _message as Memory | undefined,
    );

    if (!command) {
      return FAIL;
    }

    try {
      const response = await fetch(
        `http://localhost:${API_PORT}/api/terminal/run`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command,
            clientId: "runtime-terminal-action",
          }),
        },
      );

      if (!response.ok) {
        return FAIL;
      }

      return {
        text: `Running in terminal: \`${command}\``,
        success: true,
        data: { command },
      };
    } catch {
      return FAIL;
    }
  },

  parameters: [
    {
      name: "command",
      description: "The shell command to execute in the terminal",
      required: true,
      schema: { type: "string" as const },
    },
  ],
};
