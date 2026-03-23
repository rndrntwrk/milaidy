import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import puppeteer, {
  type Browser,
  type Page,
} from "puppeteer-core";

const envPath = path.resolve(import.meta.dirname, "..", "..", "..", "..", ".env");
try {
  const { config } = await import("dotenv");
  config({ path: envPath });
} catch {
  // Keys may already be present in process.env.
}

const DEFAULT_UI_URL = stripTrailingSlash(
  process.env.MILADY_LIVE_UI_URL ??
    process.env.MILADY_UI_URL ??
    "http://localhost:2138",
);
const API_URL = stripTrailingSlash(
  process.env.MILADY_LIVE_API_URL ??
    process.env.MILADY_API_URL ??
    "http://127.0.0.1:31337",
);
const API_TOKEN =
  process.env.MILADY_API_TOKEN?.trim() ??
  process.env.ELIZA_API_TOKEN?.trim() ??
  "";
const GROQ_API_KEY = process.env.GROQ_API_KEY?.trim() ?? "";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY?.trim() ?? "";
const CHROME_PATH =
  process.env.MILADY_CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const LIVE_TESTS_ENABLED = process.env.MILADY_LIVE_TEST === "1";
const CAN_RUN =
  LIVE_TESTS_ENABLED &&
  GROQ_API_KEY.length > 0 &&
  ELEVENLABS_API_KEY.length > 0;
