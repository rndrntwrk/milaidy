import { DurableObject } from "cloudflare:workers";
import { getSandbox } from "@cloudflare/sandbox";

export type AliceCodingSandboxEnv = Env;

type LeaseState = {
  taskId: string;
  argumentHash: string;
  token: string;
  expiresAt: number;
  useCount: number;
  status: "running" | "done" | "failed";
  failureCode: string | null;
  result: { patch: string; summary: string } | null;
};

const MAX_MODEL_CALLS = 40;
// Covers bounded preparation plus the eight-minute agent run and cleanup.
const MAX_LEASE_MS = 720_000;

export class AliceCodingLease extends DurableObject<AliceCodingSandboxEnv> {
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
      if (
        typeof taskId !== "string" || !/^task-cap-[a-f0-9-]{36}$/.test(taskId) ||
        typeof argumentHash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(argumentHash)
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
        taskId, argumentHash, token,
        expiresAt: Date.now() + MAX_LEASE_MS,
        useCount: 0, status: "running", failureCode: null, result: null,
      };
      await this.ctx.storage.put("state", state);
      await this.ctx.storage.setAlarm(state.expiresAt);
      return Response.json({ code: "CODING_LEASE_STARTED", token });
    }
    if (!existing || existing.status !== "running" ||
      body.token !== existing.token || Date.now() >= existing.expiresAt) {
      return Response.json({ code: "CODING_LEASE_DENIED" }, { status: 403 });
    }
    if (path === "/use") {
      if (existing.useCount >= MAX_MODEL_CALLS) {
        return Response.json({ code: "CODING_MODEL_LIMIT" }, { status: 429 });
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
    if (!existing || existing.status !== "running") return;
    try {
      await getSandbox(this.env.ALICE_CODING_SANDBOX, existing.taskId).destroy();
    } finally {
      existing.status = "failed";
      existing.failureCode = "CODING_LEASE_EXPIRED";
      existing.token = "";
      await this.ctx.storage.put("state", existing);
    }
  }
}
