import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "twitter.dm.schedule-reply",
  title: "Twitter DM schedule request falls back to draft or calendar routing",
  domain: "messaging.twitter-dm",
  tags: ["messaging", "twitter", "routing"],
  description:
    "A request to schedule a Twitter/X DM reply currently falls back to generic draft or calendar routing instead of a scheduled X DM reply.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Twitter DM Schedule Reply",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "schedule reply",
      room: "main",
      text: "Schedule a reply to @devfriend's Twitter DM for 9am tomorrow saying thanks for the intro.",
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "twitter-dm-schedule-routing",
      predicate: async (ctx) => {
        const inboxAction = ctx.actionsCalled.find(
          (entry) => entry.actionName === "OWNER_INBOX",
        );
        const sendAction = ctx.actionsCalled.find(
          (entry) => entry.actionName === "OWNER_SEND_MESSAGE",
        );
        const calendarAction = ctx.actionsCalled.find(
          (entry) => entry.actionName === "OWNER_CALENDAR",
        );
        const sendData =
          sendAction?.result?.data && typeof sendAction.result.data === "object"
            ? (sendAction.result.data as {
                draft?: boolean;
                channel?: string;
                target?: string;
              })
            : null;
        if (sendData) {
          if (sendData.draft !== true) {
            return "expected OWNER_SEND_MESSAGE to stay in draft mode";
          }
          if (sendData.channel !== "email") {
            return `expected email draft fallback, got ${sendData.channel ?? "(missing)"}`;
          }
          if (
            typeof sendData.target !== "string" ||
            sendData.target.length === 0
          ) {
            return "expected OWNER_SEND_MESSAGE draft target";
          }
          return undefined;
        }
        const calendarData =
          calendarAction?.result?.data &&
          typeof calendarAction.result.data === "object"
            ? (calendarAction.result.data as {
                title?: string;
                description?: string;
                status?: string;
              })
            : null;
        if (calendarData) {
          if (calendarData.status !== "confirmed") {
            return `expected confirmed calendar event, got ${calendarData.status ?? "(missing)"}`;
          }
          if (
            typeof calendarData.title !== "string" ||
            !calendarData.title.includes("@devfriend")
          ) {
            return `expected calendar title to mention @devfriend, got ${calendarData.title ?? "(missing)"}`;
          }
          return undefined;
        }
        const inboxData =
          inboxAction?.result?.data &&
          typeof inboxAction.result.data === "object"
            ? (inboxAction.result.data as {
                actionName?: string;
                subaction?: string;
                channel?: string;
              })
            : null;
        if (!inboxData) {
          return "expected OWNER_SEND_MESSAGE, OWNER_CALENDAR, or OWNER_INBOX fallback";
        }
        if (
          inboxData.subaction !== "draft_reply" &&
          inboxData.subaction !== "send_reply" &&
          inboxData.subaction !== "respond"
        ) {
          return `expected OWNER_INBOX draft_reply, send_reply, or respond subaction, got ${inboxData.subaction ?? "(missing)"}`;
        }
        return undefined;
      },
    },
  ],
});
