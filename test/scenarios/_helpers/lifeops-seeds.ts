import type { IAgentRuntime } from "@elizaos/core";
import type {
  ScenarioCheckResult,
  ScenarioContext,
} from "@elizaos/scenario-schema";
import {
  recordBrowserFocusWindow,
  recordBrowserSessionRegistration,
} from "../../../eliza/apps/app-lifeops/src/lifeops/browser-extension-store.ts";
import {
  type LifeOpsMeetingPreferencesPatch,
  updateLifeOpsMeetingPreferences,
} from "../../../eliza/apps/app-lifeops/src/lifeops/owner-profile.ts";
import {
  createLifeOpsCalendarSyncState,
  LifeOpsRepository,
} from "../../../eliza/apps/app-lifeops/src/lifeops/repository.ts";
import { seedGoogleConnectorGrant } from "../../mocks/helpers/seed-grants.ts";

type CalendarSeedEvent = {
  id: string;
  title: string;
  startOffsetMinutes: number;
  durationMinutes: number;
  attendees?: string[];
  description?: string;
  location?: string;
  metadata?: Record<string, unknown>;
};

type BrowserTelemetryWindow = {
  url: string;
  offsetMinutes: number;
  durationMinutes: number;
};

type BrowserTelemetrySeed = {
  deviceId: string;
  browserVendor?: "chrome" | "safari" | "unknown";
  extensionVersion?: string;
  userAgent?: string;
  windows: BrowserTelemetryWindow[];
};

function requireRuntime(ctx: ScenarioContext): IAgentRuntime | string {
  const runtime = ctx.runtime as IAgentRuntime | undefined;
  return runtime ?? "scenario runtime unavailable during seed";
}

function scenarioNow(ctx: ScenarioContext): Date {
  return typeof ctx.now === "string" && Number.isFinite(Date.parse(ctx.now))
    ? new Date(ctx.now)
    : new Date();
}

export function seedMeetingPreferences(patch: LifeOpsMeetingPreferencesPatch) {
  return async (ctx: ScenarioContext): Promise<ScenarioCheckResult> => {
    const runtime = requireRuntime(ctx);
    if (typeof runtime === "string") {
      return runtime;
    }
    const updated = await updateLifeOpsMeetingPreferences(runtime, patch);
    return updated ? undefined : "failed to seed meeting preferences";
  };
}

export function seedCalendarCache(args: {
  events: CalendarSeedEvent[];
  windowDaysAhead?: number;
}) {
  return async (ctx: ScenarioContext): Promise<ScenarioCheckResult> => {
    const runtime = requireRuntime(ctx);
    if (typeof runtime === "string") {
      return runtime;
    }

    await seedGoogleConnectorGrant(runtime, {
      capabilities: ["google.calendar.read", "google.calendar.write"],
    });

    const repository = new LifeOpsRepository(runtime);
    const agentId = String(runtime.agentId);
    const now = scenarioNow(ctx);
    const nowIso = now.toISOString();

    for (const event of args.events) {
      const startAt = new Date(
        now.getTime() + event.startOffsetMinutes * 60_000,
      ).toISOString();
      const endAt = new Date(
        now.getTime() +
          (event.startOffsetMinutes + event.durationMinutes) * 60_000,
      ).toISOString();
      await repository.upsertCalendarEvent({
        id: event.id,
        externalId: `${event.id}-external`,
        agentId,
        provider: "google",
        side: "owner",
        calendarId: "primary",
        title: event.title,
        description: event.description ?? null,
        location: event.location ?? null,
        status: "confirmed",
        startAt,
        endAt,
        isAllDay: false,
        timezone: "America/Los_Angeles",
        htmlLink: null,
        conferenceLink: null,
        organizer: null,
        attendees: event.attendees ?? [],
        metadata: event.metadata ?? {},
        syncedAt: nowIso,
        updatedAt: nowIso,
      });
    }

    await repository.upsertCalendarSyncState(
      createLifeOpsCalendarSyncState({
        agentId,
        provider: "google",
        side: "owner",
        calendarId: "primary",
        windowStartAt: new Date(now.getTime() - 24 * 60 * 60_000).toISOString(),
        windowEndAt: new Date(
          now.getTime() + (args.windowDaysAhead ?? 7) * 24 * 60 * 60_000,
        ).toISOString(),
        syncedAt: nowIso,
      }),
    );

    return undefined;
  };
}

export function seedBrowserExtensionTelemetry(args: BrowserTelemetrySeed) {
  return async (ctx: ScenarioContext): Promise<ScenarioCheckResult> => {
    const runtime = requireRuntime(ctx);
    if (typeof runtime === "string") {
      return runtime;
    }

    const now = scenarioNow(ctx);
    await recordBrowserSessionRegistration(runtime, {
      deviceId: args.deviceId,
      userAgent:
        args.userAgent ??
        "Mozilla/5.0 (Macintosh; Intel Mac OS X) LifeOpsBrowser/1.0",
      extensionVersion: args.extensionVersion ?? "1.0.0",
      browserVendor: args.browserVendor ?? "chrome",
      registeredAt: now.toISOString(),
    });

    for (const window of args.windows) {
      const windowEnd = new Date(now.getTime() - window.offsetMinutes * 60_000);
      const windowStart = new Date(
        windowEnd.getTime() - window.durationMinutes * 60_000,
      );
      const recorded = await recordBrowserFocusWindow(runtime, {
        deviceId: args.deviceId,
        url: window.url,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
      });
      if (!recorded) {
        return `failed to record browser focus window for ${window.url}`;
      }
    }

    return undefined;
  };
}
