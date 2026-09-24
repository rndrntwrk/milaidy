import { ContainerProxy, getSandbox, Sandbox } from "@cloudflare/sandbox";
import {
  aliceCodingArgumentHash,
  parseAliceCodingRequest,
} from "../../alice-production-control/src/coding-task";
import type { ActionIntent, ReleaseAdmission } from "../../alice-production-control/src/policy";
import { AliceCodingLease, type AliceCodingSandboxEnv } from "./lease";

export { AliceCodingLease, ContainerProxy };

const MODEL = "workers-ai/@cf/openai/gpt-oss-120b";
const TASK_ID = /^task-cap-[a-f0-9-]{36}$/;
const MAX_PATCH_BYTES = 128_000;
const MAX_CHANGE_BYTES = 110_000;
const MAX_CHANGED_FILES = 25;

type CodingChange = { path: string; mode: "100644" | "100755"; contentB64: string | null };

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function validChangedPath(path: string): boolean {
  return path.length > 0 && path.length <= 255 &&
    !/[\u0000-\u001f\u007f]/.test(path) &&
    !path.startsWith("/") &&
    path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

async function collectChanges(sandbox: ReturnType<typeof getSandbox>): Promise<CodingChange[]> {
  const listing = await sandbox.exec(
    "cd /workspace/repo && git -c diff.renames=false diff --cached --raw -z HEAD | base64 > /workspace/changes.b64",
    { timeout: 30_000 },
  );
  if (!listing.success) throw new Error("CODING_CHANGE_LIST_FAILED");
  const encoded = (await sandbox.readFile("/workspace/changes.b64")).content.replace(/\s/g, "");
  const binary = atob(encoded);
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  );
  const fields = raw.split("\0");
  if (fields.at(-1) !== "") throw new Error("CODING_CHANGE_LIST_INVALID");
  fields.pop();
  if (fields.length === 0 || fields.length % 2 !== 0 ||
    fields.length / 2 > MAX_CHANGED_FILES) throw new Error("CODING_CHANGE_LIST_INVALID");
  const changes: CodingChange[] = [];
  for (let index = 0; index < fields.length; index += 2) {
    const metadata = /^:(\d{6}) (\d{6}) [a-f0-9]+ [a-f0-9]+ ([AMD])$/.exec(fields[index]!);
    const path = fields[index + 1]!;
    if (!metadata || !validChangedPath(path) ||
      !["100644", "100755"].includes(metadata[3] === "D" ? metadata[1]! : metadata[2]!)) {
      throw new Error("CODING_CHANGE_LIST_INVALID");
    }
    const mode = (metadata[3] === "D" ? metadata[1] : metadata[2]) as CodingChange["mode"];
    let contentB64: string | null = null;
    if (metadata[3] !== "D") {
      const output = `/workspace/change-${index / 2}.b64`;
      const blob = await sandbox.exec(
        `cd /workspace/repo && git show ${shellQuote(`:${path}`)} | base64 > ${output}`,
        { timeout: 30_000 },
      );
      if (!blob.success) throw new Error("CODING_CHANGE_READ_FAILED");
      const encodedBlob = (await sandbox.readFile(output)).content.replace(/\s/g, "");
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encodedBlob)) {
        throw new Error("CODING_CHANGE_READ_FAILED");
      }
      contentB64 = encodedBlob;
    }
    changes.push({ path, mode, contentB64 });
    if (new TextEncoder().encode(JSON.stringify(changes)).byteLength > MAX_CHANGE_BYTES) {
      throw new Error("CODING_CHANGE_SET_TOO_LARGE");
    }
  }
  return changes;
}

export class AliceCodingSandbox extends Sandbox {
  enableInternet = false;
  allowedHosts = ["alice-model.internal"];
}

AliceCodingSandbox.outboundByHost = {
  "alice-model.internal": async (request: Request, env: AliceCodingSandboxEnv) => {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/v1/chat/completions") {
      return new Response("Denied", { status: 403 });
    }
    const presented = request.headers.get("authorization") ?? "";
    const token = presented.startsWith("Bearer ") ? presented.slice(7) : "";
    const taskId = token.split(".")[0] ?? "";
    if (!TASK_ID.test(taskId) || !/^task-cap-[a-f0-9-]{36}\.[a-f0-9-]{36}$/.test(token)) {
      return new Response("Denied", { status: 403 });
    }
    const lease = env.ALICE_CODING_LEASE.getByName(taskId);
    const use = await lease.fetch("https://alice-coding.internal/use", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!use.ok) return new Response("Coding model lease denied", { status: use.status });
    const upstream = new Request("https://alice-runtime-host.internal/internal/v1/coding/model", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: request.body,
    });
    return env.ALICE_RUNTIME_HOST.fetch(upstream);
  },
};

