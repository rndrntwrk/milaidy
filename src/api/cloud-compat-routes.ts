/**
 * Cloud Compat proxy routes — forwards /api/cloud/compat/* to Eliza Cloud v2's
 * /api/compat/* endpoints, injecting the stored API key for authentication.
 *
 * These routes let the frontend consume cloud agent management, status, logs,
 * and availability data without needing to know the cloud base URL or API key.
 */

import type http from "node:http";
import { logger } from "@elizaos/core";
import { validateCloudBaseUrl } from "../cloud/validate-url";
import type { MiladyConfig } from "../config/config";
import { sendJson, sendJsonError } from "./http-helpers";

export interface CloudCompatRouteState {
  config: MiladyConfig;
}

const PROXY_TIMEOUT_MS = 15_000;

/**
 * Resolve the Eliza Cloud base URL from config (without trailing slashes).
 */
function resolveCloudBaseUrl(config: MiladyConfig): string {
  return (config.cloud?.baseUrl ?? "https://www.elizacloud.ai")
    .trim()
    .replace(/\/+$/, "");
}

/**
 * Returns true if the request was handled, false if path didn't match.
 */
export async function handleCloudCompatRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  state: CloudCompatRouteState,
): Promise<boolean> {
  // Only handle /api/cloud/compat/* routes
  if (!pathname.startsWith("/api/cloud/compat/")) return false;

  const apiKey = state.config.cloud?.apiKey?.trim();
  if (!apiKey) {
    sendJsonError(res, "Not connected to Milady Cloud. Please log in first.", 401);
    return true;
  }

  const baseUrl = resolveCloudBaseUrl(state.config);
  const urlError = await validateCloudBaseUrl(baseUrl);
  if (urlError) {
    sendJsonError(res, urlError, 502);
    return true;
  }

  // Strip /api/cloud prefix to get the compat path
  // /api/cloud/compat/agents → /api/compat/agents
  const compatPath = pathname.replace("/api/cloud", "");

  // Forward query string if present
  const fullUrl = req.url ?? pathname;
  const qsIndex = fullUrl.indexOf("?");
  const queryString = qsIndex >= 0 ? fullUrl.slice(qsIndex) : "";

  const upstreamUrl = `${baseUrl}${compatPath}${queryString}`;

  try {
    // Read request body for non-GET methods
    let body: string | undefined;
    if (method !== "GET" && method !== "HEAD") {
      body = await new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        req.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 1_048_576) {
            reject(new Error("Request body too large"));
            return;
          }
          chunks.push(chunk);
        });
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        req.on("error", reject);
      });
    }

    const upstreamRes = await fetch(upstreamUrl, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: body || undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });

    if (upstreamRes.status >= 300 && upstreamRes.status < 400) {
      sendJsonError(
        res,
        "Milady Cloud request was redirected; redirects are not allowed",
        502,
      );
      return true;
    }

    const responseData = await upstreamRes.json().catch(() => ({
      success: false,
      error: `HTTP ${upstreamRes.status}`,
    }));

    sendJson(res, responseData, upstreamRes.status);
    return true;
  } catch (err) {
    const isTimeout =
      err instanceof Error &&
      (err.name === "TimeoutError" ||
        err.name === "AbortError" ||
        err.message.toLowerCase().includes("timeout"));

    if (isTimeout) {
      logger.warn(`[cloud-compat] Upstream request timed out: ${compatPath}`);
      sendJsonError(res, "Milady Cloud request timed out", 504);
    } else {
      logger.warn(
        `[cloud-compat] Upstream request failed: ${compatPath} — ${err instanceof Error ? err.message : String(err)}`,
      );
      sendJsonError(res, "Failed to reach Milady Cloud", 502);
    }
    return true;
  }
}