const PROFILE_FILTER = new Set(
  (process.env.MILADY_LIVE_PROFILE ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

const EXPECTED_CHEN_GREETING = "you good?";
const EXPECTED_SARAH_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";
const KNOWLEDGE_CODEWORD = "VELVET-MOON-4821";
const QA_ARTIFACT_DIR = path.join(os.tmpdir(), "milady-live-qa");

type QaFetchRecord = {
  url: string;
  method: string;
  status?: number;
  error?: string;
};

type QaVoiceStats = {
  audioStarts: number;
  speechCalls: number;
  ttsFetches: QaFetchRecord[];
};

type Profile = {
  id: "desktop" | "mobile";
  label: string;
  viewport: {
    width: number;
    height: number;
    deviceScaleFactor: number;
    isMobile: boolean;
    hasTouch: boolean;
  };
  userAgent?: string;
};

const PROFILES: Profile[] = [
  {
    id: "desktop",
    label: "Desktop",
    viewport: {
      width: 1440,
      height: 980,
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    },
  },
  {
    id: "mobile",
    label: "Mobile",
    viewport: {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1",
  },
];
const ACTIVE_PROFILES =
  PROFILE_FILTER.size > 0
    ? PROFILES.filter((profile) => PROFILE_FILTER.has(profile.id))
    : PROFILES;

let browser: Browser | null = null;
let UI_URL = DEFAULT_UI_URL;

describe.skipIf(!CAN_RUN)("Live QA checklist", () => {
  beforeAll(async () => {
    if (!CAN_RUN) return;
    await fs.mkdir(QA_ARTIFACT_DIR, { recursive: true });
    UI_URL = await resolveLiveUiUrl();
    await ensureHttpOk(`${UI_URL}/`);
    await ensureHttpOk(`${API_URL}/api/status`);
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      protocolTimeout: 120_000,
      args: [
        "--autoplay-policy=no-user-gesture-required",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--use-angle=swiftshader",
      ],
    });
  }, 120_000);

  afterAll(async () => {
    if (!CAN_RUN) return;
    await browser?.close();
  }, 30_000);

  for (const profile of ACTIVE_PROFILES) {
    it(
      `${profile.label}: completes the real QA checklist`,
      async () => {
        const activeBrowser = ensureBrowser(browser);
        const context = await activeBrowser.createBrowserContext();
        const origin = new URL(UI_URL).origin;
        await context.overridePermissions(origin, ["camera", "microphone"]);

        const page = await context.newPage();
        await page.setViewport(profile.viewport);
        if (profile.userAgent) {
          await page.setUserAgent(profile.userAgent);
        }
        page.setDefaultTimeout(45_000);
        page.setDefaultNavigationTimeout(60_000);

        const pageErrors: string[] = [];
        const sameOriginFailures: string[] = [];
        page.on("pageerror", (error) => {
          pageErrors.push(error.message);
        });
        page.on("requestfailed", (request) => {
          const url = request.url();
          if (
            url.startsWith(UI_URL) ||
            url.startsWith(API_URL) ||
            url.startsWith(new URL(UI_URL).origin)
          ) {
            sameOriginFailures.push(
              `${request.method()} ${url} (${request.failure()?.errorText ?? "requestfailed"})`,
            );
          }
        });
        page.on("dialog", async (dialog) => {
          await dialog.accept();
        });

        await installQaInstrumentation(page);
        await resetAgentViaApi();

        const knowledgeFile = await writeKnowledgeFile(profile.id);
        try {
          await navigate(page, `${UI_URL}/`);

          await waitForText(page, "Get Started");
          await clickByText(page, "Get Started");
          await clickByText(page, "Local");
          await clickByText(page, "Groq");
          await typeInto(page, 'input[type="password"]', GROQ_API_KEY);
          await clickByText(page, "Confirm");
          await clickByText(page, "Continue");
          await clickByText(page, "Enter");

          await waitFor(async () => {
            return page.url().endsWith("/character-select") ? true : null;
          }, 180_000, 1000);

          await waitForText(page, "Chen", 60_000);
          expect(await onboardingComplete()).toBe(true);

          const voiceConfig = await waitFor(async () => {
            const config = await apiJson<Record<string, any>>("/api/config");
            const tts = config?.messages?.tts;
            return tts?.provider === "elevenlabs" ? tts : null;
          }, 60_000);
          expect(voiceConfig.elevenlabs?.voiceId).toBe(EXPECTED_SARAH_VOICE_ID);

          await clickSelector(page, '[data-testid="ui-shell-toggle-companion"]');
          await page.waitForFunction(
            () => window.location.pathname.endsWith("/companion"),
            { timeout: 30_000 },
          );
          await page.evaluate(() => {
            window.dispatchEvent(new Event("eliza:vrm-teleport-complete"));
          });
          await page.waitForSelector('[data-testid="chat-composer-textarea"]');
          await page.mouse.click(24, 24);

          const conversationsBefore = await listConversations();
          const greetingVoiceSignals = await qaVoiceSignalCount(page);
          await clickSelector(page, 'button[aria-label="New Chat"]');

          const activeConversation = await waitFor(async () => {
            const conversations = await listConversations();
            return conversations.length === conversationsBefore.length + 1
              ? conversations[0]
              : null;
          }, 30_000);

          const greetingMessage = await waitFor(async () => {
            const messages = await listMessages(activeConversation.id);
            return messages.find((message) => message.role === "assistant") ?? null;
          }, 30_000);

          expect(normalizeText(greetingMessage.text)).toContain(
            normalizeText(EXPECTED_CHEN_GREETING),
          );
          await waitFor(async () => {
            return (await qaVoiceSignalCount(page)) > greetingVoiceSignals;
          }, 45_000);
          await waitForText(page, greetingMessage.text);

          const responseVoiceSignals = await qaVoiceSignalCount(page);
          await typeComposerAndSend(
            page,
            "what is 2+2? answer with only the number 4",
          );

          const mathReply = await waitFor(async () => {
            const messages = await listMessages(activeConversation.id);
            const assistants = messages.filter((message) => message.role === "assistant");
            if (assistants.length < 2) return null;
            const latest = assistants[assistants.length - 1];
            return latest.text !== greetingMessage.text ? latest : null;
          }, 90_000);

          expect(mathReply.text).toMatch(/\b4\b/);
          await waitFor(async () => {
            return (await qaVoiceSignalCount(page)) > responseVoiceSignals;
          }, 45_000);

          await apiJson("/api/trajectories/config", {
            method: "PUT",
            body: JSON.stringify({ enabled: true }),
          });

          await clickSelector(page, '[data-testid="ui-shell-toggle-desktop"]');
          await navigate(page, `${UI_URL}/knowledge`);
          await waitForText(page, "Choose Files");

          const uploadInput = await page.waitForSelector('input[type="file"]');
          expect(uploadInput).toBeTruthy();
          await uploadInput!.uploadFile(knowledgeFile);

          const uploadedDocument = await waitFor(async () => {
            const docs = await listKnowledgeDocuments();
            return (
              docs.find((document) =>
                document.filename === path.basename(knowledgeFile),
              ) ?? null
            );
          }, 120_000, 2000);

          expect(uploadedDocument.filename).toBe(path.basename(knowledgeFile));
          await waitForText(page, path.basename(knowledgeFile), 120_000);

          await waitFor(async () => {
            const results = await knowledgeSearch("qa codeword");
            return results.some((result) =>
              String(result.text ?? "")
                .toUpperCase()
                .includes(KNOWLEDGE_CODEWORD),
            );
          }, 120_000, 2000);

          await navigate(page, `${UI_URL}/chat`);
          await page.waitForSelector('[data-testid="chat-composer-textarea"]');
          await typeComposerAndSend(
            page,
            "what is the qa codeword from the uploaded file? answer with only the codeword",
          );

          const knowledgeReply = await waitFor(async () => {
            const messages = await listMessages(activeConversation.id);
            return (
              [...messages]
                .reverse()
                .find(
                  (message) =>
                    message.role === "assistant" &&
                    String(message.text ?? "")
                      .toUpperCase()
                      .includes(KNOWLEDGE_CODEWORD),
                ) ?? null
            );
          }, 90_000);
          expect(knowledgeReply.text.toUpperCase()).toContain(KNOWLEDGE_CODEWORD);

          const matchingTrajectory = await waitFor(async () => {
            const list = await apiJson<{ trajectories: Array<{ id: string }> }>(
              "/api/trajectories?limit=20",
            );
            for (const trajectory of list.trajectories ?? []) {
              const detail = await apiJson<Record<string, any>>(
                `/api/trajectories/${encodeURIComponent(trajectory.id)}`,
              );
              const match = (detail.llmCalls ?? []).find((call: Record<string, any>) => {
                const prompt = String(call.userPrompt ?? "").toLowerCase();
                return prompt.includes("qa codeword from the uploaded file");
              });
              if (match) {
                return { detail, match };
              }
            }
            return null;
          }, 90_000, 2000);

          expect(String(matchingTrajectory.match.userPrompt)).toContain(
            "qa codeword from the uploaded file",
          );
          expect(String(matchingTrajectory.match.response).toUpperCase()).toContain(
            KNOWLEDGE_CODEWORD,
          );

          await navigate(page, `${UI_URL}/trajectories`);
          await page.waitForSelector('[data-testid="trajectories-view"]');
          await typeInto(
            page,
            '[data-testid="trajectories-view"] input[type="text"]',
            "qa codeword from the uploaded file",
          );
          await page.waitForSelector('[data-testid="trajectories-view"] tbody tr');
          await clickSelector(page, '[data-testid="trajectories-view"] tbody tr');
          await waitForText(page, "qa codeword from the uploaded file", 30_000);
          await waitForText(page, KNOWLEDGE_CODEWORD, 30_000);

          await smokeTabs(page, profile);

          await navigate(page, `${UI_URL}/settings`);
          await waitForText(page, "Reset Agent");
          await clickByText(page, "Reset Everything");
          await waitForText(page, "Get Started", 180_000);

          expect(await onboardingComplete()).toBe(false);
          expect((await listConversations()).length).toBe(0);
          expect((await listKnowledgeDocumentsAfterReset()).length).toBe(0);
          await saveScreenshot(page, profile, "reset-to-onboarding");

          expect(pageErrors).toEqual([]);
          expect(sameOriginFailures).toEqual([]);
        } catch (error) {
          await saveFailureArtifacts(page, profile, error);
          throw error;
        } finally {
          await fs.rm(knowledgeFile, { force: true });
          await context.close();
        }
      },
      600_000,
    );
  }
});

async function smokeTabs(page: Page, profile: Profile) {
  const tabChecks: Array<{
    path: string;
    name: string;
    waitForReady: () => Promise<void>;
  }> = [
    {
      path: "/chat",
      name: "chat",
      waitForReady: () => page.waitForSelector('[data-testid="chat-messages-scroll"]'),
    },
    {
      path: "/stream",
      name: "stream",
      waitForReady: () => waitForText(page, "Go Live", 30_000),
    },
    {
      path: "/wallets",
      name: "wallets",
      waitForReady: () => waitForText(page, "Tokens", 30_000),
    },
    {
      path: "/connectors",
      name: "connectors",
      waitForReady: () => page.waitForSelector('[data-testid="connectors-settings-sidebar"]'),
    },
    {
      path: "/settings",
      name: "settings",
      waitForReady: () => waitForText(page, "Reset Agent", 30_000),
    },
    {
      path: "/triggers",
      name: "triggers",
      waitForReady: () => waitForText(page, "Display Name", 30_000),
    },
    {
      path: "/plugins",
      name: "plugins",
      waitForReady: () => page.waitForSelector('[data-testid="plugins-subgroup-sidebar"]'),
    },
    {
      path: "/skills",
      name: "skills",
      waitForReady: () => waitForText(page, "Create Skill", 30_000),
    },
    {
      path: "/runtime",
      name: "runtime",
      waitForReady: () => page.waitForSelector('[data-testid="runtime-view"]'),
    },
    {
      path: "/database",
      name: "database",
      waitForReady: () => waitForText(page, "Vectors", 30_000),
    },
    {
      path: "/desktop",
      name: "desktop",
      waitForReady: () => waitForText(page, "Refresh Diagnostics", 30_000),
    },
    {
      path: "/logs",
      name: "logs",
      waitForReady: () => waitForText(page, "Search logs", 30_000),
    },
  ];

  for (const tab of tabChecks) {
    await navigate(page, `${UI_URL}${tab.path}`);
    await tab.waitForReady();
    await saveScreenshot(page, profile, `tab-${tab.name}`);
  }
}

async function installQaInstrumentation(page: Page) {
  await page.evaluateOnNewDocument(() => {
    const qaWindow = window as typeof window & {
      __qaAudioStarts?: Array<{ at: number }>;
      __qaFetches?: QaFetchRecord[];
      __qaSpeechCalls?: Array<{ text: string; at: number }>;
    };

    qaWindow.__qaAudioStarts = [];
    qaWindow.__qaFetches = [];
    qaWindow.__qaSpeechCalls = [];

    const OriginalAudioContext =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (OriginalAudioContext) {
      const originalCreateBufferSource =
        OriginalAudioContext.prototype.createBufferSource;
      OriginalAudioContext.prototype.createBufferSource = function patched() {
        const source = originalCreateBufferSource.call(this);
        const originalStart = source.start.bind(source);
        source.start = (...args: Parameters<AudioBufferSourceNode["start"]>) => {
          qaWindow.__qaAudioStarts?.push({ at: Date.now() });
          return originalStart(...args);
        };
        return source;
      };
    }

    if (window.speechSynthesis?.speak) {
      const originalSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);
      window.speechSynthesis.speak = (utterance: SpeechSynthesisUtterance) => {
        qaWindow.__qaSpeechCalls?.push({
          text: utterance.text,
          at: Date.now(),
        });
        return originalSpeak(utterance);
      };
    }

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const input = args[0];
      const init = args[1];
      const requestUrl =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method =
        init?.method ||
        (input instanceof Request ? input.method : undefined) ||
        "GET";

      try {
        const response = await originalFetch(...args);
        qaWindow.__qaFetches?.push({
          url: requestUrl,
          method: method.toUpperCase(),
          status: response.status,
        });
        return response;
      } catch (error) {
        qaWindow.__qaFetches?.push({
          url: requestUrl,
          method: method.toUpperCase(),
          error: String(error),
        });
        throw error;
      }
    };
  });
}

