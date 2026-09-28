import { aliceCodingArgumentHash, aliceCodingMergeArgumentHash, parseAliceCodingMergeRequest,
  parseAliceCodingRequest } from "../../alice-production-control/src/coding-task";
import { authorityDurableName } from "../../alice-production-control/src/durable-names";
import {
  aliceCodingResultSha256, verifyAliceCodingPublish,
} from "../../alice-production-control/src/coding-publish-signature";
import type { ActionIntent, ReleaseAdmission } from "../../alice-production-control/src/policy";
import {
  codingAppBotLogin, codingRepositoryToken, githubHeaders, githubJsonResponse,
  type GitHubAppEnvironment,
} from "./alice-coding-archive";

type Change = { path: string; mode: "100644" | "100755"; contentB64: string | null };
type PublishInput = {
  schemaVersion: "alice.coding-publish.v1";
  taskId: string;
  actor: string;
  admission: ReleaseAdmission;
  intent: ActionIntent;
  coding: ReturnType<typeof parseAliceCodingRequest>;
  branch: string;
  requestedAt: number;
  resultSha256: string;
  result: { summary: string; changes: Change[] };
};

export type AliceCodingPublishEnv = GitHubAppEnvironment & {
  ALICE_CODING_PUBLISH_TOKEN: string;
  ALICE_AUTHORITY: DurableObjectNamespace;
};

const TASK_ID = /^task-cap-[a-f0-9-]{36}$/;
const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const MAX_REQUEST_BYTES = 150_000;

function invalid(): never { throw new Error("CODING_PUBLISH_REQUEST_INVALID"); }

function validPath(path: string): boolean {
  return path.length > 0 && path.length <= 255 &&
    !/[\u0000-\u001f\u007f]/.test(path) && !path.startsWith("/") &&
    path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

async function validateInput(value: unknown): Promise<PublishInput> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const input = value as PublishInput;
  if (Object.keys(input).sort().join(",") !==
    "actor,admission,branch,coding,intent,requestedAt,result,resultSha256,schemaVersion,taskId" ||
    input.schemaVersion !== "alice.coding-publish.v1" ||
    !TASK_ID.test(input.taskId) ||
    input.branch !== `alice/${input.taskId}` ||
    !/^owner:sha256:[a-f0-9]{64}$/.test(input.actor) ||
    !Number.isSafeInteger(input.requestedAt) || input.requestedAt < 1 ||
    !DIGEST.test(input.resultSha256) ||
    !input.admission || !DIGEST.test(input.admission.deploymentManifestSha256) ||
    !Number.isSafeInteger(input.admission.admissionGeneration) ||
    !input.intent || input.intent.action !== "coding.pr.create" ||
    input.intent.capabilityId !== input.taskId.slice(5) ||
    !Number.isSafeInteger(input.intent.expiresAt) || input.intent.expiresAt <= Date.now() ||
    input.intent.expiresAt - input.requestedAt !== 600_000) invalid();
  const coding = parseAliceCodingRequest(input.coding);
  if (coding.delivery !== "pull-request" || !SHA.test(coding.baseCommit) ||
    input.intent.target !== coding.repository ||
    input.intent.argumentHash !== await aliceCodingArgumentHash(coding) ||
    !input.result || typeof input.result.summary !== "string" ||
    input.result.summary.length > 2_000 ||
    !Array.isArray(input.result.changes) || input.result.changes.length < 1 ||
    input.result.changes.length > 25 ||
    new TextEncoder().encode(JSON.stringify(input.result.changes)).byteLength > 110_000) invalid();
  const paths = new Set<string>();
  for (const change of input.result.changes) {
    if (!change || typeof change !== "object" || !validPath(change.path) ||
      paths.has(change.path) || !["100644", "100755"].includes(change.mode) ||
      (change.contentB64 !== null &&
        (typeof change.contentB64 !== "string" ||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(change.contentB64)))) invalid();
    paths.add(change.path);
  }
  if (await aliceCodingResultSha256(input.result) !== input.resultSha256) invalid();
  return input;
}

