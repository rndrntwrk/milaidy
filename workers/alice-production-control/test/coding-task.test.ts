import { expect, test } from "bun:test";
import { aliceCodingArgumentHash, prepareAliceCodingTask } from "../src/coding-task";
import type { CapabilityGrant } from "../src/policy";

const digest = (digit: string) => `sha256:${digit.repeat(64)}`;
const request = {
  repository: "Render-Network-OS/555-bot",
  baseCommit: "a".repeat(40),
  prompt: "Repair the Telegram command acknowledgment.",
};

test("coding request matches one exact WebAuthn grant and yields a stable task", async () => {
  const argumentHash = await aliceCodingArgumentHash(request);
  const grant: CapabilityGrant = {
    capabilityId: "cap-00000000-0000-4000-8000-000000000001",
    owner: `owner:${digest("1")}`,
    scope: "coding.patch.sandbox",
    target: request.repository,
    argumentHash,
    nonce: "nonce-00000000-0000-4000-8000-000000000001",
    expiresAt: Date.now() + 60_000,
    rollbackBoundary: "release:test",
    revokedAt: null,
    usedAt: null,
    programDigest: digest("2"),
    releaseDigest: digest("3"),
    policyHash: digest("4"),
  };
  const task = await prepareAliceCodingTask(request, grant);
  expect(task.taskId).toBe(`task-${grant.capabilityId}`);
  expect(task.intent.target).toBe(request.repository);
  expect(task.intent.argumentHash).toBe(argumentHash);
  expect(task.intent.capabilityId).toBe(grant.capabilityId);
  await expect(
    prepareAliceCodingTask({ ...request, prompt: "Different work" }, grant),
  ).rejects.toThrow("CODING_GRANT_MISMATCH");
  await expect(
    prepareAliceCodingTask({ ...request, repository: "rndrntwrk/milaidy" }, grant),
  ).rejects.toThrow("CODING_GRANT_MISMATCH");
  await expect(
    aliceCodingArgumentHash({ ...request, repository: "OtherOrg/private" }),
  ).rejects.toThrow("CODING_REQUEST_INVALID");
});
