import type { Action, ActionExample, HandlerOptions } from "@elizaos/core";
import type {
  CreateLifeOpsGmailBatchReplyDraftsRequest,
  CreateLifeOpsGmailReplyDraftRequest,
  LifeOpsGmailBatchReplySendItem,
  SendLifeOpsGmailBatchReplyRequest,
  SendLifeOpsGmailReplyRequest,
} from "@miladyai/shared/contracts/lifeops";
import { LifeOpsService, LifeOpsServiceError } from "../lifeops/service.js";
import {
  detailArray,
  detailBoolean,
  detailNumber,
  detailString,
  formatEmailNeedsResponse,
  formatEmailSearch,
  formatEmailTriage,
  formatGmailBatchReplyDrafts,
  formatGmailReplyDraft,
  getGoogleCapabilityStatus,
  gmailReadUnavailableMessage,
  gmailSendUnavailableMessage,
  hasLifeOpsAccess,
  INTERNAL_URL,
  messageText,
  toActionData,
} from "./lifeops-google-helpers.js";

type GmailSubaction =
  | "triage"
  | "needs_response"
  | "search"
  | "draft_reply"
  | "draft_batch_replies"
  | "send_reply"
  | "send_batch_replies";

type GmailActionParams = {
  subaction?: GmailSubaction;
  intent?: string;
  query?: string;
  messageId?: string;
  bodyText?: string;
  details?: Record<string, unknown>;
};

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function stripMatchingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[.?!,;:]+$/g, "").trim();
}

function quoteQueryValue(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}

function dedupeQueries(values: Array<string | undefined>): string[] {
  const queries: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!value) {
      continue;
    }
    const query = value.trim();
    if (query.length === 0) {
      continue;
    }
    const key = query.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    queries.push(query);
  }
  return queries;
}

