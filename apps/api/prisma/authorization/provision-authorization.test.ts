import assert from "node:assert/strict";
import test from "node:test";

import {
  DepartmentStatus,
  PermissionScope,
  type PrismaClient,
} from "@prisma/client";

import {
  applyAuthorizationProvisioning,
  AuthorizationProvisioningError,
  parseAuthorizationProvisioningArguments,
  planAuthorizationProvisioning,
  sanitizedProvisioningSummary,
} from "./provision-authorization";

const permissionDefinition = {
  code: "course-management.syllabus-version.manage",
  resource: "course-management.syllabus-version",
  action: "manage",
  scope: PermissionScope.DEPARTMENT,
} as const;

interface TestDepartment {
  id: string;
  code: string;
  name: string;
  status: DepartmentStatus;
  archivedAt: Date | null;
  deletedAt: Date | null;
}

interface TestRole {
  id: string;
  departmentId: string;
  code: string;
  name: string;
  archivedAt: Date | null;
}

interface TestPermission {
  id: string;
  code: string;
  resource: string;
  action: string;
  scope: PermissionScope;
  description?: string | null;
}

interface TestRolePermission {
  id: string;
  roleId: string;
  permissionId: string;
}

interface TestState {
  departments: TestDepartment[];
  roles: TestRole[];
  permissions: TestPermission[];
  rolePermissions: TestRolePermission[];
  audits: Array<Record<string, unknown>>;
}

interface TestCounters {
  reads: number;
  writes: number;
  permissionCreates: number;
  rolePermissionCreates: number;
  auditCreates: number;
  transactions: number;
}

const departmentA: TestDepartment = {
  id: "department-a",
  code: "LAW",
  name: "Department of Law",
  status: DepartmentStatus.ACTIVE,
  archivedAt: null,
  deletedAt: null,
};

const departmentB: TestDepartment = {
  id: "department-b",
  code: "BUS",
  name: "Department of Business",
  status: DepartmentStatus.ACTIVE,
  archivedAt: null,
  deletedAt: null,
};

const adminRoleA: TestRole = {
  id: "admin-role-a",
  departmentId: departmentA.id,
  code: "department_admin",
  name: "Department Admin",
  archivedAt: null,
};

const exactPermission: TestPermission = {
  id: "permission-syllabus-manage",
  ...permissionDefinition,
};

function baseState(): TestState {
  return {
    departments: [structuredClone(departmentA)],
    roles: [structuredClone(adminRoleA)],
    permissions: [],
    rolePermissions: [],
    audits: [],
  };
}

function makeHarness(
  initialState: TestState = baseState(),
  options: {
    failRolePermissionCreate?: boolean;
    failAuditCreate?: boolean;
  } = {},
) {
  let state = structuredClone(initialState);
  let nextId = 1;
  const counters: TestCounters = {
    reads: 0,
    writes: 0,
    permissionCreates: 0,
    rolePermissionCreates: 0,
    auditCreates: 0,
    transactions: 0,
  };

  const delegates = (getState: () => TestState) => ({
    department: {
      findMany: async (query: { where: { id?: string; code?: string } }) => {
        counters.reads += 1;
        return getState()
          .departments.filter(
            (department) =>
              (query.where.id === undefined ||
                department.id === query.where.id) &&
              (query.where.code === undefined ||
                department.code === query.where.code),
          )
          .slice(0, 2);
      },
    },
    role: {
      findMany: async (query: {
        where: { departmentId: string; code: string };
      }) => {
        counters.reads += 1;
        return getState()
          .roles.filter(
            (role) =>
              role.departmentId === query.where.departmentId &&
              role.code === query.where.code,
          )
          .slice(0, 2);
      },
    },
    permission: {
      findMany: async () => {
        counters.reads += 1;
        return getState().permissions.filter(
          (permission) =>
            permission.code === permissionDefinition.code ||
            (permission.resource === permissionDefinition.resource &&
              permission.action === permissionDefinition.action &&
              permission.scope === permissionDefinition.scope),
        );
      },
      create: async (query: { data: Omit<TestPermission, "id"> }) => {
        counters.writes += 1;
        counters.permissionCreates += 1;
        const permission = {
          id: `created-permission-${nextId++}`,
          ...query.data,
        };
        getState().permissions.push(permission);
        return { id: permission.id };
      },
    },
    rolePermission: {
      findMany: async (query: {
        where: { roleId: string; permissionId: string };
      }) => {
        counters.reads += 1;
        return getState()
          .rolePermissions.filter(
            (link) =>
              link.roleId === query.where.roleId &&
              link.permissionId === query.where.permissionId,
          )
          .slice(0, 2);
      },
      create: async (query: {
        data: { roleId: string; permissionId: string };
      }) => {
        counters.writes += 1;
        counters.rolePermissionCreates += 1;
        if (options.failRolePermissionCreate) {
          throw new Error("simulated role-permission failure");
        }
        const link = {
          id: `created-role-permission-${nextId++}`,
          ...query.data,
        };
        getState().rolePermissions.push(link);
        return { id: link.id };
      },
    },
    auditLog: {
      create: async (query: { data: Record<string, unknown> }) => {
        counters.writes += 1;
        counters.auditCreates += 1;
        if (options.failAuditCreate) {
          throw new Error("simulated audit failure");
        }
        getState().audits.push(structuredClone(query.data));
        return { id: `audit-${nextId++}` };
      },
    },
  });

  const client = {
    ...delegates(() => state),
    $transaction: async (
      operation: (transaction: unknown) => Promise<unknown>,
    ) => {
      counters.transactions += 1;
      const staged = structuredClone(state);
      const result = await operation(delegates(() => staged));
      state = staged;
      return result;
    },
  } as unknown as PrismaClient;

  return { client, counters, state: () => structuredClone(state) };
}

