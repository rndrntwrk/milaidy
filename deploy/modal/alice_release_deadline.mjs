import { pathToFileURL } from "node:url";

const MUTATION_WINDOW_SECONDS = 75 * 60;
const RECOVERY_RESERVE_SECONDS = 30 * 60;
const COMPONENT_RECOVERY_SECONDS = 15 * 60;
const MINIMUM_PHASE_SECONDS = 60;
const MAXIMUM_PHASE_SECONDS = 30 * 60;

function invalid(code = "ALICE_RELEASE_DEADLINE_INVALID") {
  throw new Error(code);
}

function epoch(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function initializeAliceReleaseDeadlines(nowSeconds) {
  if (!epoch(nowSeconds)) invalid();
  return {
    mutationCutoffEpoch: nowSeconds + MUTATION_WINDOW_SECONDS,
    recoveryDeadlineEpoch:
      nowSeconds + MUTATION_WINDOW_SECONDS + RECOVERY_RESERVE_SECONDS,
  };
}

export function aliceReleasePhaseBudget({
  phase,
  nowSeconds,
  mutationCutoffEpoch,
  recoveryDeadlineEpoch,
}) {
  if (
    !["mutation", "modal-recovery", "cloudflare-recovery"].includes(phase) ||
    ![nowSeconds, mutationCutoffEpoch, recoveryDeadlineEpoch].every(epoch) ||
    recoveryDeadlineEpoch - mutationCutoffEpoch !== RECOVERY_RESERVE_SECONDS
  ) {
    invalid();
  }
  const deadline = phase === "mutation"
    ? mutationCutoffEpoch
    : phase === "modal-recovery"
      ? mutationCutoffEpoch + COMPONENT_RECOVERY_SECONDS
      : recoveryDeadlineEpoch;
  const remaining = deadline - nowSeconds;
  if (remaining < MINIMUM_PHASE_SECONDS) {
    invalid("ALICE_RELEASE_DEADLINE_EXHAUSTED");
  }
  return Math.min(
    remaining,
    phase === "mutation" ? MAXIMUM_PHASE_SECONDS : COMPONENT_RECOVERY_SECONDS,
  );
}

function main() {
  const command = process.argv[2];
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (command === "initialize") {
    const deadlines = initializeAliceReleaseDeadlines(nowSeconds);
    process.stdout.write(
      `ALICE_RELEASE_MUTATION_CUTOFF_EPOCH=${deadlines.mutationCutoffEpoch}\n` +
      `ALICE_RELEASE_RECOVERY_DEADLINE_EPOCH=${deadlines.recoveryDeadlineEpoch}\n`,
    );
    return;
  }
  const budget = aliceReleasePhaseBudget({
    phase: command,
    nowSeconds,
    mutationCutoffEpoch: Number(
      process.env.ALICE_RELEASE_MUTATION_CUTOFF_EPOCH,
    ),
    recoveryDeadlineEpoch: Number(
      process.env.ALICE_RELEASE_RECOVERY_DEADLINE_EPOCH,
    ),
  });
  process.stdout.write(String(budget));
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : "";
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
