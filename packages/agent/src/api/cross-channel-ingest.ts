import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type CrossChannelCommentSource =
  | "github"
  | "discord"
  | "telegram"
  | "slack"
  | "gmail"
  | "ops"
  | "stream555";

export type CrossChannelVisibility =
  | "public"
  | "internal"
  | "private"
  | "unknown";

export type CrossChannelActionability =
  | "none"
  | "needs_reply"
  | "needs_review"
  | "needs_deploy_approval"
  | "incident"
  | "follow_up";

export interface CrossChannelAuthor {
  id?: string;
  name?: string;
  url?: string;
  email?: string;
}

export interface CrossChannelAttachment {
  id?: string;
  name?: string;
  url?: string;
  contentType?: string;
}

export interface CrossChannelCommentInput {
  source: CrossChannelCommentSource;
  externalId: string;
  threadId: string;
  channelId?: string;
  accountId?: string;
  author?: CrossChannelAuthor;
  body: string;
  createdAt?: string | number | Date;
  updatedAt?: string | number | Date;
  receivedAt?: string | number | Date;
  permalink?: string;
  visibility?: CrossChannelVisibility;
  actionability?: CrossChannelActionability;
  attachments?: CrossChannelAttachment[];
  provenance?: Record<string, unknown>;
  raw?: unknown;
}

export interface CrossChannelKnowledgeFragment {
  title: string;
  text: string;
  metadata: {
    source: CrossChannelCommentSource;
    externalId: string;
    threadId: string;
    channelId?: string;
    permalink?: string;
  };
}

export interface NormalizedCrossChannelComment
  extends Omit<CrossChannelCommentInput, "createdAt" | "updatedAt" | "receivedAt"> {
  id: string;
  dedupeKey: string;
  body: string;
  createdAt?: string;
  updatedAt?: string;
  receivedAt: string;
  knowledgeFragment: CrossChannelKnowledgeFragment;
}

export interface SourcePayloadInput {
  source: CrossChannelCommentSource;
  payload: Record<string, unknown>;
}

export interface CrossChannelIngestResult {
  created: boolean;
  comment: NormalizedCrossChannelComment;
}

type StoreOptions = {
  rootDir: string;
  now?: () => number;
};

const MAX_BODY_CHARS = 32_000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function toIsoTimestamp(
  value: string | number | Date | undefined,
): string | undefined {
  if (value == null) return undefined;
  const date =
    value instanceof Date
      ? value
      : typeof value === "number"
        ? new Date(value < 10_000_000_000 ? value * 1000 : value)
        : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function hashStable(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function compactObject<T extends Record<string, unknown>>(input: T): T {
  for (const key of Object.keys(input)) {
    if (input[key] === undefined) {
      delete input[key];
    }
  }
  return input;
}

export function redactCrossChannelSecrets(text: string): string {
  return text
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, "[REDACTED:github-token]")
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}\b/g, "[REDACTED:openai-token]")
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, "[REDACTED:slack-token]")
    .replace(/\b(?:live|sk_us-[a-z0-9-]+)_[A-Za-z0-9_-]{8,}\b/gi, "[REDACTED:stream-key]")
    .replace(/\bBasic\s+[A-Za-z0-9+/=]{16,}\b/g, "Basic [REDACTED:basic-auth]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/g, "Bearer [REDACTED:bearer-token]");
}

function redactDeep(value: unknown): unknown {
  if (typeof value === "string") {
    return redactCrossChannelSecrets(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item));
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      output[key] = redactDeep(nested);
    }
    return output;
  }
  return value;
}

function inferActionability(
  source: CrossChannelCommentSource,
  body: string,
  explicit?: CrossChannelActionability,
): CrossChannelActionability {
  if (explicit) return explicit;
  const lower = body.toLowerCase();
  if (source === "ops" && lower.includes("approval")) {
    return "needs_deploy_approval";
  }
  if (source === "github") {
    return "needs_review";
  }
  if (lower.includes("urgent") || lower.includes("incident")) {
    return "incident";
  }
  if (lower.includes("please") || lower.includes("?")) {
    return "needs_reply";
  }
  return "none";
}

function defaultVisibility(source: CrossChannelCommentSource): CrossChannelVisibility {
  if (source === "gmail") return "private";
  if (source === "stream555") return "public";
  return "internal";
}