async function qaVoiceStats(page: Page): Promise<QaVoiceStats> {
  return page.evaluate(() => {
    const qaWindow = window as typeof window & {
      __qaAudioStarts?: Array<{ at: number }>;
      __qaSpeechCalls?: Array<{ text: string; at: number }>;
      __qaFetches?: QaFetchRecord[];
    };

    const ttsFetches = (qaWindow.__qaFetches ?? []).filter((record) => {
      const url = String(record.url ?? "");
      return (
        url.includes("/api/tts/") ||
        url.includes("/api/stream/voice/speak") ||
        url.includes("api.elevenlabs.io")
      );
    });

    return {
      audioStarts: qaWindow.__qaAudioStarts?.length ?? 0,
      speechCalls: qaWindow.__qaSpeechCalls?.length ?? 0,
      ttsFetches,
    };
  });
}

async function qaVoiceSignalCount(page: Page): Promise<number> {
  const stats = await qaVoiceStats(page);
  return stats.audioStarts + stats.speechCalls + stats.ttsFetches.length;
}

async function waitForText(page: Page, text: string, timeout = 45_000) {
  await waitFor(async () => {
    const bodyText = await page.evaluate(() => {
      const body = document.body;
      return body?.textContent ?? body?.innerText ?? "";
    });
    return bodyText.toLowerCase().includes(text.toLowerCase()) ? true : null;
  }, timeout);
}

