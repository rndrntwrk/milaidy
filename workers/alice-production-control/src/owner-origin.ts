const ALICE_OWNER_ORIGIN = "https://alice.rndrntwrk.com";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type AliceOwnerOriginDecision =
  | { ok: true }
  | {
      ok: false;
      code: "ALICE_OWNER_HOST_DENIED" | "ALICE_OWNER_ORIGIN_DENIED";
    };

export function validateAliceOwnerOrigin(
  request: Request,
): AliceOwnerOriginDecision {
  const url = new URL(request.url);
  if (url.origin !== ALICE_OWNER_ORIGIN) {
    return { ok: false, code: "ALICE_OWNER_HOST_DENIED" };
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== ALICE_OWNER_ORIGIN) {
    return { ok: false, code: "ALICE_OWNER_ORIGIN_DENIED" };
  }
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (!SAFE_METHODS.has(request.method.toUpperCase()) && fetchSite === "cross-site") {
    return { ok: false, code: "ALICE_OWNER_ORIGIN_DENIED" };
  }
  return { ok: true };
}