export function normalizeCrossChannelCommentEvent(
  input: CrossChannelCommentInput,
  now: () => number = () => Date.now(),
): NormalizedCrossChannelComment {
  if (!input.source) {
    throw new Error("source is required");
  }
  if (!input.externalId?.trim()) {
    throw new Error("externalId is required");
  }
  if (!input.threadId?.trim()) {
    throw new Error("threadId is required");
  }
  if (!input.body?.trim()) {
    throw new Error("body is required");
  }

  const body = redactCrossChannelSecrets(input.body).slice(0, MAX_BODY_CHARS);
  const source = input.source;
  const externalId = input.externalId.trim();
  const threadId = input.threadId.trim();
  const channelId = input.channelId?.trim() || undefined;
  const permalink = input.permalink?.trim() || undefined;
  const dedupeKey = `${source}:${input.accountId ?? channelId ?? "default"}:${externalId}`;
  const author = compactObject({
    id: input.author?.id,
    name: input.author?.name,
    url: input.author?.url,
    email: input.author?.email,
  });
  const authorName = author.name ?? author.id ?? author.email ?? "unknown";
  const metadata = compactObject({
    source,
    externalId,
    threadId,
    channelId,
    permalink,
  });
  const knowledgeFragment = {
    title: `${source} comment from ${authorName}`,
    text: [
      `Source: ${source}`,
      `Thread: ${threadId}`,
      `Author: ${authorName}`,
      permalink ? `Link: ${permalink}` : undefined,
      "",
      body,
    ]
      .filter((line) => line !== undefined)
      .join("\n"),
    metadata,
  };

  return compactObject({
    ...input,
    id: hashStable(dedupeKey),
    dedupeKey,
    source,
    externalId,
    threadId,
    channelId,
    author,
    body,
    createdAt: toIsoTimestamp(input.createdAt),
    updatedAt: toIsoTimestamp(input.updatedAt),
    receivedAt: toIsoTimestamp(input.receivedAt) ?? new Date(now()).toISOString(),
    permalink,
    visibility: input.visibility ?? defaultVisibility(source),
    actionability: inferActionability(source, body, input.actionability),
    attachments: input.attachments ?? [],
    provenance: input.provenance ?? {},
    raw: input.raw ? redactDeep(input.raw) : undefined,
    knowledgeFragment,
  }) as NormalizedCrossChannelComment;
}

export function normalizeCrossChannelSourcePayload(
  input: SourcePayloadInput,
): NormalizedCrossChannelComment {
  switch (input.source) {
    case "github":
      return normalizeGitHubPayload(input.payload);
    case "discord":
      return normalizeDiscordPayload(input.payload);
    case "telegram":
      return normalizeTelegramPayload(input.payload);
    case "slack":
      return normalizeSlackPayload(input.payload);
    case "gmail":
      return normalizeGmailPayload(input.payload);
    case "ops":
      return normalizeOpsPayload(input.payload);
    case "stream555":
      return normalizeStream555Payload(input.payload);
  }
}

function normalizeGitHubPayload(payload: Record<string, unknown>): NormalizedCrossChannelComment {
  const repo = asRecord(payload.repository);
  const issue = asRecord(payload.issue);
  const comment = asRecord(payload.comment);
  const user = asRecord(comment.user);
  const review = asRecord(payload.review);
  const reviewComment = asRecord(payload.review_comment);
  const target = Object.keys(comment).length > 0 ? comment : Object.keys(reviewComment).length > 0 ? reviewComment : review;
  const targetUser = asRecord(target.user);
  const repoFullName = asString(repo.full_name) ?? "unknown/repo";
  const number = asNumber(issue.number) ?? asNumber(asRecord(payload.pull_request).number);
  const isPullRequest = Boolean(issue.pull_request) || Boolean(payload.pull_request);
  const kind =
    Object.keys(reviewComment).length > 0
      ? "review-comment"
      : Object.keys(review).length > 0
        ? "review"
        : "issue-comment";
  const targetId = asString(target.id) ?? String(asNumber(target.id) ?? hashStable(JSON.stringify(target)));
  const body =
    asString(target.body) ??
    asString(issue.body) ??
    asString(asRecord(payload.pull_request).body) ??
    asString(issue.title) ??
    "GitHub event";
  const threadKind = isPullRequest ? "pull" : "issue";
  const threadId =
    number != null
      ? `github:${repoFullName}:${threadKind}:${number}`
      : `github:${repoFullName}`;

  return normalizeCrossChannelCommentEvent({
    source: "github",
    externalId: `github:${repoFullName}:${kind}:${targetId}`,
    threadId,
    channelId: repoFullName,
    author: compactObject({
      id: asString(targetUser.login) ?? asString(user.login),
      name: asString(targetUser.login) ?? asString(user.login),
      url: asString(targetUser.html_url) ?? asString(user.html_url),
    }),
    body,
    createdAt: asString(target.created_at),
    updatedAt: asString(target.updated_at),
    permalink:
      asString(target.html_url) ??
      asString(issue.html_url) ??
      asString(asRecord(payload.pull_request).html_url),
    visibility: "internal",
    actionability: isPullRequest ? "needs_review" : "needs_reply",
    provenance: compactObject({
      adapter: `github.${kind === "issue-comment" ? "issue_comment" : kind}`,
      repository: repoFullName,
      issue: isPullRequest ? undefined : number,
      pullRequest: isPullRequest ? number : undefined,
      action: asString(payload.action),
    }),
    raw: payload,
  });
}

