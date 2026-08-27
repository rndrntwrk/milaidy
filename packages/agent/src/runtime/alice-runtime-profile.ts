export type AliceRuntimeProfileEnv = {
  readonly [key: string]: string | undefined;
  ALICE_RUNTIME_AUTHORITY_MODE?: string;
  ALICE_RUNTIME_PROFILE?: string;
};

export function isAliceProductionRuntime(
  env: AliceRuntimeProfileEnv = process.env,
): boolean {
  return env.ALICE_RUNTIME_AUTHORITY_MODE?.trim() === "proposer-only";
}

export function isAliceFullRuntimeProfile(
  env: AliceRuntimeProfileEnv = process.env,
): boolean {
  return (
    isAliceProductionRuntime(env) &&
    env.ALICE_RUNTIME_PROFILE === "full-gated"
  );
}

export function isAliceResponseOnlyRuntime(
  env: AliceRuntimeProfileEnv = process.env,
): boolean {
  return isAliceProductionRuntime(env) && !isAliceFullRuntimeProfile(env);
}
