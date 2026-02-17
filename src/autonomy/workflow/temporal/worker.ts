/**
 * Temporal worker bootstrap for autonomy workflows.
 *
 * @module autonomy/workflow/temporal/worker
 */

import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);

type WorkerConfig = {
  address?: string;
  namespace?: string;
  taskQueue?: string;
};

async function runWorker(config: WorkerConfig = {}): Promise<void> {
  // Lazy-load Temporal worker runtime to keep dependencies optional.
  const { Connection, Worker } = require("@temporalio/worker") as {
    Connection: { connect: (opts: { address?: string }) => Promise<unknown> };
    Worker: {
      create: (opts: {
        connection: unknown;
        namespace: string;
        taskQueue: string;
        workflowsPath: string;
        activities: Record<string, unknown>;
      }) => Promise<{ run: () => Promise<void> }>;
    };
  };

  const workflowsPath = fileURLToPath(
    new URL("./workflows.js", import.meta.url),
  );
  const activities = await import("./activities.js");

  const connection = await Connection.connect({
    address: config.address ?? "localhost:7233",
  });

  const worker = await Worker.create({
    connection,
    namespace: config.namespace ?? "default",
    taskQueue: config.taskQueue ?? "autonomy-tasks",
    workflowsPath,
    activities,
  });

  await worker.run();
}

const isMain =
  pathToFileURL(process.argv[1] ?? "").href === import.meta.url ||
  path.resolve(process.argv[1] ?? "") ===
    path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  runWorker().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[temporal-worker] Fatal error:", err);
    process.exit(1);
  });
}

export { runWorker };