function normalizeDiscordPayload(payload: Record<string, unknown>): NormalizedCrossChannelComment {
  const author = asRecord(payload.author);
  const id = asString(payload.id) ?? hashStable(JSON.stringify(payload));
  const channelId = asString(payload.channel_id) ?? "unknown-channel";
  const guildId = asString(payload.guild_id);
  return normalizeCrossChannelCommentEvent({
    source: "discord",
    externalId: `discord:${channelId}:${id}`,
    threadId: `discord:${guildId ?? "dm"}:${asString(payload.thread_id) ?? channelId}`,
    channelId,
    accountId: guildId,
    author: compactObject({
      id: asString(author.id),
      name: asString(author.username) ?? asString(author.global_name),
    }),
    body: asString(payload.content) ?? "Discord message",
    createdAt: asString(payload.timestamp),
    updatedAt: asString(payload.edited_timestamp),
    visibility: guildId ? "internal" : "private",
    raw: payload,
  });
}

function normalizeTelegramPayload(payload: Record<string, unknown>): NormalizedCrossChannelComment {
  const chat = asRecord(payload.chat);
  const from = asRecord(payload.from);
  const chatId = String(asString(chat.id) ?? asNumber(chat.id) ?? "unknown-chat");
  const messageId = String(asNumber(payload.message_id) ?? asString(payload.message_id) ?? hashStable(JSON.stringify(payload)));
  return normalizeCrossChannelCommentEvent({
    source: "telegram",
    externalId: `telegram:${chatId}:${messageId}`,
    threadId: `telegram:${chatId}:${asString(payload.message_thread_id) ?? "main"}`,
    channelId: chatId,
    author: compactObject({
      id: String(asString(from.id) ?? asNumber(from.id) ?? ""),
      name: asString(from.username) ?? asString(from.first_name),
    }),
    body: asString(payload.text) ?? asString(payload.caption) ?? "Telegram message",
    createdAt: asNumber(payload.date),
    visibility: asString(chat.type) === "private" ? "private" : "internal",
    raw: payload,
  });
}

function normalizeSlackPayload(payload: Record<string, unknown>): NormalizedCrossChannelComment {
  const team = asString(payload.team) ?? asString(payload.team_id);
  const channelId = asString(payload.channel) ?? "unknown-channel";
  const ts = asString(payload.ts) ?? hashStable(JSON.stringify(payload));
  const threadTs = asString(payload.thread_ts) ?? ts;
  return normalizeCrossChannelCommentEvent({
    source: "slack",
    externalId: `slack:${team ?? "workspace"}:${channelId}:${ts}`,
    threadId: `slack:${team ?? "workspace"}:${channelId}:${threadTs}`,
    channelId,
    accountId: team,
    author: compactObject({
      id: asString(payload.user) ?? asString(payload.username),
      name: asString(payload.username) ?? asString(payload.user),
    }),
    body: asString(payload.text) ?? "Slack message",
    createdAt: slackTsToIso(ts),
    visibility: "internal",
    raw: payload,
  });
}

function slackTsToIso(ts: string): string | undefined {
  const seconds = Number(ts.split(".")[0]);
  return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : undefined;
}

function normalizeGmailPayload(payload: Record<string, unknown>): NormalizedCrossChannelComment {
  const id = asString(payload.id) ?? hashStable(JSON.stringify(payload));
  const threadId = asString(payload.threadId) ?? id;
  const subject = asString(payload.subject);
  const snippet = asString(payload.snippet) ?? asString(payload.body) ?? "Gmail message";
  return normalizeCrossChannelCommentEvent({
    source: "gmail",
    externalId: `gmail:${id}`,
    threadId: `gmail:${threadId}`,
    channelId: "gmail",
    author: parseEmailAuthor(asString(payload.from)),
    body: subject ? `${subject}\n\n${snippet}` : snippet,
    createdAt: asString(payload.internalDate)
      ? Number(asString(payload.internalDate))
      : asString(payload.date),
    visibility: "private",
    actionability: "needs_reply",
    raw: payload,
  });
}

function parseEmailAuthor(input: string | undefined): CrossChannelAuthor {
  if (!input) return {};
  const match = /^(.*?)\s*<([^>]+)>$/.exec(input);
  if (match) {
    return compactObject({ name: match[1]?.trim(), email: match[2]?.trim() });
  }
  return input.includes("@") ? { email: input } : { name: input };
}

