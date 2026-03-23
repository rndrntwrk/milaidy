/**
 * Shared result types for operations that can succeed or fail.
 *
 * Replaces ad-hoc `{ ok: true; body } | { ok: false; error }` unions
 * scattered across api/ and security/ modules.
 */

/** A successful result carrying a typed value. */
export interface ResultOk<T> {
  readonly ok: true;
  readonly value: T;
}

/** A failed result carrying a reason code and optional message. */
export interface ResultErr {
  readonly ok: false;
  readonly reason: string;
  readonly message?: string;
}

/**
 * Discriminated union for failable operations.
 *
 * Usage:
 * ```ts
 * function doStuff(): Result<string> {
 *   if (bad) return { ok: false, reason: "not_found" };
 *   return { ok: true, value: "hello" };
 * }
 * ```
 */
export type Result<T> = ResultOk<T> | ResultErr;

/** Convenience constructors. */
export function ok<T>(value: T): ResultOk<T> {
  return { ok: true, value };
}

export function err(reason: string, message?: string): ResultErr {
  return message ? { ok: false, reason, message } : { ok: false, reason };
}
