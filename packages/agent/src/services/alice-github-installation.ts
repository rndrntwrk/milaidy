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

export type AliceGitHubCodingStatus = {
  configured: boolean;
  verification: "verified" | "configured" | "unavailable";
  installations: Array<{
    installationId: number;
    accountLogin: string;
    repositorySelection: "all" | "selected";
  }>;
};

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
  private readonly signingMaterial: SigningMaterial | undefined;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
    this.signingMaterial = signingMaterial;
    this.provider = this.signingMaterial
      ? new GitHubProvider(this.signingMaterial)
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

  /** Read App installation scope without minting repository access tokens. */
  async readCodingStatus(): Promise<AliceGitHubCodingStatus> {
    const material = this.signingMaterial;
    const unavailable: AliceGitHubCodingStatus = {
      configured: Boolean(this.provider && material),
      verification: "unavailable",
      installations: [],
    };
    if (!this.provider || !material) return unavailable;
    try {
      const { token } = await createAppAuth(material)({ type: "app" });
      const signal = AbortSignal.timeout(5_000);
      const installations: AliceGitHubCodingStatus["installations"] = [];
      for (let page = 1; ; page++) {
        signal.throwIfAborted();
        const response = await fetch(
          `https://api.github.com/app/installations?per_page=100&page=${page}`,
          {
            method: "GET",
            redirect: "error",
            signal,
            headers: {
              accept: "application/vnd.github+json",
              authorization: `Bearer ${token}`,
              "user-agent": "alice-github-installation",
              "x-github-api-version": "2022-11-28",
            },
          },
        );
        if (!response.ok)
          throw new Error("GitHub installation read unavailable");
        const rows: unknown = await response.json();
        if (!Array.isArray(rows) || rows.length > 100) {
          throw new Error("GitHub installation response invalid");
        }
        for (const row of rows) {
          if (!row || typeof row !== "object" || Array.isArray(row)) {
            throw new Error("GitHub installation response invalid");
          }
          const accountLogin = row.account?.login;
          if (typeof accountLogin !== "string") {
            throw new Error("GitHub installation account invalid");
          }
          if (
            !["rndrntwrk", "render-network-os"].includes(
              accountLogin.toLowerCase(),
            ) ||
            String(row.app_id) !== material.appId ||
            row.suspended_at !== null
          )
            continue;
          if (
            !Number.isSafeInteger(row.id) ||
            row.id < 1 ||
            (row.repository_selection !== "all" &&
              row.repository_selection !== "selected")
          ) {
            throw new Error("GitHub installation scope invalid");
          }
          installations.push({
            installationId: row.id,
            accountLogin,
            repositorySelection: row.repository_selection,
          });
        }
        const link = response.headers.get("link");
        const nextLink = link?.match(/<([^>]+)>;\s*rel="next"/);
        if (nextLink) {
          const next = new URL(nextLink[1]);
          if (
            next.origin !== "https://api.github.com" ||
            next.pathname !== "/app/installations" ||
            next.searchParams.get("per_page") !== "100" ||
            next.searchParams.get("page") !== String(page + 1)
          )
            throw new Error("GitHub installation pagination invalid");
        } else if (link?.includes('rel="next"')) {
          throw new Error("GitHub installation pagination invalid");
        }
        signal.throwIfAborted();
        if (rows.length < 100 && !nextLink) {
          return { configured: true, verification: "verified", installations };
        }
      }
    } catch {
      return unavailable;
    }
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
    if (!this.provider || !this.signingMaterial) {
      throw new Error("Alice GitHub App is not configured");
    }
    const [owner, name] = this.parseRepository(repo);
    await this.provider.initialize();
    const installation = this.provider.getInstallationForRepo(owner, name);
    if (!installation) {
      throw new Error(`No GitHub App installation found for ${owner}/${name}`);
    }
    const auth = createAppAuth(this.signingMaterial);
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
