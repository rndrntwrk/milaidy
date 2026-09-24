import { canonicalJson } from "./program";

const DOMAIN = "alice.coding.publish.v1\n";

export async function aliceCodingResultSha256(result: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(canonicalJson(result)),
  );
  return `sha256:${Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function key(secret: string): Promise<CryptoKey> {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("CODING_PUBLISH_AUTH_INVALID");
  }
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false,
    ["sign", "verify"],
  );
}

export async function signAliceCodingPublish(body: string, secret: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC", await key(secret), new TextEncoder().encode(DOMAIN + body),
  );
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyAliceCodingPublish(
  body: string, signature: string | null, secret: string,
): Promise<boolean> {
  if (!signature || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const bytes = Uint8Array.from(signature.match(/../g)!, (pair) => Number.parseInt(pair, 16));
  return crypto.subtle.verify(
    "HMAC", await key(secret), bytes, new TextEncoder().encode(DOMAIN + body),
  );
}
