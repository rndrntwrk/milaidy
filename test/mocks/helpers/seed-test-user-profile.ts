import type { IAgentRuntime } from "@elizaos/core";
import {
  persistConfiguredOwnerName,
  updateLifeOpsOwnerProfile,
} from "../../../eliza/apps/app-lifeops/src/lifeops/owner-profile.ts";
import { LifeOpsService } from "../../../eliza/apps/app-lifeops/src/lifeops/service.ts";
import { ensureLifeOpsSchema } from "./seed-grants.ts";

const TEST_USER_PROFILE_NAME = "Milady Test Owner";

const TEST_USER_PROFILE_PATCH = {
  name: TEST_USER_PROFILE_NAME,
  relationshipStatus: "single",
  partnerName: "n/a",
  orientation: "n/a",
  gender: "n/a",
  age: "n/a",
  location: "Test City, CA",
  travelBookingPreferences: "carry-on only; aisle seat; moderate hotels",
  morningCheckinTime: "08:00",
  nightCheckinTime: "21:30",
} as const;

export const TEST_USER_PROFILE_ROUTINE_KEYS = [
  "brush_teeth",
  "invisalign",
  "stretch",
  "vitamins",
  "workout",
] as const;

export async function seedTestUserProfile(
  runtime: IAgentRuntime,
): Promise<void> {
  await ensureLifeOpsSchema(runtime);

  const profile = await updateLifeOpsOwnerProfile(
    runtime,
    TEST_USER_PROFILE_PATCH,
  );
  if (!profile) {
    throw new Error("[mock-runtime] failed to seed test user profile");
  }

  await persistConfiguredOwnerName(profile.name);

  const service = new LifeOpsService(runtime);
  await service.applySeedRoutines([...TEST_USER_PROFILE_ROUTINE_KEYS]);
}
