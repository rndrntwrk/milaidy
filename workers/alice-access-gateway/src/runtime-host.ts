export { ContainerProxy } from "@cloudflare/containers";
export { AliceRuntimeContainer } from "./alice-runtime-container";
import { fetchAliceCodingArchive } from "./alice-coding-archive";
import { mergeAliceCodingPullRequest, publishAliceCodingTask, type AliceCodingPublishEnv } from "./alice-coding-publish";
import {
  forwardToAliceCodingModel,
  type AliceRuntimeContainerNamespace,
  type AliceRuntimeContainerEnvironmentSource,
} from "./alice-runtime-host";

type RuntimeHostEnv = AliceRuntimeContainerEnvironmentSource & AliceCodingPublishEnv & {
  ALICE_RUNTIME_CONTAINER: AliceRuntimeContainerNamespace;
};

export default {
  async fetch(request: Request, env: RuntimeHostEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/internal/v1/coding/publish") {
      return publishAliceCodingTask(request, env);
    }
    if (url.pathname === "/internal/v1/coding/merge") {
      return mergeAliceCodingPullRequest(request, env);
    }
    if (request.method === "GET" && url.pathname === "/internal/v1/coding/archive") {
      try {
        return await fetchAliceCodingArchive(
          url.searchParams.get("repository") ?? "",
          url.searchParams.get("baseCommit") ?? "",
          env,
        );
      } catch {
        return Response.json({ ok: false, code: "CODING_ARCHIVE_UNAVAILABLE" }, { status: 503 });
      }
    }
    if (request.method === "POST" && url.pathname === "/internal/v1/coding/model") {
      return forwardToAliceCodingModel(request, env);
    }
    return new Response("Not found", { status: 404 });
  },
};