const byCode = { departmentCode: departmentA.code } as const;

test("CLI defaults to dry run and requires exactly one explicit department selector", () => {
  assert.deepEqual(
    parseAuthorizationProvisioningArguments(["--department-code=LAW"]),
    { selector: byCode, apply: false },
  );
  assert.deepEqual(
    parseAuthorizationProvisioningArguments([
      "--department-id=department-a",
      "--apply",
    ]),
    { selector: { departmentId: "department-a" }, apply: true },
  );
  for (const args of [
    [],
    ["--apply"],
    ["--department-code=LAW", "--department-id=department-a"],
    ["--department-code="],
    ["--unknown=value"],
  ]) {
    assert.throws(
      () => parseAuthorizationProvisioningArguments(args),
      AuthorizationProvisioningError,
    );
  }
});

test("dry run performs all validation with zero writes", async () => {
  const h = makeHarness();
  const result = await planAuthorizationProvisioning(h.client, byCode);

  assert.equal(result.applied, false);
  assert.equal(result.plan.permission.state, "ABSENT");
  assert.equal(result.plan.roleLink.state, "ABSENT");
  assert.deepEqual(result.plan.changes, {
    permission: "CREATE",
    rolePermission: "CREATE",
    auditLog: "CREATE",
  });
  assert.equal(h.counters.writes, 0);
  assert.equal(h.counters.transactions, 0);
});

test("missing department fails closed", async () => {
  const state = baseState();
  state.departments = [];
  await assert.rejects(
    planAuthorizationProvisioning(makeHarness(state).client, byCode),
    /Target department was not found/,
  );
});

test("inactive, archived, and deleted departments fail closed", async () => {
  for (const invalid of [
    { status: DepartmentStatus.DISABLED },
    { archivedAt: new Date("2026-01-01T00:00:00.000Z") },
    { deletedAt: new Date("2026-01-01T00:00:00.000Z") },
  ]) {
    const state = baseState();
    state.departments[0] = { ...state.departments[0]!, ...invalid };
    await assert.rejects(
      planAuthorizationProvisioning(makeHarness(state).client, byCode),
      /active, non-archived, and non-deleted/,
    );
  }
});

test("missing Department Admin role fails closed", async () => {
  const state = baseState();
  state.roles = [];
  await assert.rejects(
    planAuthorizationProvisioning(makeHarness(state).client, byCode),
    /no Department Admin role/,
  );
});

test("a Department Admin role from another department cannot be selected", async () => {
  const state = baseState();
  state.roles = [
    { ...adminRoleA, id: "admin-role-b", departmentId: departmentB.id },
  ];
  await assert.rejects(
    planAuthorizationProvisioning(makeHarness(state).client, byCode),
    /no Department Admin role/,
  );
});

test("archived Department Admin role fails closed", async () => {
  const state = baseState();
  state.roles[0]!.archivedAt = new Date("2026-01-01T00:00:00.000Z");
  await assert.rejects(
    planAuthorizationProvisioning(makeHarness(state).client, byCode),
    /role is archived/,
  );
});