async function checkAuthority(input: Pick<PublishInput, "actor" | "admission" | "intent">,
  env: AliceCodingPublishEnv): Promise<void> {
  const authority = env.ALICE_AUTHORITY.getByName(authorityDurableName());
  const release = await authority.fetch("https://alice.internal/release/check");
  const current = await release.json() as Record<string, unknown>;
  const binding = current.binding as Record<string, unknown> | undefined;
  const active = current.release as Record<string, unknown> | undefined;
  if (!release.ok || current.allowed !== true ||
    current.admissionGeneration !== input.admission.admissionGeneration ||
    active?.deploymentManifestSha256 !== input.admission.deploymentManifestSha256 ||
    ["programDigest", "releaseDigest", "policyHash"].some((key) =>
      binding?.[key] !== input.admission.binding[key as keyof typeof input.admission.binding] ||
      input.intent[key as keyof typeof input.admission.binding] !== binding?.[key])) {
    throw new Error("CODING_RELEASE_NOT_ADMITTED");
  }
  const response = await authority.fetch("https://alice.internal/authorize", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ actor: input.actor, request: input.intent }),
  });
  const value = await response.json() as { decision?: { allowed?: boolean; code?: string } };
  if (!response.ok || value.decision?.allowed !== true ||
    value.decision.code !== "INTENT_ALREADY_AUTHORIZED") {
    throw new Error("CODING_PUBLISH_AUTH_DENIED");
  }
}

