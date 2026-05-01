import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createCrossChannelIngestStore,
  normalizeCrossChannelCommentEvent,
  normalizeCrossChannelSourcePayload,
  redactCrossChannelSecrets,
} from "./cross-channel-ingest";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alice-ingest-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("cross-channel comment ingest", () => {
  it("normalizes GitHub issue comments into the canonical comment contract", () => {
    const comment = normalizeCrossChannelSourcePayload({
      source: "github",
      payload: {
        action: "created",
        repository: {
          full_name: "Render-Network-OS/milaidy",
        },
        issue: {
          number: 105,
          pull_request: { url: "https://api.github.com/repos/x/y/pulls/105" },
          html_url: "https://github.com/Render-Network-OS/milaidy/pull/105",
          title: "Alice production branch update",
        },
        comment: {
          id: 987,
          html_url:
            "https://github.com/Render-Network-OS/milaidy/pull/105#issuecomment-987",
          body: "Please keep staging green before prod.",
          created_at: "2026-05-01T10:00:00Z",
          updated_at: "2026-05-01T10:01:00Z",
          user: {
            login: "ops-reviewer",
            html_url: "https://github.com/ops-reviewer",
          },
        },
      },
    });

    expect(comment).toMatchObject({
      source: "github",
      externalId: "github:Render-Network-OS/milaidy:issue-comment:987",
      threadId: "github:Render-Network-OS/milaidy:pull:105",
      channelId: "Render-Network-OS/milaidy",
      body: "Please keep staging green before prod.",
      permalink:
        "https://github.com/Render-Network-OS/milaidy/pull/105#issuecomment-987",
      visibility: "internal",
      actionability: "needs_review",
    });
    expect(comment.author).toEqual({
      id: "ops-reviewer",
      name: "ops-reviewer",
      url: "https://github.com/ops-reviewer",
    });
    expect(comment.provenance).toMatchObject({
      adapter: "github.issue_comment",
      repository: "Render-Network-OS/milaidy",
      pullRequest: 105,
    });
  });

  it("normalizes all core first-release channel payloads", () => {
    const samples = [
      {
        source: "discord",
        payload: {
          id: "d1",
          channel_id: "chan",
          guild_id: "guild",
          content: "ship staging first",
          timestamp: "2026-05-01T10:00:00Z",
          author: { id: "u1", username: "discord-user" },
        },
      },
      {
        source: "telegram",
        payload: {
          message_id: 42,
          date: 1777639200,
          text: "prod needs approval",
          chat: { id: -1001, title: "ops" },
          from: { id: 777, username: "telegram_user" },
        },
      },
      {
        source: "slack",
        payload: {
          team: "T1",
          channel: "C1",
          ts: "1777639200.000100",
          thread_ts: "1777639100.000100",
          text: "please update the corpus",
          user: "U1",
        },
      },
      {
        source: "gmail",
        payload: {
          id: "m1",
          threadId: "t1",
          from: "Alice Tester <alice@example.com>",
          subject: "Alice setup",
          snippet: "Connect GitHub and Slack",
          internalDate: "1777639200000",
        },
      },
      {
        source: "ops",
        payload: {
          id: "run-prod-1",
          environment: "production",
          service: "alice-bot",
          status: "requires_approval",
          message: "Prepared prod deploy for Alice",
          createdAt: "2026-05-01T10:00:00Z",
        },
      },
      {
        source: "stream555",
        payload: {
          id: "comment-1",
          channel: "alice-cam",
          user: "viewer",
          text: "audio sounds good",
          createdAt: "2026-05-01T10:00:00Z",
        },
      },
    ] as const;

    const comments = samples.map(normalizeCrossChannelSourcePayload);

    expect(comments.map((comment) => comment.source)).toEqual([
      "discord",
      "telegram",
      "slack",
      "gmail",
      "ops",
      "stream555",
    ]);
    expect(comments.every((comment) => comment.dedupeKey.length > 10)).toBe(
      true,
    );
    expect(comments.every((comment) => comment.receivedAt)).toBe(true);
  });

  it("normalizes live Slack Events API envelopes", () => {
    const comment = normalizeCrossChannelSourcePayload({
      source: "slack",
      payload: {
        team_id: "T1",
        event: {
          type: "message",
          channel: "C-live",
          user: "U-live",
          text: "please ingest the real Slack envelope",
          ts: "1777639200.000100",
          thread_ts: "1777639100.000100",
        },
      },
    });

    expect(comment).toMatchObject({
      source: "slack",
      externalId: "slack:T1:C-live:1777639200.000100",
      threadId: "slack:T1:C-live:1777639100.000100",
      channelId: "C-live",
      body: "please ingest the real Slack envelope",
      author: { id: "U-live", name: "U-live" },
    });
  });

  it("normalizes live Telegram webhook envelopes", () => {
    const comment = normalizeCrossChannelSourcePayload({
      source: "telegram",
      payload: {
        update_id: 123,
        message: {
          message_id: 42,
          message_thread_id: 7,
          date: 1777639200,
          text: "real Telegram update envelope",
          chat: { id: -1001, type: "supergroup", title: "ops" },
          from: { id: 777, username: "telegram_user" },
        },
      },
    });

    expect(comment).toMatchObject({
      source: "telegram",
      externalId: "telegram:-1001:42",
      threadId: "telegram:-1001:7",
      channelId: "-1001",
      body: "real Telegram update envelope",
      visibility: "internal",
      author: { id: "777", name: "telegram_user" },
    });
  });

  it("redacts tokens before comments are stored or projected to knowledge", () => {
    const text =
      "github ghp_1234567890abcdef1234567890abcdef1234 openai sk-proj-abcDEF1234567890 twitch live_123456789_secret";

    expect(redactCrossChannelSecrets(text)).toBe(
      "github [REDACTED:github-token] openai [REDACTED:openai-token] twitch [REDACTED:stream-key]",
    );
  });

  it("persists raw envelopes and idempotently upserts normalized comments", () => {
    const store = createCrossChannelIngestStore({
      rootDir: makeTempDir(),
      now: () => 1777639200000,
    });

    const first = store.ingest({
      source: "github",
      externalId: "gh-comment-1",
      threadId: "gh-pr-1",
      author: { id: "alice", name: "alice" },
      body: "first body",
      createdAt: "2026-05-01T10:00:00Z",
    });
    const second = store.ingest({
      source: "github",
      externalId: "gh-comment-1",
      threadId: "gh-pr-1",
      author: { id: "alice", name: "alice" },
      body: "edited body",
      createdAt: "2026-05-01T10:00:00Z",
      updatedAt: "2026-05-01T10:10:00Z",
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(store.list().items).toHaveLength(1);
    expect(store.list().items[0]).toMatchObject({
      body: "edited body",
      updatedAt: "2026-05-01T10:10:00.000Z",
    });
    expect(fs.readFileSync(store.paths.rawAuditLog, "utf-8").trim().split("\n"))
      .toHaveLength(2);
  });

  it("builds safe knowledge fragments with provenance and no raw payload secrets", () => {
    const normalized = normalizeCrossChannelCommentEvent({
      source: "slack",
      externalId: "slack-message-1",
      threadId: "slack-thread-1",
      channelId: "ops",
      author: { id: "U1", name: "ops-user" },
      body: "rotate this sk-abcdef1234567890 immediately",
      createdAt: "2026-05-01T10:00:00Z",
      permalink: "https://slack.example/archives/C1/p1",
    });

    expect(normalized.knowledgeFragment).toEqual({
      title: "slack comment from ops-user",
      text:
        "Source: slack\nThread: slack-thread-1\nAuthor: ops-user\nLink: https://slack.example/archives/C1/p1\n\nrotate this [REDACTED:openai-token] immediately",
      metadata: {
        source: "slack",
        externalId: "slack-message-1",
        threadId: "slack-thread-1",
        channelId: "ops",
        permalink: "https://slack.example/archives/C1/p1",
      },
    });
  });
});
