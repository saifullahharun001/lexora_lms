import { DepartmentStatus, Prisma, type PrismaClient } from "@prisma/client";

import { SYLLABUS_VERSION_MANAGE_PROVISIONING as definition } from "./authorization-provisioning.definition";

type ProvisioningReadClient = Pick<
  Prisma.TransactionClient,
  "department" | "role" | "permission" | "rolePermission"
>;

export interface DepartmentSelector {
  readonly departmentId?: string;
  readonly departmentCode?: string;
}

interface ResolvedDepartment {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: DepartmentStatus;
  readonly archivedAt: Date | null;
  readonly deletedAt: Date | null;
}

interface ResolvedRole {
  readonly id: string;
  readonly departmentId: string;
  readonly code: string;
  readonly name: string;
  readonly archivedAt: Date | null;
}

interface ResolvedPermission {
  readonly id: string;
  readonly code: string;
  readonly resource: string;
  readonly action: string;
  readonly scope: string;
}

export type ExistingState = "ABSENT" | "EXACT";

export interface AuthorizationProvisioningPlan {
  readonly department: Pick<ResolvedDepartment, "id" | "code" | "name">;
  readonly role: Pick<ResolvedRole, "id" | "code" | "name">;
  readonly permission: {
    readonly id: string | null;
    readonly code: string;
    readonly resource: string;
    readonly action: string;
    readonly scope: string;
    readonly state: ExistingState;
  };
  readonly roleLink: {
    readonly id: string | null;
    readonly state: ExistingState;
  };
  readonly changes: {
    readonly permission: "CREATE" | "UNCHANGED";
    readonly rolePermission: "CREATE" | "UNCHANGED";
    readonly auditLog: "CREATE" | "UNCHANGED";
  };
}

export interface AuthorizationProvisioningResult {
  readonly plan: AuthorizationProvisioningPlan;
  readonly applied: boolean;
  readonly permissionCreated: boolean;
  readonly rolePermissionCreated: boolean;
  readonly auditRecorded: boolean;
}

export class AuthorizationProvisioningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationProvisioningError";
  }
}

const fail = (message: string): never => {
  throw new AuthorizationProvisioningError(message);
};

function normalizeSelector(selector: DepartmentSelector): DepartmentSelector {
  const departmentId = selector.departmentId?.trim();
  const departmentCode = selector.departmentCode?.trim();

  if (Boolean(departmentId) === Boolean(departmentCode)) {
    fail(
      "Provide exactly one non-empty department identifier or department code",
    );
  }

  return departmentId ? { departmentId } : { departmentCode };
}

async function resolveDepartment(
  client: ProvisioningReadClient,
  selector: DepartmentSelector,
): Promise<ResolvedDepartment> {
  const normalized = normalizeSelector(selector);
  const departments = await client.department.findMany({
    where: normalized.departmentId
      ? { id: normalized.departmentId }
      : { code: normalized.departmentCode },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      archivedAt: true,
      deletedAt: true,
    },
    take: 2,
  });

  if (departments.length !== 1) {
    fail(
      departments.length === 0
        ? "Target department was not found"
        : "Target department identity is ambiguous",
    );
  }

  const department = departments[0]!;
  if (
    department.status !== DepartmentStatus.ACTIVE ||
    department.archivedAt !== null ||
    department.deletedAt !== null
  ) {
    fail("Target department must be active, non-archived, and non-deleted");
  }

  return department;
}

async function resolveRole(
  client: ProvisioningReadClient,
  department: ResolvedDepartment,
): Promise<ResolvedRole> {
  const roles = await client.role.findMany({
    where: {
      departmentId: department.id,
      code: definition.targetRoleCode,
    },
    select: {
      id: true,
      departmentId: true,
      code: true,
      name: true,
      archivedAt: true,
    },
    take: 2,
  });

  if (roles.length !== 1) {
    fail(
      roles.length === 0
        ? "Target department has no Department Admin role"
        : "Target Department Admin role identity is ambiguous",
    );
  }

  const role = roles[0]!;
  if (
    role.departmentId !== department.id ||
    role.code !== definition.targetRoleCode
  ) {
    fail(
      "Resolved Department Admin role does not belong to the target department",
    );
  }
  if (role.archivedAt !== null) {
    fail("Target Department Admin role is archived");
  }

  return role;
}

function hasExactPermissionSemantics(permission: ResolvedPermission): boolean {
  return (
    permission.resource === definition.permission.resource &&
    permission.action === definition.permission.action &&
    permission.scope === definition.permission.scope
  );
}

async function resolvePermission(
  client: ProvisioningReadClient,
): Promise<ResolvedPermission | null> {
  const permissions = await client.permission.findMany({
    where: {
      OR: [
        { code: definition.permission.code },
        {
          resource: definition.permission.resource,
          action: definition.permission.action,
          scope: definition.permission.scope,
        },
      ],
    },
    select: {
      id: true,
      code: true,
      resource: true,
      action: true,
      scope: true,
    },
  });

  const codeMatches = permissions.filter(
    (permission) => permission.code === definition.permission.code,
  );
  if (codeMatches.length > 1) {
    fail("Permission code identity is ambiguous");
  }

  const codeMatch = codeMatches[0];
  if (codeMatch && !hasExactPermissionSemantics(codeMatch)) {
    fail("Permission code exists with conflicting resource, action, or scope");
  }

  const incompatibleEquivalent = permissions.find(
    (permission) =>
      permission.code !== definition.permission.code &&
      hasExactPermissionSemantics(permission),
  );
  if (incompatibleEquivalent) {
    fail(
      "Equivalent permission semantics already exist under an incompatible code",
    );
  }

  return codeMatch ?? null;
}

