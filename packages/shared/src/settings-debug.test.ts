import { expect, test } from "bun:test";
import { sanitizeForSettingsDebug } from "./settings-debug";

test("settings debug never prints a GitHub agent PAT in full", () => {
  const credential = "github_pat_example_scoped_agent_credential";
  const output = JSON.stringify(
    sanitizeForSettingsDebug({
      env: { vars: { GITHUB_AGENT_PAT: credential } },
    }),
  );
  expect(output).not.toContain(credential);
});
