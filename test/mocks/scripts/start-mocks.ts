import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GoogleCalendarRequestLedgerMetadata } from "./google-calendar-state.ts";
import {
  createGoogleMockState,
  type GmailRequestLedgerMetadata,
  googleDynamicFixture,
} from "./google-gmail-state.ts";
import { MockHttpError } from "./mock-http-error.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENVS_DIR = path.resolve(__dirname, "..", "environments");

export const MOCK_ENVIRONMENTS = [
  "google",
  "twilio",
  "whatsapp",
  "x-twitter",
  "calendly",
  "cloud-managed",
] as const;

export type MockEnvironmentName = (typeof MOCK_ENVIRONMENTS)[number];

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type RequestBody = Record<string, JsonValue>;

interface MockoonHeader {
  key: string;
  value: string;
}

interface MockoonResponse {
  statusCode?: number;
  headers?: MockoonHeader[];
  body?: string;
}

interface MockoonRoute {
  method: string;
  endpoint: string;
  responses?: MockoonResponse[];
}

interface MockoonEnvironmentFile {
  name?: string;
  routes?: MockoonRoute[];
}

interface CompiledRoute {
  method: string;
  endpoint: string;
  response: MockoonResponse;
  matcher: RegExp;
  paramNames: string[];
}

interface StartedFixtureServer {
  port: number;
  baseUrl: string;
  requests: MockRequestLedgerEntry[];
  clearRequests(): void;
  stop(): Promise<void>;
}

export interface MockRequestLedgerEntry {
  environment: string;
  method: string;
  path: string;
  query: string;
  body: RequestBody;
  createdAt: string;
  runId?: string;
  gmail?: GmailRequestLedgerMetadata;
  calendar?: GoogleCalendarRequestLedgerMetadata;
}

export interface StartedMocks {
  portMap: Record<MockEnvironmentName, number>;
  baseUrls: Record<MockEnvironmentName, string>;
  /** Convenience env vars to set on process.env */
  envVars: Record<string, string>;
  requestLedger(): MockRequestLedgerEntry[];
  clearRequestLedger(): void;
  stop(): Promise<void>;
}

function envVarsFor(
  envs: readonly MockEnvironmentName[],
  baseUrls: Record<MockEnvironmentName, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (envs.includes("google")) {
    out.MILADY_MOCK_GOOGLE_BASE = baseUrls.google;
    out.MILADY_BLOCK_REAL_GMAIL_WRITES = "1";
  }
  if (envs.includes("twilio")) out.MILADY_MOCK_TWILIO_BASE = baseUrls.twilio;
  if (envs.includes("whatsapp"))
    out.MILADY_MOCK_WHATSAPP_BASE = baseUrls.whatsapp;
  if (envs.includes("x-twitter"))
    out.MILADY_MOCK_X_BASE = baseUrls["x-twitter"];
  if (envs.includes("calendly"))
    out.MILADY_MOCK_CALENDLY_BASE = baseUrls.calendly;
  if (envs.includes("cloud-managed"))
    out.ELIZA_CLOUD_BASE_URL = baseUrls["cloud-managed"];
  return out;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileEndpoint(endpoint: string): {
  matcher: RegExp;
  paramNames: string[];
} {
  const paramNames: string[] = [];
  const segments = endpoint
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      if (segment.startsWith(":")) {
        paramNames.push(segment.slice(1));
        return "([^/]+)";
      }
      return escapeRegex(segment);
    });

  return {
    matcher: new RegExp(`^/${segments.join("/")}/?$`),
    paramNames,
  };
}

function compileRoutes(environment: MockoonEnvironmentFile): CompiledRoute[] {
  return (environment.routes ?? []).map((route) => {
    const { matcher, paramNames } = compileEndpoint(route.endpoint);
    const response = route.responses?.find((candidate) => candidate) ?? {};

    return {
      method: route.method.toUpperCase(),
      endpoint: route.endpoint,
      response,
      matcher,
      paramNames,
    };
  });
}