async function githubRequest(
  fetcher: typeof fetch, token: string, repository: string,
  path: string, method = "GET", body?: unknown,
): Promise<Response> {
  return fetcher(`https://api.github.com/repos/${repository}${path}`, {
    method, headers: {
      ...githubHeaders(token), ...(body === undefined ? {} : { "content-type": "application/json" }),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function requireSha(value: unknown): string {
  if (typeof value !== "string" || !SHA.test(value)) invalid();
  return value;
}

function prResult(value: Record<string, unknown>, input: PublishInput, commitSha: string,
  baseBranch: string): { branch: string; commitSha: string; pullRequestUrl: string; baseCommit: string } {
  const head = value.head as Record<string, unknown> | undefined;
  const base = value.base as Record<string, unknown> | undefined;
  const expectedUrl = `https://github.com/${input.coding.repository}/pull/${value.number}`;
  if (!Number.isSafeInteger(value.number) || Number(value.number) < 1 ||
    value.html_url !== expectedUrl || head?.ref !== input.branch ||
    head?.sha !== commitSha || base?.ref !== baseBranch) invalid();
  return { branch: input.branch, commitSha, pullRequestUrl: expectedUrl,
    baseCommit: input.coding.baseCommit };
}

/** Only Control can sign; host also rechecks the consumed exact Authority intent. */
export async function publishAliceCodingTask(
  request: Request, env: AliceCodingPublishEnv, fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== "POST") return Response.json({ ok: false, code: "CODING_PUBLISH_METHOD_INVALID" }, { status: 405 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES ||
    !await verifyAliceCodingPublish(raw, request.headers.get("x-alice-coding-signature"),
      env.ALICE_CODING_PUBLISH_TOKEN)) {
    return Response.json({ ok: false, code: "CODING_PUBLISH_AUTH_DENIED" }, { status: 403 });
  }
  try {
    const input = await validateInput(JSON.parse(raw));
    await checkAuthority(input, env);
    const token = await codingRepositoryToken(input.coding.repository,
      { contents: "write", metadata: "read", pull_requests: "write" }, env, fetcher);
    const repo = input.coding.repository;
    const repoInfo = await githubJsonResponse(await githubRequest(fetcher, token, repo, ""));
    const baseBranch = repoInfo.default_branch;
    if (typeof baseBranch !== "string" || !/^[A-Za-z0-9._/-]{1,100}$/.test(baseBranch) ||
      baseBranch.split("/").some((part) => !part || part === "." || part === "..") ||
      repoInfo.archived === true) throw new Error("CODING_REPOSITORY_UNAVAILABLE");

    const parent = await githubJsonResponse(await githubRequest(fetcher, token, repo,
      `/git/commits/${input.coding.baseCommit}`));
    const baseTree = requireSha((parent.tree as Record<string, unknown> | undefined)?.sha);
    const branchRef = await githubRequest(fetcher, token, repo,
      `/git/ref/heads/${input.branch}`);
    if (branchRef.status === 404) {
      const defaultBranch = await githubJsonResponse(await githubRequest(fetcher, token, repo,
        `/branches/${encodeURIComponent(baseBranch)}`));
      if ((defaultBranch.commit as Record<string, unknown> | undefined)?.sha !== input.coding.baseCommit) {
        throw new Error("CODING_BASE_MOVED");
      }
    } else if (!branchRef.ok) throw new Error("CODING_GITHUB_UNAVAILABLE");
    const treeChanges: Array<{ path: string; mode: string; type: "blob"; sha: string | null }> = [];
    for (const change of input.result.changes) {
      let blobSha: string | null = null;
      if (change.contentB64 !== null) {
        const blob = await githubJsonResponse(await githubRequest(fetcher, token, repo,
          "/git/blobs", "POST", { content: change.contentB64, encoding: "base64" }));
        blobSha = requireSha(blob.sha);
      }
      treeChanges.push({ path: change.path, mode: change.mode, type: "blob", sha: blobSha });
    }
    const tree = await githubJsonResponse(await githubRequest(fetcher, token, repo,
      "/git/trees", "POST", { base_tree: baseTree, tree: treeChanges }));
    const treeSha = requireSha(tree.sha);
    if (treeSha === baseTree) throw new Error("CODING_EMPTY_PATCH");
    const message = `Alice task ${input.taskId}\n\nResult-SHA256: ${input.resultSha256}\nBase-Commit: ${input.coding.baseCommit}`;
    const timestamp = new Date(input.requestedAt).toISOString();
    const commit = await githubJsonResponse(await githubRequest(fetcher, token, repo,
      "/git/commits", "POST", {
        message, tree: treeSha, parents: [input.coding.baseCommit],
        author: { name: "Alice", email: "alice@rndrntwrk.com", date: timestamp },
        committer: { name: "Alice", email: "alice@rndrntwrk.com", date: timestamp },
      }));
    const commitSha = requireSha(commit.sha);
    if (branchRef.status === 404) {
      const created = await githubRequest(fetcher, token, repo, "/git/refs", "POST",
        { ref: `refs/heads/${input.branch}`, sha: commitSha });
      if (!created.ok && created.status !== 422) throw new Error("CODING_BRANCH_CREATE_FAILED");
    }
    const actualRef = await githubJsonResponse(await githubRequest(fetcher, token, repo,
      `/git/ref/heads/${input.branch}`));
    if ((actualRef.object as Record<string, unknown> | undefined)?.sha !== commitSha) {
      throw new Error("CODING_BRANCH_CONFLICT");
    }
    const owner = repo.split("/")[0]!;
    const listPath = `/pulls?head=${encodeURIComponent(`${owner}:${input.branch}`)}&state=all&per_page=2`;
    const listed = await githubRequest(fetcher, token, repo, listPath);
    if (!listed.ok) throw new Error("CODING_GITHUB_UNAVAILABLE");
    const existing = await listed.json() as unknown;
    if (!Array.isArray(existing) || existing.length > 1) invalid();
    let pull = existing[0] as Record<string, unknown> | undefined;
    if (!pull) {
      const title = `Alice: ${input.coding.prompt.trim().split("\n")[0]!.slice(0, 110)}`;
      const body = `${input.result.summary}\n\nAlice task: ${input.taskId}\nApproved base commit: ${input.coding.baseCommit}\nResult digest: ${input.resultSha256}`;
      const created = await githubRequest(fetcher, token, repo, "/pulls", "POST",
        { title, body, head: input.branch, base: baseBranch, draft: true });
      if (!created.ok && created.status !== 422) throw new Error("CODING_PR_CREATE_FAILED");
      if (created.ok) pull = await created.json() as Record<string, unknown>;
      else {
        const retry = await githubRequest(fetcher, token, repo, listPath);
        if (!retry.ok) throw new Error("CODING_PR_CREATE_FAILED");
        pull = (await retry.json() as Record<string, unknown>[])[0];
      }
    }
    if (!pull) throw new Error("CODING_PR_CREATE_FAILED");
    return Response.json({ ok: true, result: prResult(pull, input, commitSha, baseBranch) });
  } catch (error) {
    const code = error instanceof Error && /^CODING_[A-Z_]{3,80}$/.test(error.message)
      ? error.message : "CODING_PUBLISH_UNAVAILABLE";
    return Response.json({ ok: false, code }, { status: 503 });
  }
}

type MergeInput = {
  schemaVersion: "alice.coding-merge.v1";
  reconcileOnly: boolean;
  taskId: string;
  actor: string;
  admission: ReleaseAdmission;
  intent: ActionIntent;
  request: ReturnType<typeof parseAliceCodingMergeRequest>;
  sourceResult: { branch: string; commitSha: string; pullRequestUrl: string; baseCommit: string };
  requestedAt: number;
};

async function validateMergeInput(value: unknown): Promise<MergeInput> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const input = value as MergeInput;
  if (Object.keys(input).sort().join(",") !==
      "actor,admission,intent,reconcileOnly,request,requestedAt,schemaVersion,sourceResult,taskId" ||
    input.schemaVersion !== "alice.coding-merge.v1" || typeof input.reconcileOnly !== "boolean" ||
    !TASK_ID.test(input.taskId) ||
    !/^owner:sha256:[a-f0-9]{64}$/.test(input.actor) ||
    !Number.isSafeInteger(input.requestedAt) || input.requestedAt < 1 ||
    !input.admission || !DIGEST.test(input.admission.deploymentManifestSha256) ||
    !Number.isSafeInteger(input.admission.admissionGeneration) ||
    !input.intent || input.intent.action !== "repository.merge" ||
    input.intent.intentId !== `intent-${input.taskId.slice(5)}` ||
    input.intent.capabilityId !== input.taskId.slice(5) ||
    !Number.isSafeInteger(input.intent.expiresAt) ||
    input.intent.expiresAt - input.requestedAt !== 600_000) invalid();
  const merge = parseAliceCodingMergeRequest(input.request);
  const source = input.sourceResult;
  if (merge.sourceTaskId === input.taskId || input.intent.target !== merge.repository ||
    input.intent.argumentHash !== await aliceCodingMergeArgumentHash(merge) ||
    !source || Object.keys(source).sort().join(",") !== "baseCommit,branch,commitSha,pullRequestUrl" ||
    source.branch !== `alice/${merge.sourceTaskId}` || source.commitSha !== merge.headCommit ||
    !SHA.test(source.baseCommit) ||
    source.pullRequestUrl !== `https://github.com/${merge.repository}/pull/${merge.pullRequestNumber}`) invalid();
  return input;
}

function validateMergePull(pull: Record<string, unknown>, input: MergeInput,
  botLogin: string, baseBranch?: string): void {
  const head = pull.head as Record<string, unknown> | undefined;
  const base = pull.base as Record<string, unknown> | undefined;
  const author = pull.user as Record<string, unknown> | undefined;
  const headRepo = head?.repo as Record<string, unknown> | undefined;
  const baseRepo = base?.repo as Record<string, unknown> | undefined;
  if (pull.number !== input.request.pullRequestNumber ||
    pull.html_url !== input.sourceResult.pullRequestUrl ||
    author?.login !== botLogin || author.type !== "Bot" ||
    head?.ref !== input.sourceResult.branch || head.sha !== input.request.headCommit ||
    headRepo?.full_name !== input.request.repository ||
    baseRepo?.full_name !== input.request.repository || typeof base?.ref !== "string" ||
    (baseBranch !== undefined && base.ref !== baseBranch)) {
    throw new Error("CODING_MERGE_PR_MISMATCH");
  }
}

function mergedReceipt(pull: Record<string, unknown>, input: MergeInput, botLogin: string) {
  const merger = pull.merged_by as Record<string, unknown> | undefined;
  if (pull.merged !== true || !SHA.test(String(pull.merge_commit_sha ?? "")) ||
    merger?.login !== botLogin || merger.type !== "Bot" ||
    typeof pull.merged_at !== "string" || !Number.isFinite(Date.parse(pull.merged_at))) {
    throw new Error("CODING_MERGE_READBACK_PENDING");
  }
  return { repository: input.request.repository, sourceTaskId: input.request.sourceTaskId,
    pullRequestNumber: input.request.pullRequestNumber,
    pullRequestUrl: input.sourceResult.pullRequestUrl, headCommit: input.request.headCommit,
    mergeCommit: String(pull.merge_commit_sha), mergedAt: pull.merged_at,
    mergedBy: botLogin, mergeMethod: "squash" as const };
}

async function mergeGraphql(fetcher: typeof fetch, token: string, query: string,
  variables: Record<string, unknown>): Promise<Record<string, any>> {
  const value = await githubJsonResponse(await fetcher("https://api.github.com/graphql", {
    method: "POST", headers: { ...githubHeaders(token), "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  }));
  if (value.errors || !value.data || typeof value.data !== "object") {
    throw new Error("CODING_GITHUB_UNAVAILABLE");
  }
  return value.data as Record<string, any>;
}

/** Exact owner approval; GitHub enforces branch protection and the approved head SHA. */
export async function mergeAliceCodingPullRequest(
  request: Request, env: AliceCodingPublishEnv, fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== "POST") return Response.json({ ok: false,
    code: "CODING_MERGE_METHOD_INVALID" }, { status: 405 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 8_192 ||
    !await verifyAliceCodingPublish(raw, request.headers.get("x-alice-coding-signature"),
      env.ALICE_CODING_PUBLISH_TOKEN)) return Response.json({ ok: false,
        code: "CODING_PUBLISH_AUTH_DENIED" }, { status: 403 });
  let mergeAttempted = false;
  try {
    const input = await validateMergeInput(JSON.parse(raw));
    const botLogin = await codingAppBotLogin(env, fetcher);
    const repo = input.request.repository;
    const token = await codingRepositoryToken(repo,
      { contents: "write", metadata: "read", pull_requests: "write" }, env, fetcher);
    let baseBranch: string | undefined;
    const path = `/pulls/${input.request.pullRequestNumber}`;
    const readPull = async () => {
      const pull = await githubJsonResponse(await githubRequest(fetcher, token, repo, path));
      validateMergePull(pull, input, botLogin, baseBranch);
      return pull;
    };
    let pull = await readPull();
    // A lost provider response or durable write never causes a second merge.
    if (pull.merged === true) return Response.json({ ok: true, reconciled: true,
      result: mergedReceipt(pull, input, botLogin) });
    if (input.reconcileOnly) return Response.json({ ok: false,
      code: "CODING_MERGE_NOT_MERGED", outcome: "not-merged" }, { status: 409 });
    const info = await githubJsonResponse(await githubRequest(fetcher, token, repo, ""));
    if (typeof info.default_branch !== "string" ||
      !/^[A-Za-z0-9._/-]{1,100}$/.test(info.default_branch) ||
      info.archived === true || info.allow_squash_merge !== true) {
      throw new Error("CODING_REPOSITORY_UNAVAILABLE");
    }
    baseBranch = info.default_branch;
    validateMergePull(pull, input, botLogin, baseBranch);
    if (pull.state !== "open" || typeof pull.node_id !== "string") {
      throw new Error("CODING_MERGE_PR_CLOSED");
    }
    const nodeId = pull.node_id;
    const query = "query($id:ID!){node(id:$id){... on PullRequest{id headRefOid isDraft mergeStateStatus}}}";
    const status = async () => {
      const node = (await mergeGraphql(fetcher, token, query, { id: nodeId })).node;
      if (!node || node.id !== nodeId || node.headRefOid !== input.request.headCommit) {
        throw new Error("CODING_MERGE_PR_MISMATCH");
      }
      return node;
    };
    let current = await status();
    if (current.isDraft === true) {
      if (input.intent.expiresAt <= Date.now()) throw new Error("CODING_MERGE_APPROVAL_EXPIRED");
      await checkAuthority(input, env);
      await mergeGraphql(fetcher, token,
        "mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{id}}}",
        { id: nodeId });
      current = await status();
    }
    if (current.isDraft !== false || current.mergeStateStatus !== "CLEAN") {
      throw new Error("CODING_MERGE_BLOCKED");
    }
    if (input.intent.expiresAt <= Date.now()) throw new Error("CODING_MERGE_APPROVAL_EXPIRED");
    await checkAuthority(input, env);
    // GitHub's merge API binds the head SHA; check the PR target immediately before submission.
    pull = await readPull();
    if (pull.merged === true) return Response.json({ ok: true, reconciled: true,
      result: mergedReceipt(pull, input, botLogin) });
    if (pull.state !== "open" || pull.draft !== false) throw new Error("CODING_MERGE_BLOCKED");
    if (input.intent.expiresAt <= Date.now()) throw new Error("CODING_MERGE_APPROVAL_EXPIRED");
    mergeAttempted = true;
    const merged = await githubRequest(fetcher, token, repo, `${path}/merge`, "PUT", {
      sha: input.request.headCommit, merge_method: "squash",
    });
    // Reconcile even a rejected/ambiguous response: another identical request may have won.
    pull = await readPull();
    if (pull.merged === true) return Response.json({ ok: true,
      result: mergedReceipt(pull, input, botLogin) });
    if (!merged.ok) mergeAttempted = false; // Readback proves this rejected request did not merge.
    throw new Error(merged.status === 409 ? "CODING_MERGE_PR_MISMATCH" :
      merged.ok ? "CODING_MERGE_READBACK_PENDING" : "CODING_MERGE_BLOCKED");
  } catch (error) {
    const code = error instanceof Error && /^CODING_[A-Z_]{3,80}$/.test(error.message)
      ? error.message : "CODING_MERGE_UNAVAILABLE";
    return Response.json({ ok: false, code,
      outcome: mergeAttempted ? "unknown" : "not-merged" }, { status: 503 });
  }
}