type CodingInput = {
  schemaVersion: "alice.coding-execution.v1";
  taskId: string;
  actor: string;
  admission: ReleaseAdmission;
  request: unknown;
  intent: ActionIntent;
};

async function parseInput(request: Request): Promise<CodingInput & {
  request: ReturnType<typeof parseAliceCodingRequest>;
}> {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 24_000) {
    throw new Error("CODING_REQUEST_INVALID");
  }
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CODING_REQUEST_INVALID");
  }
  const input = value as CodingInput;
  const coding = parseAliceCodingRequest(input.request);
  const argumentHash = await aliceCodingArgumentHash(coding);
  if (
    input.schemaVersion !== "alice.coding-execution.v1" ||
    !TASK_ID.test(input.taskId) ||
    !/^owner:sha256:[a-f0-9]{64}$/.test(input.actor) ||
    !["coding.patch.sandbox", "coding.pr.create"].includes(input.intent?.action) ||
    (coding.delivery === "pull-request") !== (input.intent?.action === "coding.pr.create") ||
    input.intent.capabilityId !== input.taskId.slice(5) ||
    input.intent.target !== coding.repository ||
    input.intent.argumentHash !== argumentHash ||
    !input.admission ||
    !/^sha256:[a-f0-9]{64}$/.test(input.admission.deploymentManifestSha256) ||
    !Number.isSafeInteger(input.admission.admissionGeneration) ||
    input.admission.admissionGeneration < 1 ||
    !input.admission.binding ||
    ["programDigest", "releaseDigest", "policyHash"].some((key) =>
      !/^sha256:[a-f0-9]{64}$/.test(input.admission.binding[key as keyof typeof input.admission.binding]) ||
      input.admission.binding[key as keyof typeof input.admission.binding] !==
        input.intent[key as keyof typeof input.admission.binding]) ||
    !Number.isSafeInteger(input.intent.expiresAt) ||
    input.intent.expiresAt <= Date.now()
  ) throw new Error("CODING_REQUEST_INVALID");
  return { ...input, request: coding };
}

