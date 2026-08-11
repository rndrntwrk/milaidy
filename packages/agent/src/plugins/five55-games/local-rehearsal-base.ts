/**
 * A local-only rehearsal must not accept a convenient-looking remote endpoint:
 * the same fenced control protocol can move a real run. Keep the operational
 * scope local even when the development process has other Stream555 settings.
 */
export function assertLoopbackRehearsalBase(base: string): void {
  let target: URL;
  try {
    target = new URL(base);
  } catch {
    throw new Error("STREAM555_BASE_URL must be an absolute loopback HTTP(S) URL for local 555Drive rehearsal");
  }
  const hostname = target.hostname.toLowerCase();
  const isLoopback =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]";
  if (
    (target.protocol !== "http:" && target.protocol !== "https:") ||
    !isLoopback ||
    target.username ||
    target.password
  ) {
    throw new Error(
      "STREAM555_BASE_URL must use http(s) on localhost, 127.0.0.1, or [::1] for local 555Drive rehearsal",
    );
  }
}