function readEnvironment(dataPath: string): MockoonEnvironmentFile {
  const parsed = JSON.parse(fs.readFileSync(dataPath, "utf8")) as JsonValue;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid mock environment JSON: ${dataPath}`);
  }

  const environment = parsed as Partial<MockoonEnvironmentFile>;
  if (!Array.isArray(environment.routes)) {
    throw new Error(`Mock environment has no routes array: ${dataPath}`);
  }

  return {
    name: typeof environment.name === "string" ? environment.name : dataPath,
    routes: environment.routes.filter(
      (route): route is MockoonRoute =>
        !!route &&
        typeof route === "object" &&
        !Array.isArray(route) &&
        typeof route.method === "string" &&
        typeof route.endpoint === "string",
    ),
  };
}

async function readRequestBody(
  req: http.IncomingMessage,
): Promise<RequestBody> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.trim().length === 0) return {};

  const contentType = String(req.headers["content-type"] ?? "").toLowerCase();
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw).entries());
  }

  if (contentType.includes("application/json")) {
    let parsed: JsonValue;
    try {
      parsed = JSON.parse(raw) as JsonValue;
    } catch {
      throw new MockHttpError(400, "Invalid JSON body");
    }
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  }

  return Object.fromEntries(new URLSearchParams(raw).entries());
}

function valueAsTemplateString(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function escapeTemplateString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

function randomFromAlphabet(alphabet: string, length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (const byte of bytes) {
    out += alphabet[byte % alphabet.length];
  }
  return out;
}

function fakerValue(kind: string, lengthText?: string): string {
  if (kind === "string.uuid") return crypto.randomUUID();

  const length = Number.parseInt(lengthText ?? "", 10);
  const size = Number.isFinite(length) && length > 0 ? length : 16;
  if (kind === "string.numeric") return randomFromAlphabet("0123456789", size);
  if (kind === "string.alphanumeric") {
    return randomFromAlphabet(
      "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
      size,
    );
  }

  return crypto.randomUUID();
}

function offsetDate(offsetText?: string): Date {
  const date = new Date();
  const match = offsetText?.match(/^([+-])(\d+)([hm])$/);
  if (!match) return date;

  const sign = match[1] === "-" ? -1 : 1;
  const amount = Number.parseInt(match[2], 10);
  const unitMs = match[3] === "h" ? 60 * 60 * 1000 : 60 * 1000;
  return new Date(date.getTime() + sign * amount * unitMs);
}

function formatHttpDate(date: Date): string {
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${weekdays[date.getUTCDay()]}, ${pad(date.getUTCDate())} ${
    months[date.getUTCMonth()]
  } ${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(
    date.getUTCMinutes(),
  )}:${pad(date.getUTCSeconds())} GMT`;
}

function nowValue(format: string, offsetText?: string): string {
  const date = offsetDate(offsetText);
  if (format === "x") return String(date.getTime());
  if (format === "iso") return date.toISOString();
  if (format === "ddd, DD MMM YYYY HH:mm:ss [GMT]") {
    return formatHttpDate(date);
  }
  return date.toISOString();
}

function renderBodyTemplate(
  body: string,
  params: Record<string, string>,
  requestBody: RequestBody,
): string {
  return body
    .replace(/\{\{urlParam '([^']+)'\}\}/g, (_, key: string) =>
      escapeTemplateString(params[key] ?? ""),
    )
    .replace(/\{\{body '([^']+)'\}\}/g, (_, key: string) =>
      escapeTemplateString(valueAsTemplateString(requestBody[key])),
    )
    .replace(
      /\{\{faker '([^']+)'(?: length=(\d+))?\}\}/g,
      (_, kind: string, length: string | undefined) => fakerValue(kind, length),
    )
    .replace(
      /\{\{now '([^']+)'(?: offset='([^']+)')?\}\}/g,
      (_, format: string, offset: string | undefined) =>
        nowValue(format, offset),
    );
}

function findRoute(
  routes: readonly CompiledRoute[],
  method: string,
  pathname: string,
): { route: CompiledRoute; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method) continue;

    const match = route.matcher.exec(pathname);
    if (!match) continue;

    const params: Record<string, string> = {};
    route.paramNames.forEach((name, index) => {
      params[name] = decodeURIComponent(match[index + 1] ?? "");
    });

    return { route, params };
  }

  return null;
}

