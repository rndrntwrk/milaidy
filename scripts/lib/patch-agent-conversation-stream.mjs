/**
 * @elizaos/agent: POST /api/conversations/:id/messages/stream awaits
 * persistAssistantConversationMemory before emitting the terminal SSE `done`
 * event. If persistence hangs (DB lock, slow I/O), Milady's chat client never
 * finishes reading the body and stays in "sending" until Stop.
 *
 * Emit `done` first, then persist in a try/catch so the HTTP stream always
 * terminates for the UI while we still attempt to save assistant text.
 *
 * Remove once upstream reorders or makes persistence non-blocking for SSE.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PATCH_MARKER = "[milady-patch] conversation stream: emit done before persist";

/**
 * @param {string} src
 * @returns {{ src: string; changed: boolean }}
 */
export function applyConversationStreamSseDoneOrderPatch(src) {
  if (src.includes(PATCH_MARKER)) {
    return { src, changed: false };
  }

  const successBlock =
    "            if (!aborted) {\n" +
    "                await persistAssistantConversationMemory(runtime, conv.roomId, result.text, channelType, turnStartedAt);\n" +
    "                conv.updatedAt = new Date().toISOString();\n" +
    "                writeSseJson(res, {\n" +
    "                    type: \"done\",\n" +
    "                    fullText: result.text,\n" +
    "                    agentName: result.agentName,\n" +
    "                    ...(result.usage ? { estimatedUsage: result.usage } : {}),\n" +
    "                });";

  const successReplacement =
    "            if (!aborted) {\n" +
    "                // " +
    PATCH_MARKER +
    "\n" +
    "                conv.updatedAt = new Date().toISOString();\n" +
    "                writeSseJson(res, {\n" +
    "                    type: \"done\",\n" +
    "                    fullText: result.text,\n" +
    "                    agentName: result.agentName,\n" +
    "                    ...(result.usage ? { estimatedUsage: result.usage } : {}),\n" +
    "                });\n" +
    "                try {\n" +
    "                    await persistAssistantConversationMemory(runtime, conv.roomId, result.text, channelType, turnStartedAt);\n" +
    "                }\n" +
    "                catch (persistErr) {\n" +
    "                    logger.warn(`[conversations] Assistant persist after SSE done failed: ${getErrorMessage(persistErr)}`);\n" +
    "                }";

  const creditBlock =
    "                if (creditReply) {\n" +
    "                    try {\n" +
    "                        await persistAssistantConversationMemory(runtime, conv.roomId, creditReply, channelType);\n" +
    "                        conv.updatedAt = new Date().toISOString();\n" +
    "                        writeSse(res, {\n" +
    "                            type: \"done\",\n" +
    "                            fullText: creditReply,\n" +
    "                            agentName: state.agentName,\n" +
    "                        });\n" +
    "                    }\n" +
    "                    catch (persistErr) {\n" +
    "                        writeSse(res, {\n" +
    "                            type: \"error\",\n" +
    "                            message: getErrorMessage(persistErr),\n" +
    "                        });\n" +
    "                    }\n" +
    "                }";

  const creditReplacement =
    "                if (creditReply) {\n" +
    "                    conv.updatedAt = new Date().toISOString();\n" +
    "                    writeSse(res, {\n" +
    "                        type: \"done\",\n" +
    "                        fullText: creditReply,\n" +
    "                        agentName: state.agentName,\n" +
    "                    });\n" +
    "                    try {\n" +
    "                        await persistAssistantConversationMemory(runtime, conv.roomId, creditReply, channelType);\n" +
    "                    }\n" +
    "                    catch (persistErr) {\n" +
    "                        logger.warn(`[conversations] Assistant persist after SSE done failed: ${getErrorMessage(persistErr)}`);\n" +
    "                    }\n" +
    "                }";

  let out = src;
  if (!out.includes(successBlock)) {
    return { src, changed: false };
  }
  out = out.replace(successBlock, successReplacement);
  if (!out.includes(creditBlock)) {
    return { src, changed: false };
  }
  out = out.replace(creditBlock, creditReplacement);
  return { src: out, changed: true };
}

/**
 * @param {string} repoRoot
 */
export function patchElizaAgentConversationStreamSse(repoRoot) {
  const serverJs = resolve(
    repoRoot,
    "node_modules/@elizaos/agent/packages/agent/src/api/server.js",
  );
  if (!existsSync(serverJs)) {
    console.log(
      "[patch-deps] @elizaos/agent server.js not found, skipping conversation SSE patch.",
    );
    return;
  }
  const before = readFileSync(serverJs, "utf8");
  const { src: after, changed } =
    applyConversationStreamSseDoneOrderPatch(before);
  if (!changed) {
    if (before.includes(PATCH_MARKER)) {
      console.log(
        "[patch-deps] @elizaos/agent conversation SSE patch already applied.",
      );
    } else {
      console.log(
        "[patch-deps] @elizaos/agent conversation SSE: expected patterns not found, skipping.",
      );
    }
    return;
  }
  writeFileSync(serverJs, after, "utf8");
  console.log(
    "[patch-deps] Applied @elizaos/agent conversation stream: done-before-persist patch.",
  );
}