function tokenizeGmailSearchQuery(value: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of value.trim()) {
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
      continue;
    }
    if (!inQuotes && /\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

function normalizeSearchFragment(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = trimTrailingPunctuation(value.trim());
  return trimmed.length > 0 ? trimmed : undefined;
}

function inferSenderSearchCandidate(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const operatorToken = tokenizeGmailSearchQuery(trimmed).find((token) =>
    /^from:/i.test(token),
  );
  if (operatorToken) {
    const candidate = normalizeSearchFragment(
      stripMatchingQuotes(operatorToken.slice(5)),
    );
    if (candidate) {
      return candidate;
    }
  }

  const patterns = [
    /\b(?:email|emails|message|messages)\s+from\s+(.+)$/i,
    /\bsender(?:\s+(?:is|matches?|named))?\s+(.+)$/i,
    /\b(?:first\s+name|last\s+name|name)\s+is\s+(.+)$/i,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    const candidate = normalizeSearchFragment(stripMatchingQuotes(match?.[1] ?? ""));
    if (candidate) {
      return candidate;
    }
  }
  return undefined;
}

function inferSenderSearchQuery(value: string): string | undefined {
  const sender = inferSenderSearchCandidate(value);
  return sender ? `from:${quoteQueryValue(sender)}` : undefined;
}

function inferGmailSubaction(
  intent: string,
  details: Record<string, unknown> | undefined,
  params: GmailActionParams,
): GmailSubaction {
  if (
    params.bodyText ||
    detailString(details, "bodyText") ||
    detailArray(details, "items")
  ) {
    return detailArray(details, "items") ? "send_batch_replies" : "send_reply";
  }
  if (
    params.messageId ||
    detailString(details, "messageId") ||
    detailArray(details, "messageIds")
  ) {
    if (/\b(batch|all|multiple)\b/.test(intent) || detailArray(details, "messageIds")) {
      return "draft_batch_replies";
    }
    return "draft_reply";
  }
  if (params.query || detailString(details, "query")) {
    return "search";
  }
  if (
    /\b(send|reply now|email them back|send this)\b/.test(intent) &&
    detailArray(details, "items")
  ) {
    return "send_batch_replies";
  }
  if (/\b(send|reply now|email them back|send this)\b/.test(intent)) {
    return "send_reply";
  }
  if (/\b(draft|write a reply|compose a reply|reply draft)\b/.test(intent)) {
    return /\b(batch|all|multiple)\b/.test(intent)
      ? "draft_batch_replies"
      : "draft_reply";
  }
  if (/\b(search|find|look for|about|from)\b/.test(intent)) {
    return "search";
  }
  if (/\b(need(?:s)? a reply|respond to|reply needed|need response)\b/.test(intent)) {
    return "needs_response";
  }
  return "triage";
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

function inferGmailSearchQuery(intent: string): string | undefined {
  const match = intent.match(
    /\b(?:search(?: for)?|find|look(?:ing)? for)\s+(.+)$/i,
  );
  const query = normalizeSearchFragment(match?.[1]);
  if (query) {
    return query;
  }
  return inferSenderSearchQuery(intent);
}

function buildGmailSearchPlan(args: {
  intent: string;
  query?: string;
}): {
  queries: string[];
  displayQuery: string;
} | null {
  const requestedQuery =
    normalizeSearchFragment(args.query) ??
    inferGmailSearchQuery(args.intent) ??
    normalizeSearchFragment(inferSenderSearchCandidate(args.intent));
  if (!requestedQuery) {
    return null;
  }

  const senderCandidate =
    inferSenderSearchCandidate(args.query ?? "") ??
    inferSenderSearchCandidate(args.intent) ??
    (/^from:/i.test(requestedQuery)
      ? normalizeSearchFragment(stripMatchingQuotes(requestedQuery.slice(5)))
      : undefined);
  const senderQuery = senderCandidate
    ? `from:${quoteQueryValue(senderCandidate)}`
    : undefined;
  const senderOnlyRequest =
    Boolean(senderCandidate) &&
    requestedQuery.toLowerCase() !== senderCandidate?.toLowerCase() &&
    requestedQuery.toLowerCase() !== senderQuery?.toLowerCase();

  const queries = dedupeQueries([
    senderQuery,
    senderOnlyRequest ? undefined : requestedQuery,
    senderCandidate,
  ]);
  if (queries.length === 0) {
    return null;
  }
  return {
    queries,
    displayQuery: senderCandidate ?? requestedQuery,
  };
}

function normalizeBatchSendItems(
  details: Record<string, unknown> | undefined,
): LifeOpsGmailBatchReplySendItem[] | undefined {
  const items = detailArray(details, "items");
  if (!items) {
    return undefined;
  }
  const normalized = items
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const record = item as Record<string, unknown>;
      const messageId =
        typeof record.messageId === "string" &&
        record.messageId.trim().length > 0
          ? record.messageId.trim()
          : null;
      const bodyText =
        typeof record.bodyText === "string" &&
        record.bodyText.trim().length > 0
          ? record.bodyText.trim()
          : null;
      if (!messageId || !bodyText) {
        return null;
      }
      const normalized: LifeOpsGmailBatchReplySendItem = {
        messageId,
        bodyText,
        subject:
          typeof record.subject === "string" && record.subject.trim().length > 0
            ? record.subject.trim()
            : undefined,
        to: normalizeStringArray(record.to),
        cc: normalizeStringArray(record.cc),
      };
      return normalized;
    })
    .filter((item): item is LifeOpsGmailBatchReplySendItem => item !== null);
  return normalized.length > 0 ? normalized : undefined;
}

