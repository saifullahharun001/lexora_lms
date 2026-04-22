import { SetMetadata } from "@nestjs/common";

import { type PolicyName } from "./policy-names.constants";

export const REQUIRE_POLICIES_KEY = "identity_access.require_policies";

export function RequirePolicies(...policies: PolicyName[]) {
  return SetMetadata(REQUIRE_POLICIES_KEY, policies);
}

