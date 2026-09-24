import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { DeviceBoundCredential } from "./authority";

const RP_ID = "alice.rndrntwrk.com";
const ORIGIN = `https://${RP_ID}`;
const CHALLENGE_TIMEOUT_MS = 300_000;

export async function registrationOptions(owner: string) {
  const ownerHash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(owner),
  );
  return generateRegistrationOptions({
    rpName: "Alice RNDRNTWRK",
    rpID: RP_ID,
    userName: "Alice owner",
    userID: new Uint8Array(ownerHash),
    timeout: CHALLENGE_TIMEOUT_MS,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
    },
    supportedAlgorithmIDs: [-7, -257],
  });
}

export async function verifyRegistration(
  response: RegistrationResponseJSON,
  expectedChallenge: string,
) {
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    requireUserVerification: true,
    supportedAlgorithmIDs: [-7, -257],
  });
  const info = result.registrationInfo;
  if (
    !result.verified ||
    !info ||
    !info.userVerified ||
    info.credentialDeviceType !== "singleDevice" ||
    info.credentialBackedUp
  ) {
    return null;
  }
  return {
    id: info.credential.id,
    publicKeyB64: isoBase64URL.fromBuffer(info.credential.publicKey),
    counter: info.credential.counter,
    transports: info.credential.transports ?? [],
  } satisfies Omit<DeviceBoundCredential, "owner" | "createdAt">;
}

export async function approvalOptions(credential: DeviceBoundCredential) {
  return generateAuthenticationOptions({
    rpID: RP_ID,
    timeout: CHALLENGE_TIMEOUT_MS,
    userVerification: "required",
    allowCredentials: [{
      id: credential.id,
      transports: credential.transports as AuthenticatorTransportFuture[],
    }],
  });
}

export async function verifyApproval(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  credential: DeviceBoundCredential,
) {
  if (response.id !== credential.id) return null;
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    requireUserVerification: true,
    credential: {
      id: credential.id,
      publicKey: isoBase64URL.toBuffer(credential.publicKeyB64),
      counter: credential.counter,
      transports: credential.transports as AuthenticatorTransportFuture[],
    },
  });
  if (
    !result.verified ||
    !result.authenticationInfo.userVerified ||
    result.authenticationInfo.credentialDeviceType !== "singleDevice" ||
    result.authenticationInfo.credentialBackedUp
  ) {
    return null;
  }
  return result.authenticationInfo.newCounter;
}
