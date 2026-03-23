/**
 * Loopback port allocation for the Electrobun embedded agent.
 *
 * **Why this exists:** the desktop shell used to run `lsof` + SIGKILL on the
 * preferred `MILADY_PORT` before spawn so a crashed child would “release” the
 * port. That also killed **unrelated** listeners (e.g. a second Milady with its
 * own state dir). We now **probe** 127.0.0.1:preferred, preferred+1, … and pass
 * the first free port to `entry.js start`.
 *
 * **Why bind-then-close:** a TCP listen check is portable (macOS/Linux/Windows)
 * and races only briefly with another process grabbing the same port between
 * probe and child bind—acceptable for local dev and desktop; the child’s stdout
 * + health poll still reconcile the final bind.
 */

import { createServer } from "node:net";

function tryBindOnce(
  port: number,
  host: string,
): Promise<{ ok: true } | { ok: false }> {
  return new Promise((resolve) => {
    const server = createServer();
    const fail = () => {
      server.removeAllListeners();
      resolve({ ok: false });
    };
    server.once("error", fail);
    server.listen({ port, host }, () => {
      server.close(() => resolve({ ok: true }));
    });
  });
}

/**
 * Returns the first port in `[preferred, preferred+1, …)` that can be bound
 * on `host`, or throws if none found within `maxHops` attempts.
 */
export async function findFirstAvailableLoopbackPort(
  preferred: number,
  options?: { host?: string; maxHops?: number },
): Promise<number> {
  const host = options?.host ?? "127.0.0.1";
  const maxHops = options?.maxHops ?? 64;
  if (!Number.isFinite(preferred) || preferred < 1 || preferred > 65535) {
    throw new Error(`Invalid preferred port: ${preferred}`);
  }
  for (let i = 0; i < maxHops; i++) {
    const port = preferred + i;
    if (port > 65535) break;
    const result = await tryBindOnce(port, host);
    if (result.ok) {
      return port;
    }
  }
  throw new Error(
    `No free TCP port on ${host} in range ${preferred}–${preferred + maxHops - 1}`,
  );
}