test("absent permission is planned and created with exact semantics", async () => {
  const h = makeHarness();
  const result = await applyAuthorizationProvisioning(h.client, byCode);

  assert.equal(result.permissionCreated, true);
  assert.equal(h.counters.permissionCreates, 1);
  assert.deepEqual(
    h
      .state()
      .permissions.map(
        ({ description: _description, ...permission }) => permission,
      ),
    [{ id: "created-permission-1", ...permissionDefinition }],
  );
});

test("exact existing permission is reused without redefining it", async () => {
  const state = baseState();
  state.permissions.push(structuredClone(exactPermission));
  const h = makeHarness(state);
  const result = await applyAuthorizationProvisioning(h.client, byCode);

  assert.equal(result.permissionCreated, false);
  assert.equal(h.counters.permissionCreates, 0);
  assert.equal(h.state().permissions.length, 1);
});

test("permission code semantic mismatch fails closed without writes", async () => {
  const state = baseState();
  state.permissions.push({
    ...exactPermission,
    resource: "course-management.curriculum-version",
  });
  const h = makeHarness(state);
  await assert.rejects(
    applyAuthorizationProvisioning(h.client, byCode),
    /conflicting resource, action, or scope/,
  );
  assert.equal(h.counters.writes, 0);
});

test("equivalent semantics under an incompatible code fail closed", async () => {
  const state = baseState();
  state.permissions.push({
    ...exactPermission,
    code: "legacy.syllabus-version.manage",
  });
  const h = makeHarness(state);
  await assert.rejects(
    applyAuthorizationProvisioning(h.client, byCode),
    /incompatible code/,
  );
  assert.equal(h.counters.writes, 0);
});

test("absent role link is planned and created only for the exact Admin role", async () => {
  const state = baseState();
  state.permissions.push(structuredClone(exactPermission));
  const h = makeHarness(state);
  const plan = await planAuthorizationProvisioning(h.client, byCode);
  assert.equal(plan.plan.roleLink.state, "ABSENT");

  await applyAuthorizationProvisioning(h.client, byCode);
  assert.deepEqual(h.state().rolePermissions, [
    {
      id: "created-role-permission-1",
      roleId: adminRoleA.id,
      permissionId: exactPermission.id,
    },
  ]);
});

test("existing exact role link is idempotent and apply is a true no-op", async () => {
  const state = baseState();
  state.permissions.push(structuredClone(exactPermission));
  state.rolePermissions.push({
    id: "existing-link",
    roleId: adminRoleA.id,
    permissionId: exactPermission.id,
  });
  const h = makeHarness(state);
  const result = await applyAuthorizationProvisioning(h.client, byCode);

  assert.equal(result.plan.roleLink.state, "EXACT");
  assert.equal(result.rolePermissionCreated, false);
  assert.equal(result.auditRecorded, false);
  assert.equal(h.counters.writes, 0);
});

test("repeated apply is safe and does not duplicate permission, link, or audit", async () => {
  const h = makeHarness();
  const first = await applyAuthorizationProvisioning(h.client, byCode);
  const writesAfterFirst = h.counters.writes;
  const second = await applyAuthorizationProvisioning(h.client, byCode);

  assert.equal(first.permissionCreated, true);
  assert.equal(first.rolePermissionCreated, true);
  assert.equal(first.auditRecorded, true);
  assert.equal(second.permissionCreated, false);
  assert.equal(second.rolePermissionCreated, false);
  assert.equal(second.auditRecorded, false);
  assert.equal(h.counters.writes, writesAfterFirst);
  assert.equal(h.state().permissions.length, 1);
  assert.equal(h.state().rolePermissions.length, 1);
  assert.equal(h.state().audits.length, 1);
});

test("Teacher and Student roles are never granted", async () => {
  const state = baseState();
  state.roles.push(
    {
      id: "teacher-role-a",
      departmentId: departmentA.id,
      code: "teacher",
      name: "Teacher",
      archivedAt: null,
    },
    {
      id: "student-role-a",
      departmentId: departmentA.id,
      code: "student",
      name: "Student",
      archivedAt: null,
    },
  );
  const h = makeHarness(state);
  await applyAuthorizationProvisioning(h.client, byCode);

  assert.deepEqual(
    h.state().rolePermissions.map((link) => link.roleId),
    [adminRoleA.id],
  );
});

