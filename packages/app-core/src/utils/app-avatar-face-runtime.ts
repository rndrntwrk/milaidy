import type { AvatarFaceFrame } from "@miladyai/shared/contracts";
import {
  dispatchChatAvatarFaceFrameEvent,
  type ChatAvatarFaceFrameEventDetail,
} from "../events";

const LOCAL_AVATAR_FACE_ECHO_DEDUPE_WINDOW_MS = 1500;

const recentLocalAvatarFaceFrames = new Map<string, number>();

function toRecentFaceFrameKey(
  frame: Pick<AvatarFaceFrame, "avatarKey" | "sessionId" | "sequence" | "ended">,
): string {
  return `${frame.avatarKey}::${frame.sessionId}::${frame.sequence ?? -1}::${frame.ended === true ? 1 : 0}`;
}

function pruneRecentLocalAvatarFaceFrames(now = Date.now()): void {
  for (const [key, timestamp] of recentLocalAvatarFaceFrames.entries()) {
    if (now - timestamp > LOCAL_AVATAR_FACE_ECHO_DEDUPE_WINDOW_MS) {
      recentLocalAvatarFaceFrames.delete(key);
    }
  }
}

export function dispatchLocalAvatarFaceFrame(
  frame: ChatAvatarFaceFrameEventDetail,
): void {
  const now = Date.now();
  pruneRecentLocalAvatarFaceFrames(now);
  recentLocalAvatarFaceFrames.set(toRecentFaceFrameKey(frame), now);
  dispatchChatAvatarFaceFrameEvent(frame);
}

export function shouldIgnoreRemoteAvatarFaceFrame(
  frame: AvatarFaceFrame,
): boolean {
  const now = Date.now();
  pruneRecentLocalAvatarFaceFrames(now);
  const timestamp = recentLocalAvatarFaceFrames.get(toRecentFaceFrameKey(frame));
  return (
    timestamp != null &&
    now - timestamp <= LOCAL_AVATAR_FACE_ECHO_DEDUPE_WINDOW_MS
  );
}