async function clickByText(page: Page, text: string) {
  await page.waitForFunction(
    (expected) => {
      const normalizedExpected = String(expected).toLowerCase();
      return Array.from(
        document.querySelectorAll<HTMLElement>("button,[role='button']"),
      ).some((element) => {
        const visible = element.offsetParent !== null;
        const label = (element.innerText ?? "").toLowerCase();
        return visible && label.includes(normalizedExpected);
      });
    },
    { timeout: 45_000 },
    text,
  );

  const clicked = await page.evaluate((expected) => {
    const normalizedExpected = String(expected).toLowerCase();
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>("button,[role='button']"),
    );
    const target = elements.find((element) => {
      const visible = element.offsetParent !== null;
      const label = (element.innerText ?? "").toLowerCase();
      return visible && label.includes(normalizedExpected);
    });
    target?.click();
    return Boolean(target);
  }, text);
  expect(clicked).toBe(true);
}

async function clickSelector(page: Page, selector: string) {
  await page.waitForFunction(
    (expected) => {
      const element = document.querySelector(expected);
      if (!(element instanceof HTMLElement)) return false;
      return (
        element.offsetParent !== null ||
        window.getComputedStyle(element).position === "fixed"
      );
    },
    { timeout: 45_000 },
    selector,
  );
  const clicked = await page.evaluate((expected) => {
    const element = document.querySelector(expected);
    if (!(element instanceof HTMLElement)) return false;
    element.click();
    return true;
  }, selector);
  expect(clicked).toBe(true);
}

