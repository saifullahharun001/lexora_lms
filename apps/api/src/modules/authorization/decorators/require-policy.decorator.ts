import { SetMetadata } from "@nestjs/common";

import { REQUIRE_POLICY_KEY } from "../domain/authorization.constants";

export function RequirePolicy(policy: string) {
  return SetMetadata(REQUIRE_POLICY_KEY, policy);
}
