/**
 * Structured logging with automatic context injection.
 *
 * Features:
 * - JSON structured output (production) or pretty-printed (development)
 * - Automatic request context correlation via AsyncLocalStorage
 * - Sensitive data redaction
 * - Log levels: trace, debug, info, warn, error, fatal
 *
 * @module logging/logger
 */

import { AsyncLocalStorage } from "node:async_hooks";
import os from "node:os";

// Types
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface LoggingConfig {
  level?: LogLevel;
  pretty?: boolean;
  redactPaths?: string[];
}

export interface RequestContext {
  requestId: string;
  sessionId?: string;
  agentId?: string;
  userId?: string;
  channel?: string;
}

export interface LogEntry {
  level: LogLevel;
  time: number;
  msg: string;
  pid: number;
  hostname: string;
  version?: string;
  [key: string]: unknown;
}

// Log level priorities
const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

// Default paths to redact
const DEFAULT_REDACT_PATHS = [
  "password",
  "apiKey",
  "api_key",
  "token",
  "secret",
  "privateKey",
  "private_key",
  "authorization",
  "cookie",
  "refresh",
  "access",
];

// AsyncLocalStorage for request context
const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current request context.
 */
export function getContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

/**
 * Run a function with request context.
 */
export function withContext<T>(ctx: RequestContext, fn: () => T): T {
  return asyncLocalStorage.run(ctx, fn);
}

/**
 * Redact sensitive values from an object.
 */
function redact(
  obj: unknown,
  paths: string[],
  seen = new WeakSet(),
): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  // Prevent circular reference issues
  if (seen.has(obj as object)) return "[Circular]";
  seen.add(obj as object);

  if (Array.isArray(obj)) {
    return obj.map((item) => redact(item, paths, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (paths.some((p) => lowerKey.includes(p.toLowerCase()))) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      result[key] = redact(value, paths, seen);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Format a log entry for output.
 */
function formatEntry(entry: LogEntry, pretty: boolean): string {
  if (pretty) {
    const time = new Date(entry.time).toISOString();
    const level = entry.level.toUpperCase().padEnd(5);
    const color = getColor(entry.level);
    const reset = "\x1b[0m";
    const dim = "\x1b[2m";

    let line = `${dim}${time}${reset} ${color}${level}${reset} ${entry.msg}`;

    // Add extra fields
    const extra = { ...entry };
    delete extra.level;
    delete extra.time;
    delete extra.msg;
    delete extra.pid;
    delete extra.hostname;
    delete extra.version;

    if (Object.keys(extra).length > 0) {
      line += ` ${dim}${JSON.stringify(extra)}${reset}`;
    }

    return line;
  }

  return JSON.stringify(entry);
}

/**
 * Get ANSI color code for log level.
 */
function getColor(level: LogLevel): string {
  switch (level) {
    case "trace":
      return "\x1b[90m"; // Gray
    case "debug":
      return "\x1b[36m"; // Cyan
    case "info":
      return "\x1b[32m"; // Green
    case "warn":
      return "\x1b[33m"; // Yellow
    case "error":
      return "\x1b[31m"; // Red
    case "fatal":
      return "\x1b[35m"; // Magenta
    default:
      return "\x1b[0m"; // Reset
  }
}

/**
 * Create a structured logger.
 */
export function createLogger(config?: LoggingConfig) {
  const minLevel = LOG_LEVELS[config?.level ?? "info"];
  const pretty = config?.pretty ?? process.env.NODE_ENV === "development";
  const redactPaths = config?.redactPaths ?? DEFAULT_REDACT_PATHS;

  const hostname = os.hostname();
  const pid = process.pid;
  const version = process.env.npm_package_version;

  function log(level: LogLevel, msg: string, data?: Record<string, unknown>) {
    if (LOG_LEVELS[level] < minLevel) return;

    const ctx = asyncLocalStorage.getStore();
    const entry: LogEntry = {
      level,
      time: Date.now(),
      msg,
      pid,
      hostname,
      version,
      ...ctx,
      ...(data ? (redact(data, redactPaths) as Record<string, unknown>) : {}),
    };

    const output = formatEntry(entry, pretty);

    if (level === "error" || level === "fatal") {
      console.error(output);
    } else {
      console.log(output);
    }
  }

  return {
    trace: (msg: string, data?: Record<string, unknown>) =>
      log("trace", msg, data),
    debug: (msg: string, data?: Record<string, unknown>) =>
      log("debug", msg, data),
    info: (msg: string, data?: Record<string, unknown>) =>
      log("info", msg, data),
    warn: (msg: string, data?: Record<string, unknown>) =>
      log("warn", msg, data),
    error: (msg: string, data?: Record<string, unknown>) =>
      log("error", msg, data),
    fatal: (msg: string, data?: Record<string, unknown>) =>
      log("fatal", msg, data),

    child: (bindings: Record<string, unknown>) => {
      const childLogger = createLogger(config);
      const originalLog = log;
      return {
        ...childLogger,
        trace: (msg: string, data?: Record<string, unknown>) =>
          originalLog("trace", msg, { ...bindings, ...data }),
        debug: (msg: string, data?: Record<string, unknown>) =>
          originalLog("debug", msg, { ...bindings, ...data }),
        info: (msg: string, data?: Record<string, unknown>) =>
          originalLog("info", msg, { ...bindings, ...data }),
        warn: (msg: string, data?: Record<string, unknown>) =>
          originalLog("warn", msg, { ...bindings, ...data }),
        error: (msg: string, data?: Record<string, unknown>) =>
          originalLog("error", msg, { ...bindings, ...data }),
        fatal: (msg: string, data?: Record<string, unknown>) =>
          originalLog("fatal", msg, { ...bindings, ...data }),
      };
    },

    // For compatibility with console.log-style calls
    log: (msg: string, ...args: unknown[]) => {
      if (args.length > 0 && typeof args[0] === "object") {
        log("info", msg, args[0] as Record<string, unknown>);
      } else {
        log("info", msg);
      }
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;

// Default logger instance
export const logger = createLogger({
  level: (process.env.LOG_LEVEL as LogLevel) ?? "info",
  pretty: process.env.NODE_ENV === "development",
});