async function typeInto(page: Page, selector: string, value: string) {
  const input = await page.waitForSelector(selector, { visible: true });
  expect(input).toBeTruthy();
  await input!.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  await input!.type(value, { delay: 5 });
}

async function typeComposerAndSend(page: Page, value: string) {
  await typeInto(page, '[data-testid="chat-composer-textarea"]', value);
  await page.keyboard.press("Enter");
}

async function writeKnowledgeFile(profileId: string): Promise<string> {
  const filename = `milady-qa-knowledge-${profileId}.txt`;
  const fullPath = path.join(os.tmpdir(), filename);
  await fs.writeFile(
    fullPath,
    [
      "Milady QA knowledge fixture.",
      `The QA codeword is ${KNOWLEDGE_CODEWORD}.`,
      "If asked for the QA codeword, answer with only the codeword.",
    ].join("\n"),
    "utf8",
  );
  return fullPath;
}

async function onboardingComplete(): Promise<boolean> {
  const result = await apiJson<{ complete: boolean }>("/api/onboarding/status");
  return result.complete;
}

async function resetAgentViaApi() {
  await apiJson("/api/agent/reset", { method: "POST" });
  await waitFor(async () => !(await onboardingComplete()), 30_000);
  const conversations = await listConversations();
  const documents = await listKnowledgeDocumentsAfterReset();
  if (conversations.length > 0 || documents.length > 0) {
    throw new Error(
      `Reset API left persisted state behind (conversations=${conversations.length}, knowledge=${documents.length}). Hard runtime restart required before live QA.`,
    );
  }
}

async function listConversations(): Promise<Array<{ id: string }>> {
  const result = await apiJson<{ conversations: Array<{ id: string }> }>(
    "/api/conversations",
  );
  return result.conversations ?? [];
}

async function listMessages(
  conversationId: string,
): Promise<Array<{ role: string; text: string }>> {
  const result = await apiJson<{ messages: Array<{ role: string; text: string }> }>(
    `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
  );
  return result.messages ?? [];
}

async function listKnowledgeDocuments(): Promise<Array<{ filename: string }>> {
  const result = await apiJson<{ documents: Array<{ filename: string }> }>(
    "/api/knowledge/documents",
  );
  return result.documents ?? [];
}

async function listKnowledgeDocumentsAfterReset(): Promise<
  Array<{ filename: string }>
> {
  try {
    return await listKnowledgeDocuments();
  } catch (error) {
    if (
      !(await onboardingComplete()) ||
      (error instanceof Error &&
        /^(404|500)\b/.test(error.message))
    ) {
      return [];
    }
    throw error;
  }
}

async function knowledgeSearch(query: string): Promise<Array<{ text: string }>> {
  const encoded = encodeURIComponent(query);
  const result = await apiJson<{ results: Array<{ text: string }> }>(
    `/api/knowledge/search?q=${encoded}&threshold=0.1&limit=5`,
  );
  return result.results ?? [];
}

async function apiJson<T>(
  pathname: string,
  init?: RequestInit,
): Promise<T> {
  const url = new URL(pathname, API_URL);
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  if (API_TOKEN) {
    headers.set("Authorization", `Bearer ${API_TOKEN}`);
  }
  const response = await fetch(url, {
    ...init,
    headers,
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url.pathname}`);
  }
  return (await response.json()) as T;
}

