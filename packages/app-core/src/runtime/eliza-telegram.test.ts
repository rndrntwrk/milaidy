import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, test } from "vitest";

test("boot repair leaves configured Telegram transport to policy-selected plugin services", async () => {
  const source = readFileSync(new URL("./eliza.ts", import.meta.url), "utf8");
  const parsed = ts.createSourceFile(
    "eliza.ts",
    source,
    ts.ScriptTarget.Latest,
  );
  const repair = parsed.statements.find(
    (statement) =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === "repairRuntimeAfterBoot",
  );
  if (!repair) throw new Error("Runtime boot repair function missing");
  const executable = ts.transpile(repair.getText(parsed), {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.None,
  });
  const runtime = {
    plugins: [],
    getService: () => ({ enableAutonomy: async () => {} }),
  };
  let unmanagedPollers = 0;
  // Execute the real repair body without booting SQL, models, or a transport.
  // The unselected poller must not be called even with credentials available.
  const runRepair = runInNewContext(`${executable}\nrepairRuntimeAfterBoot`, {
    runtimeStartupFields: () => ({}),
    withStartupPhase: async (
      _name: string,
      _fields: object,
      run: () => unknown,
    ) => run(),
    ensureRuntimeSqlCompatibility: async () => {},
    logStartupCorpusSnapshot: async () => {},
    ensureMiladyTextToSpeechHandler: async () => {},
    ensureAutonomyBootstrapContext: async () => {},
    logger: { info() {}, warn() {} },
    process: { env: { TELEGRAM_BOT_TOKEN: "test-only-unselected-token" } },
    ensureTelegramBotPolling: async () => {
      unmanagedPollers++;
    },
  });
  expect(await runRepair(runtime)).toBe(runtime);
  expect(unmanagedPollers).toBe(0);
});
