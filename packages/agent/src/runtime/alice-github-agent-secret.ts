let agentPat: string | undefined;

/** Keep Alice's host-injected GitHub credential out of coding child environments. */
export function consumeAliceGitHubAgentPat(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const injected = env.GITHUB_AGENT_PAT?.trim();
  if (injected) agentPat = injected;
  delete env.GITHUB_AGENT_PAT;
  if (agentPat) {
    delete env.GITHUB_TOKEN;
    delete env.GITHUB_PAT;
  }
  return agentPat;
}

export function hasAliceGitHubAgentPat(): boolean {
  return Boolean(agentPat);
}
