import { expect, test } from "bun:test";
import {
  consumeAliceGitHubAgentPat,
  hasAliceGitHubAgentPat,
} from "./alice-github-agent-secret";

test("Alice keeps the agent credential across runtime reloads without process env forwarding", () => {
  const env: Record<string, string | undefined> = {
    GITHUB_AGENT_PAT: " github_pat_example ",
    GITHUB_TOKEN: "broad-token",
    GITHUB_PAT: "legacy-token",
  };
  expect(consumeAliceGitHubAgentPat(env)).toBe("github_pat_example");
  expect("GITHUB_AGENT_PAT" in env).toBe(false);
  expect("GITHUB_TOKEN" in env).toBe(false);
  expect("GITHUB_PAT" in env).toBe(false);
  expect(hasAliceGitHubAgentPat()).toBe(true);
  expect(consumeAliceGitHubAgentPat({})).toBe("github_pat_example");
});
