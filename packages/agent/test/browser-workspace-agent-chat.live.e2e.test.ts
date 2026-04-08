import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { AgentRuntime, createCharacter, type Plugin } from "@elizaos/core";
import pluginSql from "@elizaos/plugin-sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { miladyBrowserPlugin } from "../../../plugins/plugin-milady-browser/src/index";
import {
  createConversation,
  postConversationMessage,
} from "../../../test/helpers/http";
import { withTimeout } from "../../../test/helpers/test-utils";
import { startApiServer } from "../src/api/server";
import {
  closeBrowserWorkspaceTab,
  listBrowserWorkspaceTabs,
} from "../src/services/browser-workspace";
import { extractPlugin, type PluginModuleShape } from "../src/test-support/test-helpers";

const LIVE_TESTS_ENABLED =
  process.env.MILADY_LIVE_TEST === "1" || process.env.ELIZA_LIVE_TEST === "1";

try {
  const { config } = await import("dotenv");
  config({ path: path.resolve(import.meta.dirname, "..", "..", "..", ".env") });
  config({ path: path.resolve(import.meta.dirname, "..", "..", "..", "..", ".env") });
} catch {
  // dotenv is optional for live tests.
}

type LiveProviderSelection = {
  env: Record<string, string>;
  name: "anthropic" | "google" | "groq" | "openai" | "openrouter";
  pluginSpecifier: string;
};

function selectLiveProvider(): LiveProviderSelection | null {
  const candidates: LiveProviderSelection[] = [
    {
      name: "openai",
      pluginSpecifier: "@elizaos/plugin-openai",
      env: process.env.OPENAI_API_KEY?.trim()
        ? {
            OPENAI_API_KEY: process.env.OPENAI_API_KEY.trim(),
            ...(process.env.OPENAI_BASE_URL?.trim()
              ? { OPENAI_BASE_URL: process.env.OPENAI_BASE_URL.trim() }
              : {}),
          }
        : {},
    },
    {
      name: "anthropic",
      pluginSpecifier: "@elizaos/plugin-anthropic",
      env: process.env.ANTHROPIC_API_KEY?.trim()
        ? { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY.trim() }
        : {},
    },
    {
      name: "groq",
      pluginSpecifier: "@elizaos/plugin-groq",
      env: process.env.GROQ_API_KEY?.trim()
        ? {
            GROQ_API_KEY: process.env.GROQ_API_KEY.trim(),
            ...(process.env.GROQ_SMALL_MODEL?.trim()
              ? { GROQ_SMALL_MODEL: process.env.GROQ_SMALL_MODEL.trim() }
              : {}),
            ...(process.env.GROQ_LARGE_MODEL?.trim()
              ? { GROQ_LARGE_MODEL: process.env.GROQ_LARGE_MODEL.trim() }
              : {}),
          }
        : {},
    },
    {
      name: "openrouter",
      pluginSpecifier: "@elizaos/plugin-openrouter",
      env: process.env.OPENROUTER_API_KEY?.trim()
        ? { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY.trim() }
        : {},
    },
    {
      name: "google",
      pluginSpecifier: "@elizaos/plugin-google-genai",
      env:
        process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
        process.env.GOOGLE_API_KEY?.trim()
          ? {
              ...(process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()
                ? {
                    GOOGLE_GENERATIVE_AI_API_KEY:
                      process.env.GOOGLE_GENERATIVE_AI_API_KEY.trim(),
                  }
                : {}),
              ...(process.env.GOOGLE_API_KEY?.trim()
                ? { GOOGLE_API_KEY: process.env.GOOGLE_API_KEY.trim() }
                : {}),
            }
          : {},
    },
  ];

  return candidates.find((candidate) => Object.keys(candidate.env).length > 0) ?? null;
}

const selectedProvider = selectLiveProvider();

async function loadSelectedProviderPlugin(): Promise<Plugin | null> {
  if (!selectedProvider) {
    return null;
  }
  const mod = (await import(
    selectedProvider.pluginSpecifier
  )) as PluginModuleShape;
  return extractPlugin(mod) as Plugin | null;
}

type LocalSiteFixture = {
  formUrl: string;
  welcomeUrl: string;
  close: () => Promise<void>;
};

async function startLocalSiteFixture(): Promise<LocalSiteFixture> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (url.pathname === "/welcome") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html>
        <html lang="en">
          <head><meta charset="utf-8" /><title>Welcome Fixture</title></head>
          <body>
            <h1>Welcome, ${url.searchParams.get("name") || "Anonymous"}</h1>
            <p>Browser live validation complete.</p>
          </body>
        </html>`);
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html>
      <html lang="en">
        <head><meta charset="utf-8" /><title>Browser Form Fixture</title></head>
        <body>
          <h1>Browser Form Fixture</h1>
          <form action="/welcome" method="get">
            <label>Agent name <input name="name" value="" /></label>
            <button type="submit">Continue</button>
          </form>
        </body>
      </html>`);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    formUrl: `${baseUrl}/form`,
    welcomeUrl: `${baseUrl}/welcome?name=Milady`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