async function ensureHttpOk(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Expected ${url} to be reachable, got ${response.status}`);
  }
}

async function isHttpOk(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function resolveLiveUiUrl(): Promise<string> {
  if (await isHttpOk(`${DEFAULT_UI_URL}/`)) {
    return DEFAULT_UI_URL;
  }

  const candidates: string[] = [];

  try {
    const stack = await apiJson<{
      desktop?: {
        rendererUrl?: string | null;
        uiPort?: number | null;
      };
      desktopDevLog?: {
        filePath?: string | null;
      };
    }>("/api/dev/stack");

    if (stack.desktop?.rendererUrl) {
      candidates.push(stripTrailingSlash(stack.desktop.rendererUrl));
    }

    if (typeof stack.desktop?.uiPort === "number" && stack.desktop.uiPort > 0) {
      candidates.push(`http://127.0.0.1:${stack.desktop.uiPort}`);
      candidates.push(`http://localhost:${stack.desktop.uiPort}`);
    }

    const devLogPath = stack.desktopDevLog?.filePath?.trim();
    if (devLogPath) {
      const logContent = await fs.readFile(devLogPath, "utf8");
      const rendererMatches = logContent.match(
        /https?:\/\/(?:127\.0\.0\.1|localhost):\d+/g,
      );
      if (rendererMatches) {
        candidates.push(...rendererMatches.map(stripTrailingSlash));
      }
    }
  } catch {
    // Fall back to static guesses below.
  }

  candidates.push("http://127.0.0.1:5174", "http://localhost:5174");

  const uniqueCandidates = [...new Set(candidates)];
  for (const candidate of uniqueCandidates) {
    if (await isHttpOk(`${candidate}/`)) {
      return candidate;
    }
  }

  throw new Error(
    `Unable to resolve live UI URL. Tried: ${[DEFAULT_UI_URL, ...uniqueCandidates].join(", ")}`,
  );
}

async function navigate(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.readyState !== "loading", {
    timeout: 30_000,
  });
}

async function saveScreenshot(page: Page, profile: Profile, step: string) {
  const filename = path.join(QA_ARTIFACT_DIR, `${profile.id}-${step}.png`);
  try {
    await page.screenshot({ path: filename, fullPage: true });
  } catch (error) {
    const noteFile = path.join(QA_ARTIFACT_DIR, `${profile.id}-${step}.txt`);
    await fs.writeFile(
      noteFile,
      `Screenshot unavailable: ${error instanceof Error ? error.message : String(error)}\n`,
      "utf8",
    );
  }
}

async function saveFailureArtifacts(
  page: Page,
  profile: Profile,
  error: unknown,
) {
  await saveScreenshot(page, profile, "failure");
  const textFile = path.join(QA_ARTIFACT_DIR, `${profile.id}-failure-state.txt`);

  let url = "unavailable";
  let title = "unavailable";
  let bodyText = "unavailable";
  let voiceStatsSummary = "unavailable";

  try {
    url = page.url();
  } catch {}

  try {
    title = await page.title();
  } catch {}

  try {
    bodyText = await page.evaluate(() => document.body.innerText.slice(0, 10_000));
  } catch (pageError) {
    bodyText = `Unavailable: ${pageError instanceof Error ? pageError.message : String(pageError)}`;
  }

  try {
    const voiceStats = await qaVoiceStats(page);
    voiceStatsSummary = JSON.stringify(voiceStats, null, 2);
  } catch (statsError) {
    voiceStatsSummary = `Unavailable: ${statsError instanceof Error ? statsError.message : String(statsError)}`;
  }

  await fs.writeFile(
    textFile,
    [
      `Error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
      `URL: ${url}`,
      `Title: ${title}`,
      "",
      "Voice stats:",
      voiceStatsSummary,
      "",
      bodyText,
    ].join("\n"),
    "utf8",
  );
}

async function waitFor<T>(
  producer: () => Promise<T | null | false> | T | null | false,
  timeoutMs: number,
  intervalMs = 500,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const result = await producer();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Timed out after ${timeoutMs}ms`);
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function ensureBrowser(value: Browser | null): Browser {
  if (!value) {
    throw new Error("Browser was not started");
  }
  return value;
}
