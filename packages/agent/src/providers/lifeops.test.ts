import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getOverview,
  getGoogleConnectorStatus,
  getNextCalendarEventContext,
  getGmailTriage,
  LifeOpsServiceMock,
} = vi.hoisted(() => ({
  getOverview: vi.fn(),
  getGoogleConnectorStatus: vi.fn(),
  getNextCalendarEventContext: vi.fn(),
  getGmailTriage: vi.fn(),
  LifeOpsServiceMock: vi.fn(),
}));

vi.mock("../actions/lifeops-google-helpers.js", () => ({
  hasLifeOpsAccess: vi.fn(),
}));

vi.mock("../lifeops/owner-profile.js", () => ({
  readLifeOpsOwnerProfile: vi.fn(),
}));

vi.mock("../lifeops/service.js", () => ({
  LifeOpsService: LifeOpsServiceMock,
}));

import { hasLifeOpsAccess } from "../actions/lifeops-google-helpers.js";
import { readLifeOpsOwnerProfile } from "../lifeops/owner-profile.js";
import { lifeOpsProvider } from "./lifeops.js";

describe("lifeops provider", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    LifeOpsServiceMock.mockImplementation(function MockLifeOpsService() {
      return {
      getOverview,
      getGoogleConnectorStatus,
      getNextCalendarEventContext,
      getGmailTriage,
      };
    });
    vi.mocked(hasLifeOpsAccess).mockResolvedValue(true);
    vi.mocked(readLifeOpsOwnerProfile).mockResolvedValue({
      name: "Shaw",
      relationshipStatus: "single",
      partnerName: "n/a",
      orientation: "n/a",
      gender: "n/a",
      age: "34",
      location: "Denver",
      updatedAt: "2026-04-12T00:00:00.000Z",
    });
    getOverview.mockResolvedValue({
      owner: {
        summary: {
          activeOccurrenceCount: 2,
          activeGoalCount: 1,
          activeReminderCount: 3,
        },
        occurrences: [{ title: "Brush teeth", state: "upcoming" }],
      },
      agentOps: {
        summary: {
          activeOccurrenceCount: 1,
          activeGoalCount: 0,
        },
        occurrences: [{ title: "Refresh memory", state: "pending" }],
      },
    });
    getGoogleConnectorStatus.mockResolvedValue({
      connected: true,
      grantedCapabilities: ["google.calendar.read", "google.gmail.triage"],
    });
    getNextCalendarEventContext.mockResolvedValue({
      event: { title: "Lunch", startAt: "", endAt: "", isAllDay: false },
      startsInMinutes: 30,
      attendeeNames: ["Alex"],
      location: "Cafe",
    });
    getGmailTriage.mockResolvedValue({
      summary: {
        unreadCount: 2,
        importantNewCount: 1,
        likelyReplyNeededCount: 1,
      },
    });
  });

  it("injects owner-profile defaults and LifeOps context for owner chats", async () => {
    const result = await lifeOpsProvider.get(
      { agentId: "agent-1" } as never,
      { entityId: "owner-1" } as never,
      {} as never,
    );

    expect(result.text).toContain("Use UPDATE_OWNER_PROFILE");
    expect(result.text).toContain(
      "Owner profile: name=Shaw | relationship=single | partner=n/a | orientation=n/a | gender=n/a | age=34 | location=Denver",
    );
    expect(result.values).toMatchObject({
      ownerProfileName: "Shaw",
      ownerRelationshipStatus: "single",
      ownerAge: "34",
      ownerLocation: "Denver",
      ownerOpenOccurrences: 2,
      agentOpenOccurrences: 1,
    });
    expect(result.data).toMatchObject({
      ownerProfile: {
        name: "Shaw",
        location: "Denver",
      },
    });
  });

  it("stays silent without LifeOps access", async () => {
    vi.mocked(hasLifeOpsAccess).mockResolvedValue(false);

    const result = await lifeOpsProvider.get(
      { agentId: "agent-1" } as never,
      { entityId: "guest-1" } as never,
      {} as never,
    );

    expect(result).toEqual({ text: "", values: {}, data: {} });
  });
});