describe.skipIf(!LIVE_TESTS_ENABLED || !selectedProvider)(
  "Browser workspace live chat E2E",
  () => {
    let runtime: AgentRuntime;
    let apiServer: { port: number; close: () => Promise<void> };
    let siteFixture: LocalSiteFixture;
    let previousPgliteDataDir: string | undefined;
    let pgliteDir = "";

    beforeAll(async () => {
      previousPgliteDataDir = process.env.PGLITE_DATA_DIR;
      pgliteDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "milady-browser-live-agent-"),
      );
      process.env.PGLITE_DATA_DIR = pgliteDir;

      siteFixture = await startLocalSiteFixture();
      const providerPlugin = await loadSelectedProviderPlugin();
      if (!providerPlugin) {
        throw new Error("Could not load the selected live model provider plugin.");
      }

      const settings: Record<string, unknown> = {
        secrets: selectedProvider?.env ?? {},
      };
      if (selectedProvider?.env.OPENAI_BASE_URL) {
        settings.OPENAI_BASE_URL = selectedProvider.env.OPENAI_BASE_URL;
      }
      if (selectedProvider?.env.GROQ_SMALL_MODEL) {
        settings.GROQ_SMALL_MODEL = selectedProvider.env.GROQ_SMALL_MODEL;
      }
      if (selectedProvider?.env.GROQ_LARGE_MODEL) {
        settings.GROQ_LARGE_MODEL = selectedProvider.env.GROQ_LARGE_MODEL;
      }

      runtime = new AgentRuntime({
        character: createCharacter({
          name: "BrowserLiveAgent",
          system:
            "You validate the Milady browser workspace. When a browser task needs multiple steps, call MANAGE_MILADY_BROWSER_WORKSPACE once with subaction=batch and explicit stepsJson. Use the exact selectors and values the user provides.",
          settings,
        }),
        plugins: [miladyBrowserPlugin, providerPlugin],
        logLevel: "error",
        enableAutonomy: false,
      });

      await runtime.registerPlugin(pluginSql);
      if (runtime.adapter && !(await runtime.adapter.isReady())) {
        await runtime.adapter.init();
      }
      await runtime.initialize();
      runtime.setSetting("CONTINUE_AFTER_ACTIONS", "false");
      runtime.setSetting("USE_MULTI_STEP", "false");

      apiServer = await startApiServer({ port: 0, runtime });
    }, 180_000);

    afterAll(async () => {
      if (apiServer) {
        await apiServer.close();
      }
      if (runtime) {
        await withTimeout(runtime.stop(), 60_000, "runtime.stop()");
      }
      if (siteFixture) {
        await siteFixture.close();
      }
      if (pgliteDir) {
        fs.rmSync(pgliteDir, { recursive: true, force: true });
      }
      if (previousPgliteDataDir === undefined) {
        delete process.env.PGLITE_DATA_DIR;
      } else {
        process.env.PGLITE_DATA_DIR = previousPgliteDataDir;
      }
    });

    it(
      "uses a real LLM to generate a browser batch that completes a real page task",
      async () => {
        const tabs = await listBrowserWorkspaceTabs();
        await Promise.all(tabs.map((tab) => closeBrowserWorkspaceTab(tab.id)));

        const { conversationId } = await createConversation(apiServer.port, {
          includeGreeting: false,
          title: "Browser live validation",
        });

        const response = await postConversationMessage(
          apiServer.port,
          conversationId,
          {
            text: `Use the Milady browser workspace to complete this exact browser task with a single MANAGE_MILADY_BROWSER_WORKSPACE batch call: open ${siteFixture.formUrl} visibly, fill selector input[name="name"] with value Milady, click selector button[type="submit"], then read selector h1 with getMode text and tell me the exact result.`,
          },
        );

        expect(response.status).toBe(200);
        expect(response.data.text).toEqual(
          expect.stringContaining("Completed 4 browser subactions"),
        );
        expect(response.data.text).toEqual(
          expect.stringContaining("Welcome, Milady"),
        );

        const remainingTabs = await listBrowserWorkspaceTabs();
        expect(remainingTabs).toHaveLength(1);
        expect(remainingTabs[0]?.url).toBe(siteFixture.welcomeUrl);
      },
      180_000,
    );
  },
);