async function resolveRoleLink(
  client: ProvisioningReadClient,
  role: ResolvedRole,
  permission: ResolvedPermission | null,
) {
  if (!permission) return null;

  const links = await client.rolePermission.findMany({
    where: {
      roleId: role.id,
      permissionId: permission.id,
    },
    select: {
      id: true,
      roleId: true,
      permissionId: true,
    },
    take: 2,
  });

  if (links.length > 1) fail("Role-permission link identity is ambiguous");
  const link = links[0];
  if (
    link &&
    (link.roleId !== role.id || link.permissionId !== permission.id)
  ) {
    fail(
      "Resolved role-permission link does not match the exact target identities",
    );
  }

  return link ?? null;
}

async function loadPlan(
  client: ProvisioningReadClient,
  selector: DepartmentSelector,
): Promise<AuthorizationProvisioningPlan> {
  const department = await resolveDepartment(client, selector);
  const role = await resolveRole(client, department);
  const permission = await resolvePermission(client);
  const roleLink = await resolveRoleLink(client, role, permission);
  const hasChanges = permission === null || roleLink === null;

  return {
    department: {
      id: department.id,
      code: department.code,
      name: department.name,
    },
    role: { id: role.id, code: role.code, name: role.name },
    permission: {
      id: permission?.id ?? null,
      code: definition.permission.code,
      resource: definition.permission.resource,
      action: definition.permission.action,
      scope: definition.permission.scope,
      state: permission ? "EXACT" : "ABSENT",
    },
    roleLink: {
      id: roleLink?.id ?? null,
      state: roleLink ? "EXACT" : "ABSENT",
    },
    changes: {
      permission: permission ? "UNCHANGED" : "CREATE",
      rolePermission: roleLink ? "UNCHANGED" : "CREATE",
      auditLog: hasChanges ? "CREATE" : "UNCHANGED",
    },
  };
}

export function parseAuthorizationProvisioningArguments(
  args: readonly string[],
): { selector: DepartmentSelector; apply: boolean } {
  let departmentId: string | undefined;
  let departmentCode: string | undefined;
  let apply = false;

  for (const argument of args) {
    if (argument === "--apply") {
      if (apply) fail("Duplicate --apply flag");
      apply = true;
      continue;
    }

    const match = /^--(department-id|department-code)=(.*)$/.exec(argument);
    if (!match) {
      throw new AuthorizationProvisioningError(
        "Unsupported or malformed provisioning argument",
      );
    }
    const value = match[2]!.trim();
    if (!value) fail("Department selector value cannot be empty");

    if (match[1] === "department-id") {
      if (departmentId !== undefined)
        fail("Duplicate --department-id argument");
      departmentId = value;
    } else {
      if (departmentCode !== undefined)
        fail("Duplicate --department-code argument");
      departmentCode = value;
    }
  }

  return {
    selector: normalizeSelector({ departmentId, departmentCode }),
    apply,
  };
}

export async function planAuthorizationProvisioning(
  prisma: PrismaClient,
  selector: DepartmentSelector,
): Promise<AuthorizationProvisioningResult> {
  return {
    plan: await loadPlan(prisma, selector),
    applied: false,
    permissionCreated: false,
    rolePermissionCreated: false,
    auditRecorded: false,
  };
}

export async function applyAuthorizationProvisioning(
  prisma: PrismaClient,
  selector: DepartmentSelector,
): Promise<AuthorizationProvisioningResult> {
  return prisma.$transaction(
    async (tx) => {
      const plan = await loadPlan(tx, selector);
      if (
        plan.permission.state === "EXACT" &&
        plan.roleLink.state === "EXACT"
      ) {
        return {
          plan,
          applied: true,
          permissionCreated: false,
          rolePermissionCreated: false,
          auditRecorded: false,
        };
      }

      const permission =
        plan.permission.state === "EXACT"
          ? { id: plan.permission.id! }
          : await tx.permission.create({
              data: definition.permission,
              select: { id: true },
            });
      const rolePermission =
        plan.roleLink.state === "EXACT"
          ? { id: plan.roleLink.id! }
          : await tx.rolePermission.create({
              data: {
                roleId: plan.role.id,
                permissionId: permission.id,
              },
              select: { id: true },
            });

      await tx.auditLog.create({
        data: {
          actorUserId: null,
          actorType: "SERVICE",
          departmentId: plan.department.id,
          action: definition.auditAction,
          targetType: "role_permission",
          targetId: rolePermission.id,
          outcome: "SUCCESS",
          contextJson: {
            mode: "APPLY",
            departmentCode: plan.department.code,
            roleCode: plan.role.code,
            permissionCode: definition.permission.code,
            permissionCreated: plan.permission.state === "ABSENT",
            rolePermissionCreated: plan.roleLink.state === "ABSENT",
          },
        },
      });

      return {
        plan,
        applied: true,
        permissionCreated: plan.permission.state === "ABSENT",
        rolePermissionCreated: plan.roleLink.state === "ABSENT",
        auditRecorded: true,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 30_000,
    },
  );
}

export function sanitizedProvisioningSummary(
  result: AuthorizationProvisioningResult,
) {
  return {
    mode: result.applied ? "APPLY" : "DRY_RUN",
    department: result.plan.department,
    role: result.plan.role,
    permission: result.plan.permission,
    roleLink: result.plan.roleLink,
    changes: result.plan.changes,
    applied: result.applied,
    permissionCreated: result.permissionCreated,
    rolePermissionCreated: result.rolePermissionCreated,
    auditRecorded: result.auditRecorded,
    noOp:
      result.plan.changes.permission === "UNCHANGED" &&
      result.plan.changes.rolePermission === "UNCHANGED",
  };
}
