import type {
  Action,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  Plugin,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import { exceptionAction, readParam } from "../five55-shared/action-kit.js";

const GITHUB_API_BASE = "https://api.github.com";
const MODULE = "five55.github";
const ACTION_NAME = "FIVE55_GITHUB_LIST_REPOS";

type JsonRecord = Record<string, unknown>;

interface GitHubRepoRecord {
  name: string;
  fullName: string;
  private: boolean;
  archived: boolean;
  defaultBranch: string | null;
  updatedAt: string | null;
  pushedAt: string | null;
  htmlUrl: string;
}

function parseBoolean(input: string | undefined): boolean | undefined {
  if (!input) return undefined;
  const normalized = input.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function parsePositiveInt(
  input: string | undefined,
  fallback: number,
  max: number,
): number {
  const parsed = Number.parseInt(input ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function actionSuccessEnvelope(
  message: string,
  data: JsonRecord,
): { success: true; text: string } {
  return {
    success: true,
    text: JSON.stringify({
      ok: true,
      code: "OK",
      module: MODULE,
      action: ACTION_NAME,
      message,
      status: 200,
      retryable: false,
      data,
    }),
  };
}

function actionFailureEnvelope(
  code: string,
  status: number,
  message: string,
  details?: JsonRecord,
): { success: false; text: string } {
  return {
    success: false,
    text: JSON.stringify({
      ok: false,
      code,
      module: MODULE,
      action: ACTION_NAME,
      message,
      status,
      retryable: status === 429 || status >= 500,
      ...(details ? { details } : {}),
    }),
  };
}

function extractRepo(repo: JsonRecord): GitHubRepoRecord {
  return {
    name: String(repo.name ?? ""),
    fullName: String(repo.full_name ?? repo.name ?? ""),
    private: Boolean(repo.private),
    archived: Boolean(repo.archived),
    defaultBranch: asNonEmptyString(repo.default_branch),
    updatedAt: asNonEmptyString(repo.updated_at),
    pushedAt: asNonEmptyString(repo.pushed_at),
    htmlUrl: String(repo.html_url ?? ""),
  };
}

function resolveGitHubToken(runtime: IAgentRuntime): string | null {
  const runtimeToken =
    asNonEmptyString(runtime.getSetting("GITHUB_API_TOKEN")) ??
    asNonEmptyString(runtime.getSetting("ALICE_GH_TOKEN"));
  if (runtimeToken) return runtimeToken;

  return (
    asNonEmptyString(process.env.GITHUB_API_TOKEN) ??
    asNonEmptyString(process.env.ALICE_GH_TOKEN)
  );
}

async function githubGetArray(
  token: string,
  endpoint: string,
): Promise<{ ok: true; repos: GitHubRepoRecord[] } | { ok: false; status: number; body: string }> {
  const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "milaidy-five55-github/1.0.0",
    },
  });

  const body = await response.text();
  if (!response.ok) {
    return { ok: false, status: response.status, body: body.slice(0, 800) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, status: 502, body: "invalid JSON from GitHub API" };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, status: 502, body: "expected array payload from GitHub API" };
  }

  const repos = parsed
    .filter((entry): entry is JsonRecord => typeof entry === "object" && entry !== null)
    .map(extractRepo);
  return { ok: true, repos };
}

async function fetchRepos(
  token: string,
  owner: string | null,
  includePrivate: boolean,
): Promise<{ ok: true; ownerScope: string; repos: GitHubRepoRecord[] } | { ok: false; status: number; message: string; details?: JsonRecord }> {
  if (!owner) {
    const visibility = includePrivate ? "all" : "public";
    const result = await githubGetArray(
      token,
      `/user/repos?sort=updated&direction=desc&per_page=100&visibility=${visibility}`,
    );
    if (!result.ok) {
      return {
        ok: false,
        status: result.status,
        message: "failed to fetch authenticated repo list",
        details: { body: result.body },
      };
    }
    return { ok: true, ownerScope: "authenticated-user", repos: result.repos };
  }

  const orgResult = await githubGetArray(
    token,
    `/orgs/${encodeURIComponent(owner)}/repos?sort=updated&direction=desc&per_page=100&type=all`,
  );
  if (orgResult.ok) {
    return { ok: true, ownerScope: owner, repos: orgResult.repos };
  }
  if (orgResult.status !== 404) {
    return {
      ok: false,
      status: orgResult.status,
      message: "failed to fetch org repo list",
      details: { owner, body: orgResult.body },
    };
  }

  const userType = includePrivate ? "owner" : "public";
  const userResult = await githubGetArray(
    token,
    `/users/${encodeURIComponent(owner)}/repos?sort=updated&direction=desc&per_page=100&type=${userType}`,
  );
  if (!userResult.ok) {
    return {
      ok: false,
      status: userResult.status,
      message: "failed to fetch user repo list",
      details: { owner, body: userResult.body },
    };
  }
  return { ok: true, ownerScope: owner, repos: userResult.repos };
}