function normalizeOpsPayload(payload: Record<string, unknown>): NormalizedCrossChannelComment {
  const id = asString(payload.id) ?? hashStable(JSON.stringify(payload));
  const environment = asString(payload.environment) ?? "unknown";
  const service = asString(payload.service) ?? "unknown-service";
  const status = asString(payload.status) ?? "unknown";
  return normalizeCrossChannelCommentEvent({
    source: "ops",
    externalId: `ops:${environment}:${service}:${id}`,
    threadId: `ops:${environment}:${service}`,
    channelId: `${environment}:${service}`,
    author: { id: "ops", name: "Ops" },
    body: asString(payload.message) ?? `${service} ${status}`,
    createdAt: asString(payload.createdAt) ?? asString(payload.startedAt),
    visibility: "internal",
    actionability:
      status.includes("approval") || status === "requires_approval"
        ? "needs_deploy_approval"
        : "none",
    provenance: compactObject({
      adapter: "ops.event",
      environment,
      service,
      status,
    }),
    raw: payload,
  });
}

function normalizeStream555Payload(payload: Record<string, unknown>): NormalizedCrossChannelComment {
  const id = asString(payload.id) ?? hashStable(JSON.stringify(payload));
  const channel = asString(payload.channel) ?? "alice-cam";
  return normalizeCrossChannelCommentEvent({
    source: "stream555",
    externalId: `stream555:${channel}:${id}`,
    threadId: `stream555:${channel}`,
    channelId: channel,
    author: compactObject({
      id: asString(payload.userId) ?? asString(payload.user),
      name: asString(payload.user) ?? asString(payload.displayName),
    }),
    body: asString(payload.text) ?? asString(payload.body) ?? "555stream comment",
    createdAt: asString(payload.createdAt) ?? asNumber(payload.createdAt),
    visibility: "public",
    raw: payload,
  });
}

export function createCrossChannelIngestStore(options: StoreOptions) {
  const rootDir = options.rootDir;
  const paths = {
    rootDir,
    rawAuditLog: path.join(rootDir, "raw-events.jsonl"),
    commentsFile: path.join(rootDir, "comments.json"),
  };
  const now = options.now ?? (() => Date.now());

  function readComments(): NormalizedCrossChannelComment[] {
    try {
      const raw = JSON.parse(fs.readFileSync(paths.commentsFile, "utf-8"));
      return Array.isArray(raw?.items) ? raw.items : [];
    } catch {
      return [];
    }
  }

  function writeComments(items: NormalizedCrossChannelComment[]): void {
    fs.mkdirSync(rootDir, { recursive: true });
    fs.writeFileSync(
      paths.commentsFile,
      JSON.stringify({ version: 1, items }, null, 2),
      "utf-8",
    );
  }

  return {
    paths,
    ingest(input: CrossChannelCommentInput | SourcePayloadInput): CrossChannelIngestResult {
      fs.mkdirSync(rootDir, { recursive: true });
      const comment =
        "payload" in input
          ? normalizeCrossChannelSourcePayload(input)
          : normalizeCrossChannelCommentEvent(input, now);
      const items = readComments();
      const index = items.findIndex((item) => item.dedupeKey === comment.dedupeKey);
      const created = index === -1;
      if (created) {
        items.push(comment);
      } else {
        items[index] = {
          ...items[index],
          ...comment,
          receivedAt: items[index]?.receivedAt ?? comment.receivedAt,
        };
      }
      writeComments(items);
      fs.appendFileSync(
        paths.rawAuditLog,
        `${JSON.stringify({
          receivedAt: new Date(now()).toISOString(),
          raw: redactDeep(input),
          dedupeKey: comment.dedupeKey,
        })}\n`,
        "utf-8",
      );
      return { created, comment: created ? comment : items[index] };
    },
    list(query: {
      source?: CrossChannelCommentSource;
      limit?: number;
      since?: string;
    } = {}) {
      let items = readComments();
      if (query.source) {
        items = items.filter((item) => item.source === query.source);
      }
      if (query.since) {
        const since = new Date(query.since).getTime();
        if (Number.isFinite(since)) {
          items = items.filter(
            (item) => new Date(item.updatedAt ?? item.createdAt ?? item.receivedAt).getTime() >= since,
          );
        }
      }
      items = items.sort((a, b) =>
        (b.updatedAt ?? b.createdAt ?? b.receivedAt).localeCompare(
          a.updatedAt ?? a.createdAt ?? a.receivedAt,
        ),
      );
      const limit = Math.max(1, Math.min(query.limit ?? 100, 500));
      return { items: items.slice(0, limit), total: items.length };
    },
    status() {
      const items = readComments();
      const bySource: Record<string, number> = {};
      for (const item of items) {
        bySource[item.source] = (bySource[item.source] ?? 0) + 1;
      }
      return {
        total: items.length,
        bySource,
        lastReceivedAt: items
          .map((item) => item.receivedAt)
          .sort()
          .at(-1) ?? null,
      };
    },
  };
}
