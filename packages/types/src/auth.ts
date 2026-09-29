export type ActorType = "user" | "service";

export type PlatformRole =
  | "department_chairman"
  | "department_admin"
  | "teacher"
  | "student"
  | "auditor"
  | "support"
  | "poe_chairman"
  | "comprehensive_external";

export interface PermissionGrant {
  /** Persisted identities required by sensitive operations; absent legacy grants fail closed. */
  id?: string;
  code?: string;
  rolePermissionId?: string;
  action: string;
  resource: string;
  scope: "department" | "self" | "public_verification";
  source: {
    departmentId: string;
    userRoleId: string;
    roleId: string;
  };
}

export interface AuthContext {
  actorId: string;
  actorType: ActorType;
  departmentId?: string | null;
  roles: PlatformRole[];
  permissions: PermissionGrant[];
}
