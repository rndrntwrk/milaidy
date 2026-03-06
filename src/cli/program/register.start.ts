import type { Command } from "commander";
import { formatDocsLink } from "../../terminal/links";
import { theme } from "../../terminal/theme";
import { runCommandWithRuntime } from "../cli-utils";

const defaultRuntime = { error: console.error, exit: process.exit };

async function startAction() {
  await runCommandWithRuntime(defaultRuntime, async () => {
    const { startEliza } = await import("../../runtime/eliza");
    const { startApiServer } = await import("../../api/server");
    const runtime = await startEliza({ headless: true });
    const apiPort = Number(process.env.MILAIDY_PORT) || 2138;
    await startApiServer({ port: apiPort, runtime });
  });
}

export function registerStartCommand(program: Command) {
  program
    .command("start")
    .description("Start the ElizaOS agent runtime")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/getting-started", "docs.milady.ai/getting-started")}\n`,
    )
    .action(startAction);

  program.command("run").description("Alias for start").action(startAction);
}
