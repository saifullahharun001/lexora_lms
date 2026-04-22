import { SetMetadata } from "@nestjs/common";

import { REQUIRE_PERMISSIONS_KEY } from "./authorization.constants";

export function RequirePermissions(...permissions: string[]) {
  return SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);
}

