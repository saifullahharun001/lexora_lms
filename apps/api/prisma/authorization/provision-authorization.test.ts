import assert from "node:assert/strict";
import test from "node:test";

import {
  DepartmentStatus,
  PermissionScope,
  Prisma,
  type PrismaClient,
} from "@prisma/client";

import {
  AUTHORIZATION_PROVISIONING_DEFINITIONS,
  SYLLABUS_VERSION_LIFECYCLE_MANAGE_PROVISIONING,
  SYLLABUS_VERSION_MANAGE_PROVISIONING,
  type AuthorizationProvisioningDefinition,
} from "./authorization-provisioning.definition";
import {
  applyAuthorizationProvisioning,
  AuthorizationProvisioningError,
  parseAuthorizationProvisioningArguments,
  planAuthorizationProvisioning,
  sanitizedProvisioningSummary,
  type AuthorizationProvisioningResult,
} from "./provision-authorization";

const manageDefinition = SYLLABUS_VERSION_MANAGE_PROVISIONING;
const lifecycleDefinition = SYLLABUS_VERSION_LIFECYCLE_MANAGE_PROVISIONING;

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
  permissionCreateCodes: string[];
  rolePermissionCreateCodes: string[];
  auditActions: string[];
  isolationLevels: unknown[];
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

function exactPermission(
  definition: AuthorizationProvisioningDefinition,
  id: string,
): TestPermission {
  return {
    id,
    code: definition.permission.code,
    resource: definition.permission.resource,
    action: definition.permission.action,
    scope: definition.permission.scope,
  };
}

