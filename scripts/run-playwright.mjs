import { spawn } from "node:child_process";

const [, , cwd, ...playwrightArgs] = process.argv;

if (!cwd || playwrightArgs.length === 0) {
  console.error(
    "Usage: node scripts/run-playwright.mjs <cwd> <playwright args...>",
  );
  process.exit(1);
}

const env = { ...process.env };
delete env.NO_COLOR;
delete env.FORCE_COLOR;
delete env.CLICOLOR_FORCE;

const bunxCommand = process.platform === "win32" ? "bunx.cmd" : "bunx";
const child = spawn(bunxCommand, ["playwright", ...playwrightArgs], {
  cwd,
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
