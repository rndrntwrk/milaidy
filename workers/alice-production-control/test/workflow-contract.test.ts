import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("Alice plan workflow execution semantics", () => {
  test("reports durable queue handoff without falsely claiming execution", () => {
    const source = readFileSync(
      new URL("../src/workflow.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain('state: "waiting"');
    expect(source).toContain('status: "queued-for-execution"');
    expect(source).toContain("ALICE_WORK_QUEUE.send");
    expect(source).toContain("buildAlicePlanExecutionRecords(plan, decisions)");
    expect(source).toContain("completed: false");
    expect(source).not.toContain('state: "completed"');
    expect(source).not.toContain("completed: true");
    const handoff = source.slice(
      source.indexOf('step.do("persist and enqueue authorized durable work"'),
      source.indexOf("catch (error)"),
    );
    expect(handoff.indexOf("state.applyAtomic")).toBeLessThan(
      handoff.indexOf('callJson(authority, "/session/mutate"'),
    );
    expect(handoff.indexOf('callJson(authority, "/session/mutate"')).toBeLessThan(
      handoff.indexOf("this.env.ALICE_WORK_QUEUE.send"),
    );
  });

  test("persists a terminal failed checkpoint when authorization or evidence fails", () => {
    const source = readFileSync(
      new URL("../src/workflow.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain('state: "failed"');
    expect(source).toContain('"persist failed authorization checkpoint"');
    expect(source).toContain("catch (error)");
    expect(source).toContain('callJson(authority, "/session/task/terminal"');
    const waiting = source.indexOf('state: "waiting"');
    const failureHandler = source.indexOf("catch (error)");
    expect(waiting).toBeGreaterThan(source.indexOf("try {"));
    expect(waiting).toBeLessThan(failureHandler);
  });

  test("routes terminal-only Workflow closure outside current admission gating", () => {
    const durable = readFileSync(
      new URL("../src/durable.ts", import.meta.url),
      "utf8",
    );
    const terminalRouteStart = durable.indexOf(
      'url.pathname === "/session/task/terminal"',
    );
    const admittedSessionRouteStart = durable.indexOf(
      'url.pathname === "/session/context"',
    );
    expect(terminalRouteStart).toBeGreaterThan(0);
    expect(admittedSessionRouteStart).toBeGreaterThan(terminalRouteStart);
    const terminalRoute = durable.slice(
      terminalRouteStart,
      admittedSessionRouteStart,
    );
    expect(terminalRoute).toContain("validReleaseAdmission(body.expectedAdmission)");
    expect(terminalRoute).toContain('callSession(session, "/task/terminal"');
    expect(terminalRoute).toContain("sessionDurableName(");
    expect(terminalRoute).not.toContain("requireExpectedAdmission");
    expect(terminalRoute).not.toContain("loadRuntimeConfig");
    expect(terminalRoute).not.toContain("/binding/rebind");
  });

  test("uses byte-identical evidence timestamps across Workflow callback retries", () => {
    const source = readFileSync(
      new URL("../src/workflow.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("new Date(plan.requestedAt + index).toISOString()");
    expect(source).not.toContain("occurredAt: new Date().toISOString()");
  });

  test("makes accepted-plan creation evidence a deterministic retried Workflow step", () => {
    const workflow = readFileSync(
      new URL("../src/workflow.ts", import.meta.url),
      "utf8",
    );
    const ingress = readFileSync(
      new URL("../src/index.ts", import.meta.url),
      "utf8",
    );
    expect(workflow).toContain('step.do("capture accepted plan evidence"');
    expect(workflow).toContain("evt-plan-created-");
    expect(workflow).toContain("new Date(plan.requestedAt).toISOString()");
    expect(workflow.indexOf('step.do("validate signed release and low-risk plan"')).toBeLessThan(
      workflow.indexOf('step.do("capture accepted plan evidence"'),
    );
    const createRoute = ingress.slice(
      ingress.indexOf('path === "/control/api/v1/plans"'),
      ingress.indexOf("if (sessionMatch", ingress.indexOf('path === "/control/api/v1/plans"')),
    );
    expect(createRoute).toContain('callDurable(authority, "/plan/create"');
    expect(createRoute).not.toContain("ALICE_PLANS.create");
    expect(createRoute).not.toContain("queueEvidence(");
  });

  test("checkpoints signed admission so expiry cannot hide a running task's recovery", () => {
    const source = readFileSync(
      new URL("../src/workflow.ts", import.meta.url),
      "utf8",
    );
    const validationStep = source.match(
      /step\.do\("validate signed release and low-risk plan"[\s\S]*?return \{ admitted: true \};\n    \}\);/m,
    )?.[0] ?? "";
    expect(validationStep).toContain("loadRuntimeConfig(this.env)");
    expect(source.indexOf("loadRuntimeConfig(this.env)")).toBeGreaterThan(
      source.indexOf('step.do("validate signed release and low-risk plan"'),
    );
    expect(source).not.toContain("ALICE_SESSIONS.getByName");
    expect(source).toContain('callJson(authority, "/release/check"');
    expect(source).toContain('callJson(authority, "/session/mutate"');
    expect(source).toContain("deploymentManifestSha256: plan.deploymentManifestSha256");
    expect(source).toContain("admissionGeneration: plan.admissionGeneration");
    expect(source.indexOf('callJson(authority, "/release/check"')).toBeLessThan(
      source.indexOf('step.do("capture accepted plan evidence"'),
    );
  });
});