export const gmailAction: Action = {
  name: "GMAIL_ACTION",
  similes: [
    "GMAIL",
    "CHECK_EMAIL",
    "EMAIL_TRIAGE",
    "SEARCH_EMAIL",
    "DRAFT_EMAIL_REPLY",
    "SEND_EMAIL_REPLY",
  ],
  description:
    "Use Gmail through LifeOps. Supports inbox triage, needs-response review, Gmail search, drafting replies, and sending confirmed replies. Prefer this over LIFE for Gmail-specific work.",
  validate: async (runtime, message) => {
    return hasLifeOpsAccess(runtime, message);
  },
  handler: async (runtime, message, _state, options) => {
    if (!(await hasLifeOpsAccess(runtime, message))) {
      return {
        success: false,
        text: "Gmail actions are restricted to the owner, explicitly granted users, and the agent.",
      };
    }

    const rawParams = (options as HandlerOptions | undefined)
      ?.parameters as GmailActionParams | undefined;
    const params = rawParams ?? ({} as GmailActionParams);
    const intent = params.intent?.trim() || messageText(message).trim();
    const details = params.details;
    const subaction =
      params.subaction ??
      inferGmailSubaction(normalizeText(intent), details, params);
    const service = new LifeOpsService(runtime);

    try {
      const google = await getGoogleCapabilityStatus(service);

      if (subaction === "send_reply" || subaction === "send_batch_replies") {
        if (!google.hasGmailSend) {
          return {
            success: false,
            text: gmailSendUnavailableMessage(google),
          };
        }
      } else if (!google.hasGmailTriage) {
        return {
          success: false,
          text: gmailReadUnavailableMessage(google),
        };
      }

      if (subaction === "triage") {
        const feed = await service.getGmailTriage(INTERNAL_URL, {
          mode: (detailString(details, "mode") as
            | "local"
            | "remote"
            | "cloud_managed"
            | undefined),
          side: (detailString(details, "side") as "owner" | "agent" | undefined),
          forceSync: detailBoolean(details, "forceSync"),
          maxResults: detailNumber(details, "maxResults") ?? 10,
        });
        return {
          success: true,
          text: formatEmailTriage(feed),
          data: toActionData(feed),
        };
      }

      if (subaction === "needs_response") {
        const feed = await service.getGmailNeedsResponse(INTERNAL_URL, {
          mode: (detailString(details, "mode") as
            | "local"
            | "remote"
            | "cloud_managed"
            | undefined),
          side: (detailString(details, "side") as "owner" | "agent" | undefined),
          forceSync: detailBoolean(details, "forceSync"),
          maxResults: detailNumber(details, "maxResults") ?? 10,
        });
        return {
          success: true,
          text: formatEmailNeedsResponse(feed),
          data: toActionData(feed),
        };
      }

      if (subaction === "search") {
        const requestedQuery =
          params.query ??
          detailString(details, "query") ??
          inferGmailSearchQuery(intent);
        const searchPlan = buildGmailSearchPlan({
          intent,
          query: requestedQuery,
        });
        if (!searchPlan) {
          return {
            success: false,
            text: "GMAIL_ACTION search needs a query.",
          };
        }
        const requestBase = {
          mode: (detailString(details, "mode") as
            | "local"
            | "remote"
            | "cloud_managed"
            | undefined),
          side: (detailString(details, "side") as "owner" | "agent" | undefined),
          forceSync: detailBoolean(details, "forceSync"),
          maxResults: detailNumber(details, "maxResults") ?? 10,
          replyNeededOnly: detailBoolean(details, "replyNeededOnly"),
        };
        let feed = await service.getGmailSearch(INTERNAL_URL, {
          ...requestBase,
          query: searchPlan.queries[0] ?? searchPlan.displayQuery,
        });
        for (const query of searchPlan.queries.slice(1)) {
          if (feed.messages.length > 0) {
            break;
          }
          feed = await service.getGmailSearch(INTERNAL_URL, {
            ...requestBase,
            query,
          });
        }
        const displayFeed =
          feed.query === searchPlan.displayQuery
            ? feed
            : {
                ...feed,
                query: searchPlan.displayQuery,
              };
        return {
          success: true,
          text: formatEmailSearch(displayFeed),
          data: toActionData(displayFeed),
        };
      }

      if (subaction === "draft_reply") {
        const messageId =
          params.messageId ?? detailString(details, "messageId");
        if (!messageId) {
          return {
            success: false,
            text: "GMAIL_ACTION draft_reply needs a messageId.",
          };
        }
        const draft = await service.createGmailReplyDraft(INTERNAL_URL, {
          mode: (detailString(details, "mode") as
            | "local"
            | "remote"
            | "cloud_managed"
            | undefined),
          side: (detailString(details, "side") as "owner" | "agent" | undefined),
          messageId,
          tone: (detailString(details, "tone") as
            | "brief"
            | "neutral"
            | "warm"
            | undefined),
          intent:
            detailString(details, "draftIntent") ??
            detailString(details, "intent") ??
            intent,
          includeQuotedOriginal: detailBoolean(details, "includeQuotedOriginal"),
        } satisfies CreateLifeOpsGmailReplyDraftRequest);
        return {
          success: true,
          text: formatGmailReplyDraft(draft),
          data: toActionData(draft),
        };
      }

      if (subaction === "draft_batch_replies") {
        const request: CreateLifeOpsGmailBatchReplyDraftsRequest = {
          mode: (detailString(details, "mode") as
            | "local"
            | "remote"
            | "cloud_managed"
            | undefined),
          side: (detailString(details, "side") as "owner" | "agent" | undefined),
          forceSync: detailBoolean(details, "forceSync"),
          maxResults: detailNumber(details, "maxResults") ?? 10,
          query:
            params.query ??
            detailString(details, "query") ??
            inferGmailSearchQuery(intent),
          messageIds: normalizeStringArray(details?.messageIds),
          tone: (detailString(details, "tone") as
            | "brief"
            | "neutral"
            | "warm"
            | undefined),
          intent:
            detailString(details, "draftIntent") ??
            detailString(details, "intent") ??
            intent,
          includeQuotedOriginal: detailBoolean(details, "includeQuotedOriginal"),
          replyNeededOnly:
            detailBoolean(details, "replyNeededOnly") ??
            /\b(reply needed|needs response|respond to)\b/.test(
              normalizeText(intent),
            ),
        };
        const batch = await service.createGmailBatchReplyDrafts(
          INTERNAL_URL,
          request,
        );
        return {
          success: true,
          text: formatGmailBatchReplyDrafts(batch),
          data: toActionData(batch),
        };
      }

      if (subaction === "send_reply") {
        const messageId =
          params.messageId ?? detailString(details, "messageId");
        const bodyText = params.bodyText ?? detailString(details, "bodyText");
        if (!messageId || !bodyText) {
          return {
            success: false,
            text: "GMAIL_ACTION send_reply needs both messageId and bodyText.",
          };
        }
        const result = await service.sendGmailReply(INTERNAL_URL, {
          mode: (detailString(details, "mode") as
            | "local"
            | "remote"
            | "cloud_managed"
            | undefined),
          side: (detailString(details, "side") as "owner" | "agent" | undefined),
          messageId,
          bodyText,
          subject: detailString(details, "subject"),
          to: normalizeStringArray(details?.to),
          cc: normalizeStringArray(details?.cc),
          confirmSend: detailBoolean(details, "confirmSend") ?? true,
        } satisfies SendLifeOpsGmailReplyRequest);
        return {
          success: true,
          text: "Gmail reply sent.",
          data: toActionData(result),
        };
      }

      const items = normalizeBatchSendItems(details);
      if (!items) {
        return {
          success: false,
          text: "GMAIL_ACTION send_batch_replies needs an items array with messageId and bodyText for each reply.",
        };
      }
      const result = await service.sendGmailReplies(INTERNAL_URL, {
        mode: (detailString(details, "mode") as
          | "local"
          | "remote"
          | "cloud_managed"
          | undefined),
        side: (detailString(details, "side") as "owner" | "agent" | undefined),
        confirmSend: detailBoolean(details, "confirmSend") ?? true,
        items,
      } satisfies SendLifeOpsGmailBatchReplyRequest);
      return {
        success: true,
        text: `Sent ${result.sentCount} Gmail repl${result.sentCount === 1 ? "y" : "ies"}.`,
        data: toActionData(result),
      };
    } catch (error) {
      if (error instanceof LifeOpsServiceError) {
        return { success: false, text: error.message };
      }
      throw error;
    }
  },
  parameters: [
    {
      name: "subaction",
      description:
        "Gmail operation to run. Use triage, needs_response, search, draft_reply, draft_batch_replies, send_reply, or send_batch_replies.",
      required: false,
      schema: {
        type: "string" as const,
        enum: [
          "triage",
          "needs_response",
          "search",
          "draft_reply",
          "draft_batch_replies",
          "send_reply",
          "send_batch_replies",
        ],
      },
    },
    {
      name: "intent",
      description:
        'Natural language Gmail request. Examples: "what emails need a reply", "search email for investor", "draft a reply to message 123".',
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "query",
      description: "Search query for Gmail search or batch draft selection.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "messageId",
      description:
        "Single Gmail message id for draft_reply or send_reply operations.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "bodyText",
      description: "Reply body for send_reply.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "details",
      description:
        "Structured Gmail arguments. Supported keys include mode, side, forceSync, maxResults, query, replyNeededOnly, tone, includeQuotedOriginal, messageId, messageIds, draftIntent, subject, to, cc, bodyText, confirmSend, and items for batch send.",
      required: false,
      schema: { type: "object" as const },
    },
  ],
  examples: [
    [
      {
        name: "{{name1}}",
        content: { text: "Do I have any emails I need to reply to?" },
      },
      {
        name: "{{agentName}}",
        content: { text: "Emails that likely need a reply: 3.\n- **Investor follow-up** from Jane Doe · 2h ago" },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: { text: "Search my email for OneBlade receipts." },
      },
      {
        name: "{{agentName}}",
        content: { text: "Found 2 emails for \"OneBlade receipts\"." },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: { text: "Draft a reply to message abc123 thanking them and saying next week works." },
      },
      {
        name: "{{agentName}}",
        content: { text: "Drafted reply for **Re: Scheduling**." },
      },
    ],
  ] as ActionExample[][],
};
