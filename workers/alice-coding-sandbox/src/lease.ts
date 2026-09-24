import { DurableObject } from "cloudflare:workers";
import { getSandbox } from "@cloudflare/sandbox";
import { authorityDurableName } from "../../alice-production-control/src/durable-names";
import type { ActionIntent, ReleaseAdmission } from "../../alice-production-control/src/policy";

export type AliceCodingSandboxEnv = Env;

type LeaseState = {
  taskId: string;
  argumentHash: string;
  actor: string;
  admission: ReleaseAdmission;
  intent: ActionIntent;
  token: string;
  expiresAt: number;
  useCount: number;
  status: "running" | "done" | "failed";
  failureCode: string | null;
  result: {
    patch: string;
    summary: string;
    changes?: Array<{ path: string; mode: "100644" | "100755"; contentB64: string | null }>;
  } | null;
};

const MAX_MODEL_CALLS = 40;
// Covers bounded preparation plus the eight-minute agent run and cleanup.
const MAX_LEASE_MS = 720_000;

export class AliceCodingLease extends DurableObject<AliceCodingSandboxEnv> {
  private async authorityCode(state: LeaseState): Promise<string | null> {
    if (Date.now() >= state.expiresAt || Date.now() >= state.intent.expiresAt) {
      return "INTENT_EXPIRED";
    }
    try {
      const authority = this.env.ALICE_AUTHORITY.getByName(authorityDurableName());
      const authorization = await authority.fetch("https://alice.internal/authorize", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor: state.actor, request: state.intent }),
      });
      const decision = await authorization.json() as {
        decision?: { allowed?: boolean; code?: string };
      };
      if (!authorization.ok || decision.decision?.allowed !== true ||
        decision.decision.code !== "INTENT_ALREADY_AUTHORIZED") {
        return decision.decision?.code ?? "CODING_AUTHORITY_DENIED";
      }
      const response = await authority.fetch("https://alice.internal/release/check");
      const current = await response.json() as Record<string, unknown>;
      const binding = current.binding as Record<string, unknown> | undefined;
      const release = current.release as Record<string, unknown> | undefined;
      const admitted = state.admission;
      if (!response.ok || current.allowed !== true ||
        current.admissionGeneration !== admitted.admissionGeneration ||
        binding?.programDigest !== admitted.binding.programDigest ||
        binding?.releaseDigest !== admitted.binding.releaseDigest ||
        binding?.policyHash !== admitted.binding.policyHash ||
        release?.deploymentManifestSha256 !== admitted.deploymentManifestSha256) {
        return "RELEASE_ADMISSION_CHANGED";
      }
      return null;
    } catch {
      return "CODING_AUTHORITY_UNAVAILABLE";
    }
  }

  private async deny(state: LeaseState, code: string, cleanup: boolean): Promise<Response> {
    state.status = "failed";
    state.failureCode = code;
    state.token = "";
    await this.ctx.storage.put("state", state);
    if (cleanup) await this.ctx.storage.setAlarm(Date.now() + 1_000);
    else await this.ctx.storage.deleteAlarm();
    return Response.json({ code }, { status: 410 });
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method !== "POST" || !["/start", "/use", "/complete", "/fail"].includes(path)) {
      return new Response("Not found", { status: 404 });
    }
    const body = await request.json() as Record<string, unknown>;
    const existing = await this.ctx.storage.get<LeaseState>("state");
    if (path === "/start") {
      const taskId = body.taskId;
      const argumentHash = body.argumentHash;
      const actor = body.actor;
      const admission = body.admission as ReleaseAdmission | undefined;
      const intent = body.intent as ActionIntent | undefined;
      if (
        typeof taskId !== "string" || !/^task-cap-[a-f0-9-]{36}$/.test(taskId) ||
        typeof argumentHash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(argumentHash) ||
        typeof actor !== "string" || !/^owner:sha256:[a-f0-9]{64}$/.test(actor) ||
        !intent || !["coding.patch.sandbox", "coding.pr.create"].includes(intent.action) ||
        intent.capabilityId !== taskId.slice(5) || intent.argumentHash !== argumentHash ||
        !Number.isSafeInteger(intent.expiresAt) || intent.expiresAt <= Date.now() ||
        !admission || !admission.binding ||
        !Number.isSafeInteger(admission.admissionGeneration) ||
        !/^sha256:[a-f0-9]{64}$/.test(admission.deploymentManifestSha256) ||
        ["programDigest", "releaseDigest", "policyHash"].some((key) =>
          !/^sha256:[a-f0-9]{64}$/.test(admission.binding[key as keyof typeof admission.binding]) ||
          admission.binding[key as keyof typeof admission.binding] !==
            intent[key as keyof typeof admission.binding])
      ) return Response.json({ code: "CODING_LEASE_INVALID" }, { status: 400 });
      if (existing) {
        if (existing.taskId !== taskId || existing.argumentHash !== argumentHash) {
          return Response.json({ code: "CODING_LEASE_COLLISION" }, { status: 409 });
        }
        if (existing.status === "done") {
          return Response.json({ code: "CODING_ALREADY_COMPLETED", result: existing.result });
        }
        if (existing.status === "failed") {
          return Response.json({ code: existing.failureCode ?? "CODING_EXECUTION_FAILED" }, { status: 410 });
        }
        return Response.json({ code: "CODING_ALREADY_STARTED" }, { status: 409 });
      }
      const token = `${taskId}.${crypto.randomUUID()}`;
      const state: LeaseState = {
        taskId, argumentHash, actor, admission, intent, token,
        expiresAt: Math.min(Date.now() + MAX_LEASE_MS, intent.expiresAt),
        useCount: 0, status: "running", failureCode: null, result: null,
      };
      const code = await this.authorityCode(state);
      if (code) return Response.json({ code }, { status: 410 });
      await this.ctx.storage.put("state", state);
      await this.ctx.storage.setAlarm(state.expiresAt);
      return Response.json({ code: "CODING_LEASE_STARTED", token });
    }
    if (existing?.status === "failed" && ["/use", "/complete", "/fail"].includes(path)) {
      return Response.json({ code: existing.failureCode ?? "CODING_TASK_FAILED" }, { status: 410 });
    }
    if (!existing || existing.status !== "running" ||
      body.token !== existing.token || Date.now() >= existing.expiresAt) {
      return Response.json({ code: "CODING_LEASE_DENIED" }, { status: 403 });
    }
    if (path !== "/fail") {
      const code = await this.authorityCode(existing);
      if (code) return this.deny(existing, code, path === "/use");
    }
    if (path === "/use") {
      if (existing.useCount >= MAX_MODEL_CALLS) {
        return this.deny(existing, "CODING_MODEL_LIMIT", true);
      }
      existing.useCount += 1;
      await this.ctx.storage.put("state", existing);
      return Response.json({ code: "CODING_MODEL_ALLOWED" });
    }
    if (path === "/fail") {
      const code = body.code;
      if (typeof code !== "string" || !/^CODING_[A-Z_]{3,80}$/.test(code)) {
        return Response.json({ code: "CODING_LEASE_INVALID" }, { status: 400 });
      }
      existing.status = "failed";
      existing.failureCode = code;
      existing.token = "";
      await this.ctx.storage.put("state", existing);
      await this.ctx.storage.deleteAlarm();
      return Response.json({ code });
    }
    const result = body.result;
    if (!result || typeof result !== "object" || Array.isArray(result) ||
      typeof (result as Record<string, unknown>).patch !== "string" ||
      typeof (result as Record<string, unknown>).summary !== "string" ||
      (existing.intent.action === "coding.pr.create" &&
        !Array.isArray((result as Record<string, unknown>).changes)) ||
      (existing.intent.action === "coding.patch.sandbox" &&
        "changes" in (result as Record<string, unknown>)) ||
      new TextEncoder().encode(JSON.stringify(result)).byteLength > 150_000) {
      return Response.json({ code: "CODING_RESULT_INVALID" }, { status: 400 });
    }
    existing.status = "done";
    existing.result = result as LeaseState["result"];
    existing.token = "";
    await this.ctx.storage.put("state", existing);
    await this.ctx.storage.deleteAlarm();
    return Response.json({ code: "CODING_COMPLETED", result });
  }

  async alarm(): Promise<void> {
    const existing = await this.ctx.storage.get<LeaseState>("state");
    if (!existing || existing.status === "done") return;
    try {
      await getSandbox(this.env.ALICE_CODING_SANDBOX, existing.taskId).destroy();
    } finally {
      if (existing.status === "running") {
        existing.status = "failed";
        existing.failureCode = "CODING_LEASE_EXPIRED";
        existing.token = "";
        await this.ctx.storage.put("state", existing);
      }
    }
  }
}