const githubProvider: Provider = {
  name: "five55Github",
  description: "GitHub repository listing surface for Alice operator workflows",
  async get(
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    const configured = Boolean(
      asNonEmptyString(process.env.GITHUB_API_TOKEN) ??
        asNonEmptyString(process.env.ALICE_GH_TOKEN),
    );

    return {
      text: [
        "## Five55 GitHub Surface",
        "",
        "Action: FIVE55_GITHUB_LIST_REPOS",
        `Token configured: ${configured ? "yes" : "no"} (GITHUB_API_TOKEN/ALICE_GH_TOKEN)`,
      ].join("\n"),
    };
  },
};

const listReposAction: Action = {
  name: ACTION_NAME,
  similes: [
    "LIST_GITHUB_REPOS",
    "GITHUB_LIST_REPOS",
    "LIST_REPOS",
    "SHOW_REPOS",
    "REPOS_LAST_UPDATED",
  ],
  description:
    "Lists GitHub repositories for an owner/org (or authenticated user) with updated timestamps.",
  validate: async () => true,
  handler: async (runtime, _message, _state, options) => {
    try {
      const token = resolveGitHubToken(runtime);
      if (!token) {
        return actionFailureEnvelope(
          "E_UPSTREAM_UNAUTHORIZED",
          401,
          "GITHUB_API_TOKEN (or ALICE_GH_TOKEN) is not configured",
        );
      }

      const owner =
        readParam(options as HandlerOptions | undefined, "owner") ??
        readParam(options as HandlerOptions | undefined, "org") ??
        readParam(options as HandlerOptions | undefined, "username") ??
        null;
      const includePrivate = parseBoolean(
        readParam(options as HandlerOptions | undefined, "includePrivate"),
      ) ?? false;
      const sinceDays = parsePositiveInt(
        readParam(options as HandlerOptions | undefined, "sinceDays"),
        0,
        3650,
      );
      const limit = parsePositiveInt(
        readParam(options as HandlerOptions | undefined, "limit"),
        30,
        100,
      );

      const fetched = await fetchRepos(token, owner, includePrivate);
      if (!fetched.ok) {
        return actionFailureEnvelope(
          fetched.status === 401 ? "E_UPSTREAM_UNAUTHORIZED" : "E_UPSTREAM_FAILURE",
          fetched.status,
          fetched.message,
          fetched.details,
        );
      }

      const now = Date.now();
      const cutoff = sinceDays > 0 ? now - sinceDays * 24 * 60 * 60 * 1000 : null;
      const filtered = fetched.repos.filter((repo) => {
        if (!cutoff) return true;
        const ts = Date.parse(repo.pushedAt ?? repo.updatedAt ?? "");
        return Number.isFinite(ts) && ts >= cutoff;
      });

      filtered.sort((a, b) => {
        const aTs = Date.parse(a.pushedAt ?? a.updatedAt ?? "") || 0;
        const bTs = Date.parse(b.pushedAt ?? b.updatedAt ?? "") || 0;
        return bTs - aTs;
      });

      const sliced = filtered.slice(0, limit);
      return actionSuccessEnvelope("github repositories fetched", {
        owner: fetched.ownerScope,
        includePrivate,
        sinceDays: sinceDays > 0 ? sinceDays : null,
        total: filtered.length,
        returned: sliced.length,
        repositories: sliced,
      });
    } catch (err) {
      return exceptionAction(MODULE, ACTION_NAME, err);
    }
  },
  parameters: [
    {
      name: "owner",
      description: "GitHub owner/org/user (optional; defaults to authenticated user)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "includePrivate",
      description: "Whether to include private repos (true|false)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "sinceDays",
      description: "Only include repos updated within the last N days",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "limit",
      description: "Maximum repos to return (default 30, max 100)",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

export function createFive55GithubPlugin(): Plugin {
  return {
    name: "five55-github",
    description: "GitHub operator actions for repo discovery and triage",
    providers: [githubProvider],
    actions: [listReposAction],
  };
}

export default createFive55GithubPlugin;
