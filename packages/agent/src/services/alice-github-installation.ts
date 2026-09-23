import { createPrivateKey } from "node:crypto";
import { createRequire } from "node:module";
import { type IAgentRuntime, Service } from "@elizaos/core";
import { createAppAuth } from "@octokit/auth-app";
import type {
  GitCredential,
  GitHubProvider as GitHubProviderType,
} from "git-workspace-service";

const { GitHubProvider } = createRequire(import.meta.url)(
  "git-workspace-service",
) as typeof import("git-workspace-service");

export const ALICE_GITHUB_INSTALLATION_SERVICE = "ALICE_GITHUB_INSTALLATION";

type SigningMaterial = { appId: string; privateKey: string };
let signingMaterial: SigningMaterial | undefined;

/** Remove the App key from ambient process state before coding children start. */
export function captureAliceGitHubAppSigningMaterial(
  env: Record<string, string | undefined> = process.env,
): void {
  const appId = env.GITHUB_APP_ID?.trim();
  const encodedKey = env.GITHUB_APP_PRIVATE_KEY_B64?.trim();
  delete env.GITHUB_APP_ID;
  delete env.GITHUB_APP_PRIVATE_KEY_B64;
  if (!appId && !encodedKey) return;
  if (!appId || !encodedKey || !/^\d+$/.test(appId)) {
    throw new Error("Alice GitHub App credentials are incomplete");
  }
  const privateKey = Buffer.from(encodedKey, "base64").toString("utf8");
  createPrivateKey(privateKey); // Reject malformed credentials before runtime startup.
  signingMaterial = { appId, privateKey };
}

/** Owns the trusted App provider; installation tokens stay scoped to each repository. */
export class AliceGitHubInstallationService extends Service {
  static override serviceType = ALICE_GITHUB_INSTALLATION_SERVICE;
  override capabilityDescription =
    "Repository-scoped GitHub App credentials for coding";

  private readonly provider: GitHubProviderType | null;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
    this.provider = signingMaterial
      ? new GitHubProvider(signingMaterial)
      : null;
  }

  static async start(
    runtime: IAgentRuntime,
  ): Promise<AliceGitHubInstallationService> {
    return new AliceGitHubInstallationService(runtime);
  }

  getProvider(): GitHubProviderType | null {
    return this.provider;
  }

  async credentialForRepository(
    repo: string,
    access: "read" | "write",
  ): Promise<GitCredential> {
    if (!this.provider) throw new Error("Alice GitHub App is not configured");
    const [owner, name] = this.parseRepository(repo);
    return this.provider.getCredentialsForRepo(owner, name, access);
  }

  async tokenForPullRequestGroundTruth(repo: string): Promise<string> {
    return this.mintScopedToken(repo, {
      contents: "read",
      pull_requests: "read",
      checks: "read",
      statuses: "read",
      metadata: "read",
    });
  }

  async tokenForIssues(
    repo: string,
    access: "read" | "write",
  ): Promise<string> {
    return this.mintScopedToken(repo, { issues: access, metadata: "read" });
  }

  private async mintScopedToken(
    repo: string,
    permissions: Record<string, "read" | "write">,
  ): Promise<string> {
    if (!this.provider || !signingMaterial) {
      throw new Error("Alice GitHub App is not configured");
    }
    const [owner, name] = this.parseRepository(repo);
    await this.provider.initialize();
    const installation = this.provider.getInstallationForRepo(owner, name);
    if (!installation) {
      throw new Error(`No GitHub App installation found for ${owner}/${name}`);
    }
    const auth = createAppAuth(signingMaterial);
    const { token } = await auth({
      type: "installation",
      installationId: installation.installationId,
      repositoryNames: [name],
      permissions,
    });
    return token;
  }

  private parseRepository(repo: string): [string, string] {
    const match = repo.match(
      /^(?:https:\/\/github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/i,
    );
    if (
      !match ||
      match[1] === "." ||
      match[1] === ".." ||
      match[2] === "." ||
      match[2] === ".."
    ) {
      throw new Error(
        "Alice GitHub App requires an exact GitHub owner/repository",
      );
    }
    return [match[1], match[2]];
  }

  override async stop(): Promise<void> {}
}
