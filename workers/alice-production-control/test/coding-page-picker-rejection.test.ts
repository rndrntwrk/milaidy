import { expect, test } from "bun:test";
import { codingPageResponse } from "../src/coding-page";

// Executes the released page script with synthetic form data and a rejected
// authenticator call. All fetches are local stubs; no real credential is used.
test("native picker rejection preserves the task and never submits it", async () => {
  const fields = new Map([
    ["repository", "rndrntwrk/milaidy"],
    ["baseCommit", "099411eef37e0283d196821059164909f527979c"],
    ["prompt", "Append the documentation acceptance checklist only."],
    ["pullRequest", "on"],
  ]);
  const originalFields = [...fields];
  const submitButton = { disabled: false };
  const listeners = new Map<string, (event: { preventDefault(): void }) => Promise<void>>();
  const form = {
    querySelector: () => submitButton,
    addEventListener: (name: string, callback: (event: { preventDefault(): void }) => Promise<void>) => listeners.set(name, callback),
  };
  const status = { textContent: "" };
  const result = { textContent: "" };
  const nodes = {
    task: form, status, result,
    history: { replaceChildren() {} },
    register: { addEventListener() {} },
  };
  const document = { getElementById: (id: keyof typeof nodes) => nodes[id] };
  const calls: Array<{ path: string; method: string; body: unknown }> = [];
  const fetcher = async (path: string, init?: RequestInit) => {
    calls.push({ path, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
    if (!init && path === "/control/api/v1/coding/tasks") return Response.json({ ok: true, tasks: [] });
    if (init?.method === "POST" && path === "/control/api/v1/webauthn/approve/options") {
      return Response.json({ ok: true, options: { rpId: "alice.rndrntwrk.com", challenge: "synthetic" } });
    }
    throw new Error("Unexpected network operation: " + path);
  };
  const storage = new Map([["existing-marker", "preserve"]]);
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  };
  const publicKey = {
    parseCreationOptionsFromJSON: (options: unknown) => options,
    parseRequestOptionsFromJSON: (options: unknown) => options,
  };
  let credentialCalls = 0;
  const navigator = { credentials: { async get() {
    credentialCalls++;
    throw new DOMException("No matching authenticator credential", "NotAllowedError");
  } } };
  class TestFormData { get(key: string) { return fields.get(key) ?? null; } }
  const script = await codingPageResponse("/control/coding.js")!.text();
  new Function("document", "fetch", "window", "navigator", "localStorage", "PublicKeyCredential", "FormData", script)(
    document, fetcher, { PublicKeyCredential: publicKey }, navigator, localStorage, publicKey, TestFormData,
  );
  // Let the page's initial read-only task-list request finish.
  await Promise.resolve();
  await Promise.resolve();
  let prevented = false;
  await listeners.get("submit")!({ preventDefault() { prevented = true; } });
  expect(prevented).toBe(true);
  expect(credentialCalls).toBe(1);
  expect(calls.filter((call) => call.method === "POST")).toEqual([{
    path: "/control/api/v1/webauthn/approve/options", method: "POST",
    body: { request: {
      repository: fields.get("repository"), baseCommit: fields.get("baseCommit"),
      prompt: fields.get("prompt"), delivery: "pull-request",
    } },
  }]);
  expect(calls.some((call) => call.path.endsWith("approve/verify"))).toBe(false);
  expect(calls.some((call) => call.path === "/control/api/v1/coding/tasks" && call.method === "POST")).toBe(false);
  expect([...fields]).toEqual(originalFields);
  expect([...storage]).toEqual([["existing-marker", "preserve"]]);
  expect(submitButton.disabled).toBe(false);
  expect(status.textContent).toBe("No matching authenticator credential");
});
