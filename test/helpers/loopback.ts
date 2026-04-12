import net from "node:net";

let loopbackAvailabilityPromise: Promise<boolean> | null = null;

function isLoopbackPermissionError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code =
    "code" in error && typeof error.code === "string" ? error.code : "";
  return code === "EPERM" || code === "EACCES";
}

export function canBindLoopback(): Promise<boolean> {
  if (loopbackAvailabilityPromise) {
    return loopbackAvailabilityPromise;
  }

  loopbackAvailabilityPromise = new Promise((resolve) => {
    const server = net.createServer();
    let settled = false;

    const finish = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      server.removeAllListeners();
      resolve(value);
    };

    server.once("error", (error) => {
      finish(!isLoopbackPermissionError(error) ? false : false);
    });

    server.listen(0, "127.0.0.1", () => {
      server.close(() => finish(true));
    });
  });

  return loopbackAvailabilityPromise;
}