const exactManagePermission = exactPermission(
  manageDefinition,
  "permission-syllabus-manage",
);
const exactLifecyclePermission = exactPermission(
  lifecycleDefinition,
  "permission-syllabus-lifecycle-manage",
);
const exactManageLink: TestRolePermission = {
  id: "role-permission-syllabus-manage",
  roleId: adminRoleA.id,
  permissionId: exactManagePermission.id,
};
const exactLifecycleLink: TestRolePermission = {
  id: "role-permission-syllabus-lifecycle-manage",
  roleId: adminRoleA.id,
  permissionId: exactLifecyclePermission.id,
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

function ordinaryRuntimeState(): TestState {
  const state = baseState();
  state.permissions.push(structuredClone(exactManagePermission));
  state.rolePermissions.push(structuredClone(exactManageLink));
  return state;
}

function completeState(): TestState {
  const state = ordinaryRuntimeState();
  state.permissions.push(structuredClone(exactLifecyclePermission));
  state.rolePermissions.push(structuredClone(exactLifecycleLink));
  return state;
}

function makeHarness(
  initialState: TestState = baseState(),
  options: {
    failRolePermissionForCode?: string;
    failAuditForCode?: string;
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
    permissionCreateCodes: [],
    rolePermissionCreateCodes: [],
    auditActions: [],
    isolationLevels: [],
  };

  const delegates = (getState: () => TestState) => ({
    department: {
      findMany: async (query: {
        where: { id?: string; code?: string };
        take: number;
      }) => {
        counters.reads += 1;
        return getState()
          .departments.filter(
            (department) =>
              (query.where.id === undefined ||
                department.id === query.where.id) &&
              (query.where.code === undefined ||
                department.code === query.where.code),
          )
          .slice(0, query.take);
      },
    },
    role: {
      findMany: async (query: {
        where: { departmentId: string; code: string };
        take: number;
      }) => {
        counters.reads += 1;
        return getState()
          .roles.filter(
            (role) =>
              role.departmentId === query.where.departmentId &&
              role.code === query.where.code,
          )
          .slice(0, query.take);
      },
    },
    permission: {
      findMany: async (query: {
        where: {
          OR: Array<{
            code?: string;
            resource?: string;
            action?: string;
            scope?: PermissionScope;
          }>;
        };
      }) => {
        counters.reads += 1;
        return getState().permissions.filter((permission) =>
          query.where.OR.some(
            (candidate) =>
              (candidate.code === undefined ||
                candidate.code === permission.code) &&
              (candidate.resource === undefined ||
                candidate.resource === permission.resource) &&
              (candidate.action === undefined ||
                candidate.action === permission.action) &&
              (candidate.scope === undefined ||
                candidate.scope === permission.scope),
          ),
        );
      },
      create: async (query: { data: Omit<TestPermission, "id"> }) => {
        counters.writes += 1;
        counters.permissionCreates += 1;
        counters.permissionCreateCodes.push(query.data.code);
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
        take: number;
      }) => {
        counters.reads += 1;
        return getState()
          .rolePermissions.filter(
            (link) =>
              link.roleId === query.where.roleId &&
              link.permissionId === query.where.permissionId,
          )
          .slice(0, query.take);
      },
      create: async (query: {
        data: { roleId: string; permissionId: string };
      }) => {
        counters.writes += 1;
        counters.rolePermissionCreates += 1;
        const permissionCode = getState().permissions.find(
          (permission) => permission.id === query.data.permissionId,
        )?.code;
        if (!permissionCode) throw new Error("permission identity not found");
        counters.rolePermissionCreateCodes.push(permissionCode);
        if (options.failRolePermissionForCode === permissionCode) {
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
        counters.auditActions.push(query.data.action as string);
        const context = query.data.contextJson as Record<string, unknown>;
        if (options.failAuditForCode === context.permissionCode) {
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
      transactionOptions: { isolationLevel?: unknown },
    ) => {
      counters.transactions += 1;
      counters.isolationLevels.push(transactionOptions.isolationLevel);
      const staged = structuredClone(state);
      const result = await operation(delegates(() => staged));
      state = staged;
      return result;
    },
  } as unknown as PrismaClient;

  return { client, counters, state: () => structuredClone(state) };
}

function planFor(result: AuthorizationProvisioningResult, code: string) {
  const plan = result.plan.definitions.find(
    (definition) => definition.permission.code === code,
  );
  assert.ok(plan, `missing plan for ${code}`);
  return plan;
}

function resultFor(result: AuthorizationProvisioningResult, code: string) {
  const definition = result.definitions.find(
    (candidate) => candidate.permissionCode === code,
  );
  assert.ok(definition, `missing result for ${code}`);
  return definition;
}

const byCode = { departmentCode: departmentA.code } as const;

test("definition set preserves manage authority and adds distinct exact lifecycle authority", () => {
  assert.deepEqual(manageDefinition, {
    permission: {
      code: "course-management.syllabus-version.manage",
      resource: "course-management.syllabus-version",
      action: "manage",
      scope: PermissionScope.DEPARTMENT,
      description:
        "Manage syllabus versions within the active department governance scope",
    },
    targetRoleCode: "department_admin",
    auditAction: "authorization.syllabus-version-manage.provisioned",
  });
  assert.deepEqual(lifecycleDefinition, {
    permission: {
      code: "course-management.syllabus-version.lifecycle.manage",
      resource: "course-management.syllabus-version.lifecycle",
      action: "manage",
      scope: PermissionScope.DEPARTMENT,
      description:
        "Manage syllabus version lifecycle transitions within the active department governance scope",
    },
    targetRoleCode: "department_admin",
    auditAction: "authorization.syllabus-version-lifecycle-manage.provisioned",
  });
  assert.deepEqual(AUTHORIZATION_PROVISIONING_DEFINITIONS, [
    manageDefinition,
    lifecycleDefinition,
  ]);
  assert.equal(
    new Set(
      AUTHORIZATION_PROVISIONING_DEFINITIONS.map(
        (definition) => definition.permission.code,
      ),
    ).size,
    AUTHORIZATION_PROVISIONING_DEFINITIONS.length,
  );
  assert.equal(
    new Set(
      AUTHORIZATION_PROVISIONING_DEFINITIONS.map((definition) =>
        [
          definition.permission.resource,
          definition.permission.action,
          definition.permission.scope,
        ].join("|"),
      ),
    ).size,
    AUTHORIZATION_PROVISIONING_DEFINITIONS.length,
  );
});

test("CLI remains dry-run by default and apply remains explicit", () => {
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
});

test("CLI rejects missing, duplicate, malformed, unsupported, and standalone separator arguments", () => {
  for (const args of [
    [],
    ["--apply"],
    ["--department-code=LAW", "--department-id=department-a"],
    ["--department-code="],
    ["--unknown=value"],
    ["--department-code=LAW", "--apply", "--apply"],
    ["--department-code=LAW", "--"],
  ]) {
    assert.throws(
      () => parseAuthorizationProvisioningArguments(args),
      AuthorizationProvisioningError,
    );
  }
});

test("ordinary-runtime-shaped dry run evaluates both definitions without writes or transaction", async () => {
  const h = makeHarness(ordinaryRuntimeState());
  const result = await planAuthorizationProvisioning(h.client, byCode);
  const managePlan = planFor(result, manageDefinition.permission.code);
  const lifecyclePlan = planFor(result, lifecycleDefinition.permission.code);

  assert.equal(result.applied, false);
  assert.equal(result.plan.definitions.length, 2);
  assert.equal(managePlan.permission.state, "EXACT");
  assert.equal(managePlan.roleLink.state, "EXACT");
  assert.deepEqual(managePlan.changes, {
    permission: "UNCHANGED",
    rolePermission: "UNCHANGED",
    auditLog: "UNCHANGED",
  });
  assert.equal(lifecyclePlan.permission.state, "ABSENT");
  assert.equal(lifecyclePlan.roleLink.state, "ABSENT");
  assert.deepEqual(lifecyclePlan.changes, {
    permission: "CREATE",
    rolePermission: "CREATE",
    auditLog: "CREATE",
  });
  assert.equal(h.counters.writes, 0);
  assert.equal(h.counters.transactions, 0);
});

test("ordinary-runtime-shaped apply creates only lifecycle permission, link, and audit", async () => {
  const initial = ordinaryRuntimeState();
  const existingManagePermission = structuredClone(initial.permissions[0]);
  const existingManageLink = structuredClone(initial.rolePermissions[0]);
  const h = makeHarness(initial);
  const result = await applyAuthorizationProvisioning(h.client, byCode);
  const manageResult = resultFor(result, manageDefinition.permission.code);
  const lifecycleResult = resultFor(
    result,
    lifecycleDefinition.permission.code,
  );

  assert.deepEqual(manageResult, {
    permissionCode: manageDefinition.permission.code,
    permissionCreated: false,
    rolePermissionCreated: false,
    auditRecorded: false,
  });
  assert.deepEqual(lifecycleResult, {
    permissionCode: lifecycleDefinition.permission.code,
    permissionCreated: true,
    rolePermissionCreated: true,
    auditRecorded: true,
  });
  assert.deepEqual(h.counters.permissionCreateCodes, [
    lifecycleDefinition.permission.code,
  ]);
  assert.deepEqual(h.counters.rolePermissionCreateCodes, [
    lifecycleDefinition.permission.code,
  ]);
  assert.deepEqual(h.counters.auditActions, [lifecycleDefinition.auditAction]);
  assert.equal(h.counters.transactions, 1);
  assert.deepEqual(h.counters.isolationLevels, [
    Prisma.TransactionIsolationLevel.Serializable,
  ]);
  assert.deepEqual(h.state().permissions[0], existingManagePermission);
  assert.deepEqual(h.state().rolePermissions[0], existingManageLink);
  assert.equal(h.state().permissions.length, 2);
  assert.equal(h.state().rolePermissions.length, 2);
  assert.equal(h.state().audits.length, 1);
});

test("lifecycle provisioning audit is exact and uses no fabricated user actor", async () => {
  const h = makeHarness(ordinaryRuntimeState());
  await applyAuthorizationProvisioning(h.client, byCode);

  assert.equal(h.state().audits.length, 1);
  const audit = h.state().audits[0]!;
  assert.equal(audit.actorType, "SERVICE");
  assert.equal(audit.actorUserId, null);
  assert.equal(audit.departmentId, departmentA.id);
  assert.equal(audit.action, lifecycleDefinition.auditAction);
  assert.equal(audit.targetType, "role_permission");
  assert.deepEqual(audit.contextJson, {
    mode: "APPLY",
    departmentCode: departmentA.code,
    roleCode: adminRoleA.code,
    permissionCode: lifecycleDefinition.permission.code,
    permissionCreated: true,
    rolePermissionCreated: true,
  });
});

test("second apply is a true no-op for both definitions", async () => {
  const h = makeHarness(ordinaryRuntimeState());
  await applyAuthorizationProvisioning(h.client, byCode);
  const writesAfterFirst = h.counters.writes;
  const second = await applyAuthorizationProvisioning(h.client, byCode);

  for (const definition of second.plan.definitions) {
    assert.equal(definition.permission.state, "EXACT");
    assert.equal(definition.roleLink.state, "EXACT");
    assert.deepEqual(definition.changes, {
      permission: "UNCHANGED",
      rolePermission: "UNCHANGED",
      auditLog: "UNCHANGED",
    });
  }
  for (const result of second.definitions) {
    assert.equal(result.permissionCreated, false);
    assert.equal(result.rolePermissionCreated, false);
    assert.equal(result.auditRecorded, false);
  }
  assert.equal(h.counters.writes, writesAfterFirst);
  assert.equal(h.state().permissions.length, 2);
  assert.equal(h.state().rolePermissions.length, 2);
  assert.equal(h.state().audits.length, 1);
});

test("exact lifecycle permission with absent link creates only link and one audit", async () => {
  const state = ordinaryRuntimeState();
  state.permissions.push(structuredClone(exactLifecyclePermission));
  const h = makeHarness(state);
  const result = await applyAuthorizationProvisioning(h.client, byCode);
  const lifecycleResult = resultFor(
    result,
    lifecycleDefinition.permission.code,
  );

  assert.equal(lifecycleResult.permissionCreated, false);
  assert.equal(lifecycleResult.rolePermissionCreated, true);
  assert.equal(lifecycleResult.auditRecorded, true);
  assert.equal(h.counters.permissionCreates, 0);
  assert.deepEqual(h.counters.rolePermissionCreateCodes, [
    lifecycleDefinition.permission.code,
  ]);
  assert.equal(h.state().permissions.length, 2);
  assert.equal(h.state().rolePermissions.length, 2);
  assert.equal(h.state().audits.length, 1);
  assert.deepEqual(h.state().audits[0]!.contextJson, {
    mode: "APPLY",
    departmentCode: departmentA.code,
    roleCode: adminRoleA.code,
    permissionCode: lifecycleDefinition.permission.code,
    permissionCreated: false,
    rolePermissionCreated: true,
  });
});

test("both absent definitions are provisioned and audited in one Serializable transaction", async () => {
  const h = makeHarness();
  await applyAuthorizationProvisioning(h.client, byCode);

  assert.deepEqual(h.counters.permissionCreateCodes, [
    manageDefinition.permission.code,
    lifecycleDefinition.permission.code,
  ]);
  assert.deepEqual(h.counters.rolePermissionCreateCodes, [
    manageDefinition.permission.code,
    lifecycleDefinition.permission.code,
  ]);
  assert.deepEqual(h.counters.auditActions, [
    manageDefinition.auditAction,
    lifecycleDefinition.auditAction,
  ]);
  assert.equal(h.counters.transactions, 1);
  assert.deepEqual(h.counters.isolationLevels, [
    Prisma.TransactionIsolationLevel.Serializable,
  ]);
});

test("permission code mismatches for either definition fail closed without committed writes", async () => {
  for (const definition of [manageDefinition, lifecycleDefinition] as const) {
    const state = baseState();
    state.permissions.push({
      ...exactPermission(definition, `conflict-${definition.permission.code}`),
      resource: "course-management.conflicting-resource",
    });
    const h = makeHarness(state);
    await assert.rejects(
      applyAuthorizationProvisioning(h.client, byCode),
      /conflicting resource, action, or scope/,
    );
    assert.equal(h.counters.writes, 0);
    assert.equal(h.state().rolePermissions.length, 0);
    assert.equal(h.state().audits.length, 0);
  }
});

test("equivalent semantics under incompatible codes fail closed for either definition", async () => {
  for (const definition of [manageDefinition, lifecycleDefinition] as const) {
    const state = baseState();
    state.permissions.push({
      ...exactPermission(definition, `legacy-${definition.permission.code}`),
      code: `legacy.${definition.permission.code}`,
    });
    const h = makeHarness(state);
    await assert.rejects(
      applyAuthorizationProvisioning(h.client, byCode),
      /incompatible code/,
    );
    assert.equal(h.counters.writes, 0);
    assert.equal(h.state().rolePermissions.length, 0);
    assert.equal(h.state().audits.length, 0);
  }
});

test("later lifecycle collision is detected before an earlier absent manage definition is written", async () => {
  const state = baseState();
  state.permissions.push({
    ...exactLifecyclePermission,
    resource: "course-management.conflicting-resource",
  });
  const h = makeHarness(state);

  await assert.rejects(
    applyAuthorizationProvisioning(h.client, byCode),
    /conflicting resource, action, or scope/,
  );
  assert.equal(h.counters.writes, 0);
  assert.equal(h.state().permissions.length, 1);
  assert.equal(h.state().rolePermissions.length, 0);
  assert.equal(h.state().audits.length, 0);
});

test("ambiguous permission code and role-link identities fail closed", async () => {
  const ambiguousPermissionState = ordinaryRuntimeState();
  ambiguousPermissionState.permissions.push({
    ...exactManagePermission,
    id: "duplicate-manage-permission",
  });
  await assert.rejects(
    planAuthorizationProvisioning(
      makeHarness(ambiguousPermissionState).client,
      byCode,
    ),
    /Permission code identity is ambiguous/,
  );

  const ambiguousLinkState = completeState();
  ambiguousLinkState.rolePermissions.push({
    ...exactLifecycleLink,
    id: "duplicate-lifecycle-link",
  });
  await assert.rejects(
    planAuthorizationProvisioning(
      makeHarness(ambiguousLinkState).client,
      byCode,
    ),
    /Role-permission link identity is ambiguous/,
  );
});

test("missing and ambiguous departments fail closed", async () => {
  const missing = baseState();
  missing.departments = [];
  await assert.rejects(
    planAuthorizationProvisioning(makeHarness(missing).client, byCode),
    /Target department was not found/,
  );

  const ambiguous = baseState();
  ambiguous.departments.push({ ...departmentA, id: "department-a-duplicate" });
  await assert.rejects(
    planAuthorizationProvisioning(makeHarness(ambiguous).client, byCode),
    /Target department identity is ambiguous/,
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

test("missing, ambiguous, archived, and wrong-department Admin roles fail closed", async () => {
  const cases: Array<{ state: TestState; message: RegExp }> = [];

  const missing = baseState();
  missing.roles = [];
  cases.push({ state: missing, message: /no Department Admin role/ });

  const ambiguous = baseState();
  ambiguous.roles.push({ ...adminRoleA, id: "admin-role-a-duplicate" });
  cases.push({ state: ambiguous, message: /role identity is ambiguous/ });

  const archived = baseState();
  archived.roles[0]!.archivedAt = new Date("2026-01-01T00:00:00.000Z");
  cases.push({ state: archived, message: /role is archived/ });

  const wrongDepartment = baseState();
  wrongDepartment.roles = [
    { ...adminRoleA, id: "admin-role-b", departmentId: departmentB.id },
  ];
  cases.push({ state: wrongDepartment, message: /no Department Admin role/ });

  for (const lifecycleCase of cases) {
    await assert.rejects(
      planAuthorizationProvisioning(
        makeHarness(lifecycleCase.state).client,
        byCode,
      ),
      lifecycleCase.message,
    );
  }
});

test("only the selected department's exact Admin role receives both links", async () => {
  const state = baseState();
  state.departments.push(structuredClone(departmentB));
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
    {
      id: "admin-role-b",
      departmentId: departmentB.id,
      code: "department_admin",
      name: "Department Admin",
      archivedAt: null,
    },
  );
  const h = makeHarness(state);
  await applyAuthorizationProvisioning(h.client, byCode);

  assert.deepEqual(
    h.state().rolePermissions.map((link) => link.roleId),
    [adminRoleA.id, adminRoleA.id],
  );
});

test("unrelated permissions and links remain unchanged", async () => {
  const state = ordinaryRuntimeState();
  const unrelatedPermission: TestPermission = {
    id: "unrelated-permission",
    code: "attendance.record.read_department",
    resource: "attendance.record",
    action: "read",
    scope: PermissionScope.DEPARTMENT,
  };
  const unrelatedLink: TestRolePermission = {
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

test("lifecycle RolePermission failure rolls back its new permission", async () => {
  const h = makeHarness(ordinaryRuntimeState(), {
    failRolePermissionForCode: lifecycleDefinition.permission.code,
  });
  await assert.rejects(
    applyAuthorizationProvisioning(h.client, byCode),
    /simulated role-permission failure/,
  );

  assert.equal(h.counters.transactions, 1);
  assert.equal(h.state().permissions.length, 1);
  assert.deepEqual(h.state().permissions[0], exactManagePermission);
  assert.deepEqual(h.state().rolePermissions, [exactManageLink]);
  assert.equal(h.state().audits.length, 0);
});

test("lifecycle audit failure rolls back its new permission and link", async () => {
  const h = makeHarness(ordinaryRuntimeState(), {
    failAuditForCode: lifecycleDefinition.permission.code,
  });
  await assert.rejects(
    applyAuthorizationProvisioning(h.client, byCode),
    /simulated audit failure/,
  );

  assert.equal(h.counters.transactions, 1);
  assert.equal(h.state().permissions.length, 1);
  assert.deepEqual(h.state().permissions[0], exactManagePermission);
  assert.deepEqual(h.state().rolePermissions, [exactManageLink]);
  assert.equal(h.state().audits.length, 0);
});

test("later lifecycle failure rolls back earlier tentative definition writes and audit", async () => {
  const h = makeHarness(baseState(), {
    failAuditForCode: lifecycleDefinition.permission.code,
  });
  await assert.rejects(
    applyAuthorizationProvisioning(h.client, byCode),
    /simulated audit failure/,
  );

  assert.deepEqual(h.counters.permissionCreateCodes, [
    manageDefinition.permission.code,
    lifecycleDefinition.permission.code,
  ]);
  assert.deepEqual(h.counters.auditActions, [
    manageDefinition.auditAction,
    lifecycleDefinition.auditAction,
  ]);
  assert.equal(h.state().permissions.length, 0);
  assert.equal(h.state().rolePermissions.length, 0);
  assert.equal(h.state().audits.length, 0);
});

test("sanitized multi-definition summary is deterministic, compact, and secret-free", async () => {
  const secret = "postgresql://operator:secret-password@private/db";
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = secret;
  try {
    const result = await planAuthorizationProvisioning(
      makeHarness(ordinaryRuntimeState()).client,
      byCode,
    );
    const summary = sanitizedProvisioningSummary(result);
    const output = JSON.stringify(summary);

    assert.deepEqual(
      summary.definitions.map((definition) => definition.permission.code),
      [manageDefinition.permission.code, lifecycleDefinition.permission.code],
    );
    assert.equal(summary.definitions[0]!.noOp, true);
    assert.equal(summary.definitions[1]!.noOp, false);
    assert.equal(summary.noOp, false);
    assert.equal(output.includes(secret), false);
    assert.equal(output.includes("secret-password"), false);
    assert.equal(output.includes("DATABASE_URL"), false);
    assert.equal(output.includes("passwordHash"), false);
    assert.equal(output.includes("accessToken"), false);
    assert.equal(output.includes("refreshToken"), false);
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
});
