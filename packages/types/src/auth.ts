export type ActorType = "user" | "service";

export type PlatformRole =
  | "system_admin"
  | "department_admin"
  | "teacher"
  | "student"
  | "auditor"
  | "support";

export interface PermissionGrant {
  action: string;
  resource: string;
  scope: "global" | "department" | "self";
}

export interface AuthContext {
  actorId: string;
  actorType: ActorType;
  departmentId?: string;
  roles: PlatformRole[];
  permissions: PermissionGrant[];
}

