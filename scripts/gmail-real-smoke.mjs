#!/usr/bin/env node
import crypto from "node:crypto";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const METADATA_HEADERS = [
  "Subject",
  "From",
  "To",
  "Cc",
  "Date",
  "Message-Id",
  "In-Reply-To",
  "References",
  "List-Id",
  "Precedence",
  "Auto-Submitted",
];

function readFlag(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function readNumberFlag(name, fallback) {
  const raw = readFlag(name);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

function encodeRawEmail(lines) {
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

function scrubText(value, emailMap) {
  return String(value ?? "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (email) => {
      const key = email.toLowerCase();
      const existing = emailMap.get(key);
      if (existing) return existing;
      const next = `person${emailMap.size + 1}@example.test`;
      emailMap.set(key, next);
      return next;
    })
    .replace(/https?:\/\/\S+/gi, "https://example.test/redacted")
    .replace(/\b\+?\d[\d\s().-]{7,}\d\b/g, "+1-555-0100")
    .replace(/\s+/g, " ")
    .trim();
}

function scrubId(value, prefix) {
  const digest = crypto
    .createHash("sha256")
    .update(String(value ?? "missing"))
    .digest("hex");
  return `${prefix}-${digest.slice(0, 16)}`;
}

async function gmailJson(pathname, token, init = {}) {
  const response = await fetch(`${GMAIL_BASE}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(
      `Gmail request failed ${response.status}: ${JSON.stringify(body)}`,
    );
  }
  return body;
}

async function listMetadata(token, query, maxResults) {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
    includeSpamTrash: /\bin:(?:spam|trash|anywhere)\b/i.test(query)
      ? "true"
      : "false",
  });
  const listed = await gmailJson(`/messages?${params.toString()}`, token);
  const refs = Array.isArray(listed.messages) ? listed.messages : [];
  const metadataParams = new URLSearchParams({ format: "metadata" });
  for (const header of METADATA_HEADERS) {
    metadataParams.append("metadataHeaders", header);
  }
  const messages = [];
  for (const ref of refs) {
    if (!ref?.id) continue;
    messages.push(
      await gmailJson(
        `/messages/${encodeURIComponent(ref.id)}?${metadataParams.toString()}`,
        token,
      ),
    );
  }
  return {
    request: {
      method: "GET",
      path: "/gmail/v1/users/me/messages",
      query,
      maxResults,
      includeSpamTrash: params.get("includeSpamTrash") === "true",
    },
    resultSizeEstimate:
      typeof listed.resultSizeEstimate === "number"
        ? listed.resultSizeEstimate
        : messages.length,
    messages,
  };
}

function summarizeMetadata(result) {
  const emailMap = new Map();
  return {
    request: result.request,
    resultSizeEstimate: result.resultSizeEstimate,
    messages: result.messages.map((message) => ({
      id: scrubId(message.id, "gmail-msg"),
      threadId: scrubId(message.threadId, "gmail-thread"),
      labelIds: Array.isArray(message.labelIds) ? message.labelIds : [],
      snippet: scrubText(message.snippet, emailMap),
      headers: (message.payload?.headers ?? []).map((header) => ({
        name: header.name,
        value: scrubText(header.value, emailMap),
      })),
    })),
  };
}

function requireAllowedRecipient(to) {
  const allowlist = (process.env.MILADY_GMAIL_REAL_SMOKE_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (!allowlist.includes(to.toLowerCase())) {
    throw new Error(
      "MILADY_GMAIL_REAL_SMOKE_ALLOWLIST must include the exact test recipient before a real Gmail send.",
    );
  }
}

async function sendSmokeEmail(token) {
  if (process.env.MILADY_GMAIL_REAL_SMOKE_SEND !== "1") {
    throw new Error("Set MILADY_GMAIL_REAL_SMOKE_SEND=1 to run a real send.");
  }
  if (process.env.MILADY_ALLOW_REAL_GMAIL_WRITES !== "1") {
    throw new Error("Set MILADY_ALLOW_REAL_GMAIL_WRITES=1 for a real send.");
  }
  const to = process.env.MILADY_GMAIL_REAL_SMOKE_TO?.trim();
  if (!to) {
    throw new Error("MILADY_GMAIL_REAL_SMOKE_TO is required for real send.");
  }
  requireAllowedRecipient(to);
  const runId = `milady-gmail-smoke-${crypto.randomUUID()}`;
  const subject = `Milady Gmail smoke ${runId}`;
  const raw = encodeRawEmail([
    `To: ${to}`,
    `Subject: ${subject}`,
    `X-Milady-Test-Run: ${runId}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    `This is an explicitly enabled Milady Gmail integration smoke email.\nRun ID: ${runId}`,
  ]);
  const sent = await gmailJson("/messages/send", token, {
    method: "POST",
    body: JSON.stringify({ raw }),
  });
  return {
    request: {
      method: "POST",
      path: "/gmail/v1/users/me/messages/send",
      to,
      subject,
      runId,
    },
    response: {
      id: scrubId(sent.id, "gmail-sent"),
      threadId: scrubId(sent.threadId, "gmail-thread"),
      labelIds: Array.isArray(sent.labelIds) ? sent.labelIds : [],
    },
  };
}

async function main() {
  const token = process.env.GOOGLE_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error("GOOGLE_ACCESS_TOKEN is required.");
  }
  const query = readFlag("--query", "in:inbox newer_than:7d");
  const maxResults = Math.min(readNumberFlag("--max", 5), 10);
  const readResult = summarizeMetadata(
    await listMetadata(token, query, maxResults),
  );
  const output = {
    read: readResult,
    send: hasFlag("--send-test") ? await sendSmokeEmail(token) : null,
  };
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