async function leaseCall(
  env: AliceCodingSandboxEnv,
  taskId: string,
  path: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return env.ALICE_CODING_LEASE.getByName(taskId).fetch(
    `https://alice-coding.internal${path}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  );
}

async function runCodingTask(input: Awaited<ReturnType<typeof parseInput>>,
  env: AliceCodingSandboxEnv): Promise<Response> {
  const start = await leaseCall(env, input.taskId, "/start", {
    taskId: input.taskId, argumentHash: input.intent.argumentHash,
    actor: input.actor, admission: input.admission, intent: input.intent,
  });
  const state = await start.json() as Record<string, unknown>;
  if (state.code === "CODING_ALREADY_COMPLETED") {
    return Response.json({ ok: true, taskId: input.taskId, result: state.result });
  }
  if (!start.ok || typeof state.token !== "string") {
    return Response.json({ ok: false, code: state.code }, { status: start.status });
  }
  const sandbox = getSandbox(env.ALICE_CODING_SANDBOX, input.taskId);
  let result: { patch: string; summary: string; changes?: CodingChange[] } | null = null;
  let failure: unknown = null;
  let destroyed = false;
  try {
    if (input.intent.expiresAt - Date.now() < 120_000) {
      throw new Error("CODING_APPROVAL_NEAR_EXPIRY");
    }
    const archiveUrl = new URL("https://alice-runtime-host.internal/internal/v1/coding/archive");
    archiveUrl.searchParams.set("repository", input.request.repository);
    archiveUrl.searchParams.set("baseCommit", input.request.baseCommit);
    const archive = await env.ALICE_RUNTIME_HOST.fetch(new Request(archiveUrl));
    if (!archive.ok || !archive.body) throw new Error("CODING_ARCHIVE_UNAVAILABLE");
    await sandbox.mkdir("/workspace/repo", { recursive: true });
    await sandbox.writeFile("/workspace/source.tar.gz", archive.body);
    const unpack = await sandbox.exec(
      "tar -xzf /workspace/source.tar.gz -C /workspace/repo --strip-components=1 && cd /workspace/repo && git init -q && git add -A && git -c user.name=Alice -c user.email=alice@rndrntwrk.com commit -qm base",
      { timeout: 120_000 },
    );
    if (!unpack.success) throw new Error("CODING_SOURCE_PREPARATION_FAILED");
    await sandbox.writeFile("/workspace/prompt.txt", input.request.prompt);
    await sandbox.writeFile("/workspace/opencode.json", JSON.stringify({
      provider: {
        alice: {
          npm: "@ai-sdk/openai-compatible",
          name: "Alice model gateway",
          options: {
            baseURL: "http://alice-model.internal/v1",
            apiKey: state.token,
          },
          models: { [MODEL]: { name: MODEL, limit: { context: 32_000, output: 4096 } } },
        },
      },
    }));
    const runBudgetMs = Math.min(480_000, input.intent.expiresAt - Date.now() - 45_000);
    if (runBudgetMs < 30_000) throw new Error("CODING_APPROVAL_NEAR_EXPIRY");
    const run = await sandbox.exec(
      `cd /workspace/repo && OPENCODE_CONFIG=/workspace/opencode.json opencode run --model alice/${MODEL} "$(cat /workspace/prompt.txt)"`,
      { timeout: runBudgetMs },
    );
    if (!run.success) throw new Error("CODING_AGENT_FAILED");
    const diff = await sandbox.exec(
      "cd /workspace/repo && git add -A && git diff --cached --binary HEAD > /workspace/patch.diff && wc -c < /workspace/patch.diff",
      { timeout: 30_000 },
    );
    const patchBytes = Number(diff.stdout.trim());
    if (!diff.success || !Number.isSafeInteger(patchBytes) || patchBytes > MAX_PATCH_BYTES) {
      throw new Error("CODING_PATCH_TOO_LARGE");
    }
    const patch = await sandbox.readFile("/workspace/patch.diff");
    result = input.intent.action === "coding.pr.create"
      ? { patch: "", summary: run.stdout.slice(-2_000),
          changes: await collectChanges(sandbox) }
      : { patch: patch.content, summary: run.stdout.slice(-2_000) };
  } catch (error) {
    failure = error;
  } finally {
    try {
      await sandbox.destroy();
      destroyed = true;
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure) {
    const code = failure instanceof Error && /^CODING_[A-Z_]{3,80}$/.test(failure.message)
      ? failure.message : "CODING_EXECUTION_FAILED";
    if (destroyed) {
      const failed = await leaseCall(env, input.taskId, "/fail", { token: state.token, code });
      if (!failed.ok && failed.status !== 410) throw new Error("CODING_LEASE_FINALIZATION_FAILED");
      const failureState = await failed.json() as { code?: string };
      return Response.json({ ok: false, code: failureState.code ?? code }, { status: 410 });
    }
    throw new Error(code);
  }
  if (!result) throw new Error("CODING_RESULT_MISSING");
  const completed = await leaseCall(env, input.taskId, "/complete", {
    token: state.token, result,
  });
  if (completed.status === 410) {
    const rejected = await completed.json() as { code?: string };
    return Response.json({ ok: false, code: rejected.code ?? "CODING_TASK_FAILED" }, { status: 410 });
  }
  if (!completed.ok) throw new Error("CODING_RESULT_PERSIST_FAILED");
  return Response.json({ ok: true, taskId: input.taskId, result });
}

export default {
  async fetch(request: Request, env: AliceCodingSandboxEnv): Promise<Response> {
    if (request.method !== "POST" ||
      new URL(request.url).pathname !== "/internal/v1/coding/execute") {
      return new Response("Not found", { status: 404 });
    }
    try {
      return await runCodingTask(await parseInput(request), env);
    } catch (error) {
      const code = error instanceof Error && error.message.startsWith("CODING_")
        ? error.message : "CODING_EXECUTION_UNAVAILABLE";
      return Response.json({ ok: false, code }, { status: 503 });
    }
  },
};
