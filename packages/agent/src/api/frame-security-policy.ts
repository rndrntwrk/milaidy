export interface FrameSecurityPolicy {
  xFrameOptions: "DENY" | null;
  contentSecurityPolicy: string | null;
}

const STREAM_BROADCAST_FRAME_ANCESTORS =
  "frame-ancestors 'self' https://stream.rndrntwrk.com";

export function resolveFrameSecurityPolicy(
  pathname: string,
): FrameSecurityPolicy {
  if (
    pathname === "/broadcast/alice-cam" ||
    pathname === "/broadcast/alice-cam/"
  ) {
    return {
      xFrameOptions: null,
      contentSecurityPolicy: STREAM_BROADCAST_FRAME_ANCESTORS,
    };
  }
  return {
    xFrameOptions: "DENY",
    contentSecurityPolicy: null,
  };
}
