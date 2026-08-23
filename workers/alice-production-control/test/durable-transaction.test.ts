import { describe, expect, test } from "bun:test";

import { commitCopyOnWrite } from "../src/durable-transaction";
import { SessionLedger } from "../src/session";
import { AuthorityLedger } from "../src/authority";

type Counter = { value: number };

describe("Durable Object copy-on-write persistence", () => {
  test("does not publish mutated in-memory state when storage fails", async () => {
    const current: Counter = { value: 0 };
    await expect(
      commitCopyOnWrite(
        current,
        (state) => structuredClone(state),
        (candidate) => {
          candidate.value += 1;
          return { ok: true, code: "UPDATED" } as const;
        },
        async () => {
          throw new Error("injected storage failure");
        },
        (result) => result.code === "UPDATED",
      ),
    ).rejects.toThrow("injected storage failure");
    expect(current).toEqual({ value: 0 });
  });

  test("publishes the candidate only after persistence and retries one real write", async () => {
    let visible: Counter = { value: 0 };
    const persisted: Counter[] = [];
    const firstAttempt = commitCopyOnWrite(
      visible,
      (state) => structuredClone(state),
      (candidate) => {
        candidate.value += 1;
        return { ok: true, code: "UPDATED" } as const;
      },
      async () => {
        throw new Error("injected storage failure");
      },
      (result) => result.code === "UPDATED",
    );
    await expect(firstAttempt).rejects.toThrow("injected storage failure");

    const retry = await commitCopyOnWrite(
      visible,
      (state) => structuredClone(state),
      (candidate) => {
        candidate.value += 1;
        return { ok: true, code: "UPDATED" } as const;
      },
      async (candidate) => {
        persisted.push(structuredClone(candidate));
      },
      (result) => result.code === "UPDATED",
    );
    visible = retry.state;
    expect(persisted).toEqual([{ value: 1 }]);
    expect(visible).toEqual({ value: 1 });
  });

  test("keeps a warm session on its old binding when renewal persistence fails", async () => {
    const binding = {
      programDigest: `sha256:${"1".repeat(64)}`,
      releaseDigest: `sha256:${"2".repeat(64)}`,
      policyHash: `sha256:${"3".repeat(64)}`,
    };
    const renewed = { ...binding, programDigest: `sha256:${"9".repeat(64)}` };
    const visible = SessionLedger.create("owner-warm-session", binding);
    await expect(
      commitCopyOnWrite(
        visible,
        (ledger) =>
          SessionLedger.restoreStored(
            ledger.exportState(),
            "owner-warm-session",
            binding.releaseDigest,
          ),
        (candidate) => candidate.rebind(renewed),
        async () => {
          throw new Error("injected renewal storage failure");
        },
        (result) => result.code === "SESSION_BINDING_RENEWED",
      ),
    ).rejects.toThrow("injected renewal storage failure");
    expect(visible.snapshot().binding).toEqual(binding);
  });

  test("does not publish an oversized non-evidence authority mutation", async () => {
    const binding = {
      programDigest: `sha256:${"1".repeat(64)}`,
      releaseDigest: `sha256:${"2".repeat(64)}`,
      policyHash: `sha256:${"3".repeat(64)}`,
    };
    const visible = AuthorityLedger.create(binding, 100);
    await expect(
      commitCopyOnWrite(
        visible,
        (ledger) => AuthorityLedger.restoreGlobal(ledger.exportState(), 100),
        (candidate) => {
          for (let index = 0; index < 3_000; index += 1) {
            const suffix = index.toString().padStart(5, "0");
            candidate.authorize(
              {
                intentId: `intent-oversize-${suffix}`,
                action: "research.read",
                target: "source:deployment-handoff",
                argumentHash: `sha256:${"4".repeat(64)}`,
                nonce: `nonce-oversize-${suffix}`,
                expiresAt: 1_787_400_060_000,
                ...binding,
              },
              1_787_400_000_000,
            );
          }
          return { ok: true, code: "UPDATED" } as const;
        },
        async (candidate) => {
          candidate.assertPersistable();
        },
        (result) => result.code === "UPDATED",
      ),
    ).rejects.toThrow("AUTHORITY_LEDGER_FULL");
    expect(visible.snapshot().consumedNonceCount).toBe(0);
  });
});