function headerValue(
  headers: http.IncomingHttpHeaders,
  key: string,
): string | null {
  const value = headers[key.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === "string" ? value : null;
}

function requestRunId(headers: http.IncomingHttpHeaders): string | undefined {
  return (
    headerValue(headers, "x-milady-test-run") ??
    headerValue(headers, "x-milady-run-id") ??
    headerValue(headers, "x-test-run-id") ??
    undefined
  );
}

async function startFixtureServer(
  dataPath: string,
): Promise<StartedFixtureServer> {
  const environment = readEnvironment(dataPath);
  const routes = compileRoutes(environment);
  const requests: MockRequestLedgerEntry[] = [];
  const googleState =
    environment.name === "Google APIs" ? createGoogleMockState() : null;
  let stopped = false;

  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
      const method = (req.method ?? "GET").toUpperCase();
      const requestBody = await readRequestBody(req);
      if (method === "GET" && requestUrl.pathname === "/__mock/requests") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ requests }));
        return;
      }
      if (method === "DELETE" && requestUrl.pathname === "/__mock/requests") {
        requests.splice(0, requests.length);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      const ledgerEntry: MockRequestLedgerEntry = {
        environment: environment.name ?? dataPath,
        method,
        path: requestUrl.pathname,
        query: requestUrl.search,
        body: requestBody,
        createdAt: new Date().toISOString(),
        ...(requestRunId(req.headers)
          ? { runId: requestRunId(req.headers) }
          : {}),
      };
      requests.push(ledgerEntry);
      const dynamicResponse = googleState
        ? googleDynamicFixture(
            googleState,
            method,
            requestUrl.pathname,
            requestUrl.searchParams,
            requestBody,
            req.headers,
            ledgerEntry,
          )
        : null;
      if (dynamicResponse) {
        res.writeHead(dynamicResponse.statusCode, {
          "Content-Type": "application/json",
          ...(dynamicResponse.headers ?? {}),
        });
        res.end(JSON.stringify(dynamicResponse.body));
        return;
      }

      const matched = findRoute(routes, method, requestUrl.pathname);
      if (!matched) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "not_found" }));
        return;
      }

      const response = matched.route.response;
      const headers = Object.fromEntries(
        (response.headers ?? []).map((header) => [header.key, header.value]),
      );
      if (!headers["Content-Type"] && !headers["content-type"]) {
        headers["Content-Type"] = "application/json";
      }

      res.writeHead(response.statusCode ?? 200, headers);
      res.end(
        renderBodyTemplate(response.body ?? "", matched.params, requestBody),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const statusCode = err instanceof MockHttpError ? err.statusCode : 500;
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: statusCode === 500 ? "fixture_error" : "bad_request",
          message,
        }),
      );
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  server.unref();

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error(`Failed to bind mock fixture server: ${dataPath}`);
  }

  const port = (address as AddressInfo).port;
  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    clearRequests: () => {
      requests.splice(0, requests.length);
    },
    stop: async () => {
      if (stopped) return;
      stopped = true;
      if (!server.listening) return;
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

export async function startMocks(opts?: {
  envs?: readonly MockEnvironmentName[];
}): Promise<StartedMocks> {
  const envs = opts?.envs ?? MOCK_ENVIRONMENTS;

  const dataPaths = envs.map((e) => path.resolve(ENVS_DIR, `${e}.json`));
  const missing = dataPaths.filter((p) => !fs.existsSync(p));
  if (missing.length > 0) {
    throw new Error(`Mock environment files missing: ${missing.join(", ")}`);
  }

  const servers: StartedFixtureServer[] = [];
  try {
    for (const dataPath of dataPaths) {
      servers.push(await startFixtureServer(dataPath));
    }
  } catch (err) {
    await Promise.allSettled(servers.map((server) => server.stop()));
    throw err;
  }
  const portMap = Object.fromEntries(
    envs.map((e, i) => [e, servers[i].port]),
  ) as Record<MockEnvironmentName, number>;
  const baseUrls = Object.fromEntries(
    envs.map((e, i) => [e, servers[i].baseUrl]),
  ) as Record<MockEnvironmentName, string>;

  return {
    portMap,
    baseUrls,
    envVars: envVarsFor(envs, baseUrls),
    requestLedger: () =>
      servers.flatMap((server) =>
        server.requests.map((entry) => ({ ...entry })),
      ),
    clearRequestLedger: () => {
      for (const server of servers) {
        server.clearRequests();
      }
    },
    stop: async () => {
      await Promise.all(servers.map((server) => server.stop()));
    },
  };
}
