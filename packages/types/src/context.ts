import type { ActorType, PermissionGrant, PlatformRole } from "./auth";

export type DepartmentContextKind =
  | "department"
  | "public_verification"
  | "unresolved";

export interface RoleAssignment {
  departmentId: string;
  role: PlatformRole;
}

export interface PrincipalContext {
  actorId: string;
  actorType: ActorType;
  isAuthenticated: boolean;
  activeDepartmentId: string | null;
  roleAssignments: RoleAssignment[];
  permissions: PermissionGrant[];
}

export interface DepartmentContext {
  kind: DepartmentContextKind;
  departmentId: string | null;
  source: "principal" | "route" | "header" | "public" | "unknown";
}

export interface RequestContext {
  requestId: string;
  path: string;
  method: string;
  principal: PrincipalContext | null;
  department: DepartmentContext;
  audit: {
    requestId: string;
    departmentId: string | null;
    ipAddress?: string;
    userAgent?: string;
  };
}
