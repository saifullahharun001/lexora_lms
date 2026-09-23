export type ActorType = "user" | "service";

export type PlatformRole =
  | "department_admin"
  | "teacher"
  | "student"
  | "auditor"
  | "support"
  | "poe_chairman"
  | "comprehensive_external";

export interface PermissionGrant {
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
