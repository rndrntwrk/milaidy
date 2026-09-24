export { ContainerProxy } from "@cloudflare/containers";
export { AliceRuntimeContainer } from "./alice-runtime-container";
import { fetchAliceCodingArchive } from "./alice-coding-archive";
import {
  forwardToAliceAiGateway,
  type AliceRuntimeContainerEnvironmentSource,
} from "./alice-runtime-host";

type RuntimeHostEnv = AliceRuntimeContainerEnvironmentSource & {
  ALICE_AI_GATEWAY: Fetcher;
};

export default {
  async fetch(request: Request, env: RuntimeHostEnv): Promise<Response> {
    const url = new URL(request.url);
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
      const upstream = new URL(request.url);
      upstream.pathname = "/v1/chat/completions";
      return forwardToAliceAiGateway(new Request(upstream, request), env);
    }
    return new Response("Not found", { status: 404 });
  },
};