test("another department remains unchanged", async () => {
  const state = baseState();
  state.departments.push(structuredClone(departmentB));
  state.roles.push({
    id: "admin-role-b",
    departmentId: departmentB.id,
    code: "department_admin",
    name: "Department Admin",
    archivedAt: null,
  });
  state.permissions.push({
    id: "other-permission",
    code: "course-management.course.read_department",
    resource: "course-management.course",
    action: "read",
    scope: PermissionScope.DEPARTMENT,
  });
  state.rolePermissions.push({
    id: "other-department-link",
    roleId: "admin-role-b",
    permissionId: "other-permission",
  });
  const h = makeHarness(state);
  await applyAuthorizationProvisioning(h.client, byCode);

  assert.deepEqual(
    h
      .state()
      .rolePermissions.find((link) => link.id === "other-department-link"),
    state.rolePermissions[0],
  );
  assert.equal(
    h
      .state()
      .rolePermissions.some(
        (link) =>
          link.roleId === "admin-role-b" &&
          link.permissionId !== "other-permission",
      ),
    false,
  );
});

test("unrelated permissions and role links remain unchanged", async () => {
  const state = baseState();
  const unrelatedPermission: TestPermission = {
    id: "unrelated-permission",
    code: "attendance.record.read_department",
    resource: "attendance.record",
    action: "read",
    scope: PermissionScope.DEPARTMENT,
  };
  const unrelatedLink = {
    id: "unrelated-link",
    roleId: adminRoleA.id,
    permissionId: unrelatedPermission.id,
  };
  state.permissions.push(unrelatedPermission);
  state.rolePermissions.push(unrelatedLink);
  const h = makeHarness(state);
  await applyAuthorizationProvisioning(h.client, byCode);

  assert.deepEqual(
    h.state().permissions.find((item) => item.id === unrelatedPermission.id),
    unrelatedPermission,
  );
  assert.deepEqual(
    h.state().rolePermissions.find((item) => item.id === unrelatedLink.id),
    unrelatedLink,
  );
});

test("transaction failure leaves no partial permission or link state", async () => {
  const h = makeHarness(baseState(), { failRolePermissionCreate: true });
  await assert.rejects(
    applyAuthorizationProvisioning(h.client, byCode),
    /simulated role-permission failure/,
  );

  assert.equal(h.counters.transactions, 1);
  assert.equal(h.state().permissions.length, 0);
  assert.equal(h.state().rolePermissions.length, 0);
  assert.equal(h.state().audits.length, 0);
});

test("audit failure rolls back the staged permission and role link", async () => {
  const h = makeHarness(baseState(), { failAuditCreate: true });
  await assert.rejects(
    applyAuthorizationProvisioning(h.client, byCode),
    /simulated audit failure/,
  );

  assert.equal(h.counters.transactions, 1);
  assert.equal(h.counters.permissionCreates, 1);
  assert.equal(h.counters.rolePermissionCreates, 1);
  assert.equal(h.counters.auditCreates, 1);
  assert.equal(h.state().permissions.length, 0);
  assert.equal(h.state().rolePermissions.length, 0);
  assert.equal(h.state().audits.length, 0);
});

test("successful apply writes a service audit without a fabricated user actor", async () => {
  const h = makeHarness();
  await applyAuthorizationProvisioning(h.client, byCode);

  assert.equal(h.state().audits.length, 1);
  assert.equal(h.state().audits[0]!.actorType, "SERVICE");
  assert.equal(h.state().audits[0]!.actorUserId, null);
  assert.equal(h.state().audits[0]!.departmentId, departmentA.id);
  assert.deepEqual(h.state().audits[0]!.contextJson, {
    mode: "APPLY",
    departmentCode: departmentA.code,
    roleCode: adminRoleA.code,
    permissionCode: permissionDefinition.code,
    permissionCreated: true,
    rolePermissionCreated: true,
  });
});

test("normal output is deterministic and does not emit ambient secrets", async () => {
  const secret = "postgresql://operator:secret-password@private/db";
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = secret;
  try {
    const result = await planAuthorizationProvisioning(
      makeHarness().client,
      byCode,
    );
    const output = JSON.stringify(sanitizedProvisioningSummary(result));

    assert.equal(output.includes(secret), false);
    assert.equal(output.includes("secret-password"), false);
    assert.equal(output.includes("DATABASE_URL"), false);
    assert.equal(output.includes("passwordHash"), false);
    assert.equal(output.includes("token"), false);
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
});
