import { Injectable } from "@nestjs/common";

import type { DepartmentContext, PrincipalContext } from "@lexora/types";

interface PolicyEvaluationInput {
  principal: PrincipalContext | null;
  department: DepartmentContext;
  requiredPermissions: string[];
}

@Injectable()
export class AuthorizationPolicyService {
  evaluate({
    principal,
    department,
    requiredPermissions
  }: PolicyEvaluationInput): boolean {
    if (department.kind === "public_verification") {
      return requiredPermissions.every((permission) =>
        principal?.permissions.some(
          (grant) =>
            `${grant.resource}:${grant.action}` === permission &&
            grant.scope === "public_verification"
        )
      );
    }

    if (!principal || !principal.isAuthenticated || !principal.activeDepartmentId) {
      return false;
    }

    if (
      department.kind === "department" &&
      department.departmentId !== principal.activeDepartmentId
    ) {
      return false;
    }

    return requiredPermissions.every((permission) =>
      principal.permissions.some(
        (grant) =>
          `${grant.resource}:${grant.action}` === permission &&
          (grant.scope === "department" || grant.scope === "self")
      )
    );
  }
}

