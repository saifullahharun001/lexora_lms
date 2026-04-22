import { SetMetadata } from "@nestjs/common";

import { type StepUpPolicyName } from "./step-up.types";

export const REQUIRE_STEP_UP_KEY = "identity_access.require_step_up";

export function RequireStepUp(policy: StepUpPolicyName) {
  return SetMetadata(REQUIRE_STEP_UP_KEY, policy);
}

