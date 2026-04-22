import type { PrincipalContext } from "@lexora/types";

import type { PermissionCode } from "./permissions.constants";
import type { PolicyName } from "./policy-names.constants";
import type { StepUpPolicyName } from "./step-up.types";

export type AuthorizationScope =
  | "department"
  | "self"
  | "ownership"
  | "assignment"
  | "enrollment"
  | "public_verification";

export interface ResourceDescriptor {
  resourceType: string;
  resourceId?: string | null;
  departmentId?: string | null;
  ownerUserId?: string | null;
  teacherUserIds?: string[];
  studentUserIds?: string[];
  state?: string | null;
  visibility?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuthorizationRequirement {
  permissions?: PermissionCode[];
  policies?: PolicyName[];
  requireAudit?: boolean;
  stepUpPolicy?: StepUpPolicyName;
}

export interface PolicyEvaluationContext {
  principal: PrincipalContext | null;
  requestDepartmentId: string | null;
  resource?: ResourceDescriptor;
}

export interface PolicyDecision {
  allowed: boolean;
  reason:
    | "allowed"
    | "unauthenticated"
    | "missing_permission"
    | "department_mismatch"
    | "ownership_failed"
    | "state_restricted"
    | "step_up_required"
    | "policy_denied";
  stepUpPolicy?: StepUpPolicyName;
}

