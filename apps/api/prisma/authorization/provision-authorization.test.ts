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
  BATCH_COORDINATOR_ASSIGNMENT_MANAGE_PROVISIONING,
  SUMMATIVE_EXAMINATION_COMMITTEE_MANAGE_PROVISIONING,
  SUMMATIVE_EXAMINATION_EXAMINER_ASSIGNMENT_MANAGE_PROVISIONING,
  SUMMATIVE_EXAMINATION_SETUP_MANAGE_PROVISIONING,
  STUDENT_BATCH_BINDING_MANAGE_PROVISIONING,
  SYLLABUS_BINDING_MANAGE_PROVISIONING,
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
const bindingDefinition = SYLLABUS_BINDING_MANAGE_PROVISIONING;
const studentBatchBindingDefinition = STUDENT_BATCH_BINDING_MANAGE_PROVISIONING;
const batchCoordinatorAssignmentDefinition =
  BATCH_COORDINATOR_ASSIGNMENT_MANAGE_PROVISIONING;
const summativeSetupDefinition =
  SUMMATIVE_EXAMINATION_SETUP_MANAGE_PROVISIONING;
const summativeCommitteeDefinition =
  SUMMATIVE_EXAMINATION_COMMITTEE_MANAGE_PROVISIONING;
const summativeExaminerAssignmentDefinition =
  SUMMATIVE_EXAMINATION_EXAMINER_ASSIGNMENT_MANAGE_PROVISIONING;

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
const exactBindingPermission = exactPermission(
  bindingDefinition,
  "permission-syllabus-binding-manage",
);
const exactStudentBatchBindingPermission = exactPermission(
  studentBatchBindingDefinition,
  "permission-student-batch-binding-manage",
);
const exactBatchCoordinatorAssignmentPermission = exactPermission(
  batchCoordinatorAssignmentDefinition,
  "permission-batch-coordinator-assignment-manage",
);
const exactSummativeSetupPermission = exactPermission(
  summativeSetupDefinition,
  "permission-summative-setup-manage",
);
const exactSummativeCommitteePermission = exactPermission(
  summativeCommitteeDefinition,
  "permission-summative-committee-manage",
);
const exactSummativeExaminerAssignmentPermission = exactPermission(
  summativeExaminerAssignmentDefinition,
  "permission-summative-examiner-assignment-manage",
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
const exactBindingLink: TestRolePermission = {
  id: "role-permission-syllabus-binding-manage",
  roleId: adminRoleA.id,
  permissionId: exactBindingPermission.id,
};
const exactStudentBatchBindingLink: TestRolePermission = {
  id: "role-permission-student-batch-binding-manage",
  roleId: adminRoleA.id,
  permissionId: exactStudentBatchBindingPermission.id,
};
const exactBatchCoordinatorAssignmentLink: TestRolePermission = {
  id: "role-permission-batch-coordinator-assignment-manage",
  roleId: adminRoleA.id,
  permissionId: exactBatchCoordinatorAssignmentPermission.id,
};
const exactSummativeSetupLink: TestRolePermission = {
  id: "role-permission-summative-setup-manage",
  roleId: adminRoleA.id,
  permissionId: exactSummativeSetupPermission.id,
};
const exactSummativeCommitteeLink: TestRolePermission = {
  id: "role-permission-summative-committee-manage",
  roleId: adminRoleA.id,
  permissionId: exactSummativeCommitteePermission.id,
};
const exactSummativeExaminerAssignmentLink: TestRolePermission = {
  id: "role-permission-summative-examiner-assignment-manage",
  roleId: adminRoleA.id,
  permissionId: exactSummativeExaminerAssignmentPermission.id,
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
  state.permissions.push(
    structuredClone(exactManagePermission),
    structuredClone(exactLifecyclePermission),
    structuredClone(exactBindingPermission),
    structuredClone(exactStudentBatchBindingPermission),
    structuredClone(exactSummativeSetupPermission),
    structuredClone(exactSummativeCommitteePermission),
    structuredClone(exactSummativeExaminerAssignmentPermission),
  );
  state.rolePermissions.push(
    structuredClone(exactManageLink),
    structuredClone(exactLifecycleLink),
    structuredClone(exactBindingLink),
    structuredClone(exactStudentBatchBindingLink),
    structuredClone(exactSummativeSetupLink),
    structuredClone(exactSummativeCommitteeLink),
    structuredClone(exactSummativeExaminerAssignmentLink),
  );
  return state;
}

function completeState(): TestState {
  const state = ordinaryRuntimeState();
  state.permissions.push(
    structuredClone(exactBatchCoordinatorAssignmentPermission),
  );
  state.rolePermissions.push(
    structuredClone(exactBatchCoordinatorAssignmentLink),
  );
  return state;
}

function preSummativeState(): TestState {
  const state = baseState();
  state.permissions.push(
    structuredClone(exactManagePermission),
    structuredClone(exactLifecyclePermission),
    structuredClone(exactBindingPermission),
    structuredClone(exactStudentBatchBindingPermission),
    structuredClone(exactBatchCoordinatorAssignmentPermission),
  );
  state.rolePermissions.push(
    structuredClone(exactManageLink),
    structuredClone(exactLifecycleLink),
    structuredClone(exactBindingLink),
    structuredClone(exactStudentBatchBindingLink),
    structuredClone(exactBatchCoordinatorAssignmentLink),
  );
  return state;
}

function preExaminerAssignmentState(): TestState {
  const state = completeState();
  state.permissions = state.permissions.filter(
    (permission) =>
      permission.code !== summativeExaminerAssignmentDefinition.permission.code,
  );
  state.rolePermissions = state.rolePermissions.filter(
    (link) =>
      link.permissionId !== exactSummativeExaminerAssignmentPermission.id,
  );
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
  let transactionTail = Promise.resolve();

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
      const previousTransaction = transactionTail;
      let releaseTransaction!: () => void;
      transactionTail = new Promise<void>((resolve) => {
        releaseTransaction = resolve;
      });
      await previousTransaction;
      try {
        const staged = structuredClone(state);
        const result = await operation(delegates(() => staged));
        state = staged;
        return result;
      } finally {
        releaseTransaction();
      }
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

test("definition set preserves existing authorities and adds exact Batch Coordinator assignment authority in order", () => {
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
  assert.deepEqual(bindingDefinition, {
    permission: {
      code: "course-management.syllabus-binding.manage",
      resource: "course-management.syllabus-binding",
      action: "manage",
      scope: PermissionScope.DEPARTMENT,
      description:
        "Manage syllabus bindings within the active department governance scope",
    },
    targetRoleCode: "department_admin",
    auditAction: "authorization.syllabus-binding-manage.provisioned",
  });
  assert.deepEqual(studentBatchBindingDefinition, {
    permission: {
      code: "course-management.student-batch-binding.manage",
      resource: "course-management.student-batch-binding",
      action: "manage",
      scope: PermissionScope.DEPARTMENT,
      description:
        "Manage CourseOffering to StudentBatch bindings within the active department governance scope",
    },
    targetRoleCode: "department_admin",
    auditAction: "authorization.student-batch-binding-manage.provisioned",
  });
  assert.deepEqual(batchCoordinatorAssignmentDefinition, {
    permission: {
      code: "course-management.batch-coordinator-assignment.manage",
      resource: "course-management.batch-coordinator-assignment",
      action: "manage",
      scope: PermissionScope.DEPARTMENT,
      description:
        "Manage Batch Coordinator assignments within the active department governance scope",
    },
    targetRoleCode: "department_admin",
    auditAction:
      "authorization.batch-coordinator-assignment-manage.provisioned",
  });
  assert.deepEqual(summativeSetupDefinition, {
    permission: {
      code: "summative-examination.setup.manage_department",
      resource: "summative-examination.setup",
      action: "manage",
      scope: PermissionScope.DEPARTMENT,
      description:
        "Manage summative examination setup within the active department governance scope",
    },
    targetRoleCode: "department_admin",
    auditAction: "authorization.summative-examination-setup-manage.provisioned",
  });
  assert.deepEqual(summativeCommitteeDefinition, {
    permission: {
      code: "summative-examination.committee.manage_department",
      resource: "summative-examination.committee",
      action: "manage",
      scope: PermissionScope.DEPARTMENT,
      description:
        "Manage summative examination committees within the active department governance scope",
    },
    targetRoleCode: "department_admin",
    auditAction:
      "authorization.summative-examination-committee-manage.provisioned",
  });
  assert.deepEqual(summativeExaminerAssignmentDefinition, {
    permission: {
      code: "summative-examination.examiner-assignment.manage_department",
      resource: "summative-examination.examiner-assignment",
      action: "manage",
      scope: PermissionScope.DEPARTMENT,
      description:
        "Manage First and Second Examiner assignments within the active department governance scope",
    },
    targetRoleCode: "department_admin",
    auditAction:
      "authorization.summative-examination-examiner-assignment-manage.provisioned",
  });
  assert.deepEqual(AUTHORIZATION_PROVISIONING_DEFINITIONS, [
    manageDefinition,
    lifecycleDefinition,
    bindingDefinition,
    studentBatchBindingDefinition,
    batchCoordinatorAssignmentDefinition,
    summativeSetupDefinition,
    summativeCommitteeDefinition,
    summativeExaminerAssignmentDefinition,
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

test("ordinary-runtime-shaped dry run plans only Batch Coordinator assignment management", async () => {
  const initial = ordinaryRuntimeState();
  const h = makeHarness(initial);
  const result = await planAuthorizationProvisioning(h.client, byCode);
  const managePlan = planFor(result, manageDefinition.permission.code);
  const lifecyclePlan = planFor(result, lifecycleDefinition.permission.code);
  const bindingPlan = planFor(result, bindingDefinition.permission.code);
  const studentBatchBindingPlan = planFor(
    result,
    studentBatchBindingDefinition.permission.code,
  );
  const batchCoordinatorAssignmentPlan = planFor(
    result,
    batchCoordinatorAssignmentDefinition.permission.code,
  );
  const summativeSetupPlan = planFor(
    result,
    summativeSetupDefinition.permission.code,
  );
  const summativeCommitteePlan = planFor(
    result,
    summativeCommitteeDefinition.permission.code,
  );
  const summativeExaminerAssignmentPlan = planFor(
    result,
    summativeExaminerAssignmentDefinition.permission.code,
  );

  assert.equal(result.applied, false);
  assert.equal(result.plan.definitions.length, 8);
  for (const existingPlan of [
    managePlan,
    lifecyclePlan,
    bindingPlan,
    studentBatchBindingPlan,
    summativeSetupPlan,
    summativeCommitteePlan,
    summativeExaminerAssignmentPlan,
  ]) {
    assert.equal(existingPlan.permission.state, "EXACT");
    assert.equal(existingPlan.roleLink.state, "EXACT");
    assert.deepEqual(existingPlan.changes, {
      permission: "UNCHANGED",
      rolePermission: "UNCHANGED",
      auditLog: "UNCHANGED",
    });
  }
  assert.equal(batchCoordinatorAssignmentPlan.permission.state, "ABSENT");
  assert.equal(batchCoordinatorAssignmentPlan.roleLink.state, "ABSENT");
  assert.deepEqual(batchCoordinatorAssignmentPlan.changes, {
    permission: "CREATE",
    rolePermission: "CREATE",
    auditLog: "CREATE",
  });
  assert.equal(h.counters.writes, 0);
  assert.equal(h.counters.auditCreates, 0);
  assert.equal(h.counters.transactions, 0);
  assert.deepEqual(h.state(), initial);
});

test("ordinary-runtime-shaped apply creates only Batch Coordinator assignment management", async () => {
  const initial = ordinaryRuntimeState();
  const existingPermissions = structuredClone(initial.permissions);
  const existingRolePermissions = structuredClone(initial.rolePermissions);
  const h = makeHarness(initial);
  const result = await applyAuthorizationProvisioning(h.client, byCode);
  const manageResult = resultFor(result, manageDefinition.permission.code);
  const lifecycleResult = resultFor(
    result,
    lifecycleDefinition.permission.code,
  );
  const bindingResult = resultFor(result, bindingDefinition.permission.code);
  const studentBatchBindingResult = resultFor(
    result,
    studentBatchBindingDefinition.permission.code,
  );
  const batchCoordinatorAssignmentResult = resultFor(
    result,
    batchCoordinatorAssignmentDefinition.permission.code,
  );
  const summativeSetupResult = resultFor(
    result,
    summativeSetupDefinition.permission.code,
  );
  const summativeCommitteeResult = resultFor(
    result,
    summativeCommitteeDefinition.permission.code,
  );
  const summativeExaminerAssignmentResult = resultFor(
    result,
    summativeExaminerAssignmentDefinition.permission.code,
  );

  for (const [definition, definitionResult] of [
    [manageDefinition, manageResult],
    [lifecycleDefinition, lifecycleResult],
    [bindingDefinition, bindingResult],
    [studentBatchBindingDefinition, studentBatchBindingResult],
    [summativeSetupDefinition, summativeSetupResult],
    [summativeCommitteeDefinition, summativeCommitteeResult],
    [
      summativeExaminerAssignmentDefinition,
      summativeExaminerAssignmentResult,
    ],
  ] as const) {
    assert.deepEqual(definitionResult, {
      permissionCode: definition.permission.code,
      permissionCreated: false,
      rolePermissionCreated: false,
      auditRecorded: false,
    });
  }
  assert.deepEqual(batchCoordinatorAssignmentResult, {
    permissionCode: batchCoordinatorAssignmentDefinition.permission.code,
    permissionCreated: true,
    rolePermissionCreated: true,
    auditRecorded: true,
  });
  assert.deepEqual(h.counters.permissionCreateCodes, [
    batchCoordinatorAssignmentDefinition.permission.code,
  ]);
  assert.deepEqual(h.counters.rolePermissionCreateCodes, [
    batchCoordinatorAssignmentDefinition.permission.code,
  ]);
  assert.deepEqual(h.counters.auditActions, [
    batchCoordinatorAssignmentDefinition.auditAction,
  ]);
  assert.equal(h.counters.transactions, 1);
  assert.deepEqual(h.counters.isolationLevels, [
    Prisma.TransactionIsolationLevel.Serializable,
  ]);
  assert.deepEqual(
    h.state().permissions.slice(0, existingPermissions.length),
    existingPermissions,
  );
  assert.deepEqual(
    h.state().rolePermissions.slice(0, existingRolePermissions.length),
    existingRolePermissions,
  );
  assert.equal(h.state().permissions.length, 8);
  assert.equal(h.state().rolePermissions.length, 8);
  assert.equal(h.state().audits.length, 1);
});

test("pre-Summative state provisions only the three exact Department Admin management permissions", async () => {
  const h = makeHarness(preSummativeState());
  const result = await applyAuthorizationProvisioning(h.client, byCode);
  for (const definition of [
    summativeSetupDefinition,
    summativeCommitteeDefinition,
    summativeExaminerAssignmentDefinition,
  ] as const) {
    assert.deepEqual(resultFor(result, definition.permission.code), {
      permissionCode: definition.permission.code,
      permissionCreated: true,
      rolePermissionCreated: true,
      auditRecorded: true,
    });
  }
  assert.deepEqual(h.counters.permissionCreateCodes, [
    summativeSetupDefinition.permission.code,
    summativeCommitteeDefinition.permission.code,
    summativeExaminerAssignmentDefinition.permission.code,
  ]);
  assert.deepEqual(h.counters.rolePermissionCreateCodes, [
    summativeSetupDefinition.permission.code,
    summativeCommitteeDefinition.permission.code,
    summativeExaminerAssignmentDefinition.permission.code,
  ]);
  assert.deepEqual(h.counters.auditActions, [
    summativeSetupDefinition.auditAction,
    summativeCommitteeDefinition.auditAction,
    summativeExaminerAssignmentDefinition.auditAction,
  ]);
  const newPermissions = h
    .state()
    .permissions.filter((permission) =>
      permission.code.startsWith("summative-examination."),
    );
  assert.equal(newPermissions.length, 3);
  for (const permission of newPermissions) {
    assert.equal(permission.scope, PermissionScope.DEPARTMENT);
    assert.equal(
      h
        .state()
        .rolePermissions.some(
          (link) =>
            link.roleId === adminRoleA.id &&
            link.permissionId === permission.id,
        ),
      true,
    );
  }
});

test("current baseline provisions only exact Examiner assignment management authority", async () => {
  const h = makeHarness(preExaminerAssignmentState());
  const result = await applyAuthorizationProvisioning(h.client, byCode);
  assert.deepEqual(
    resultFor(
      result,
      summativeExaminerAssignmentDefinition.permission.code,
    ),
    {
      permissionCode:
        summativeExaminerAssignmentDefinition.permission.code,
      permissionCreated: true,
      rolePermissionCreated: true,
      auditRecorded: true,
    },
  );
  assert.deepEqual(h.counters.permissionCreateCodes, [
    summativeExaminerAssignmentDefinition.permission.code,
  ]);
  assert.deepEqual(h.counters.rolePermissionCreateCodes, [
    summativeExaminerAssignmentDefinition.permission.code,
  ]);
  assert.deepEqual(h.counters.auditActions, [
    summativeExaminerAssignmentDefinition.auditAction,
  ]);
  assert.equal(h.state().permissions.length, 8);
  assert.equal(h.state().rolePermissions.length, 8);
  assert.equal(h.state().audits.length, 1);
});

test("Batch Coordinator assignment provisioning audit is exact and targets the selected Law Department Admin link", async () => {
  const h = makeHarness(ordinaryRuntimeState());
  await applyAuthorizationProvisioning(h.client, byCode);

  assert.equal(h.state().audits.length, 1);
  const audit = h.state().audits[0]!;
  const targetLink = h
    .state()
    .rolePermissions.find((link) => link.id === audit.targetId);
  const targetPermission = h
    .state()
    .permissions.find(
      (permission) => permission.id === targetLink?.permissionId,
    );
  assert.equal(audit.actorType, "SERVICE");
  assert.equal(audit.actorUserId, null);
  assert.equal(audit.departmentId, departmentA.id);
  assert.equal(audit.action, batchCoordinatorAssignmentDefinition.auditAction);
  assert.equal(audit.targetType, "role_permission");
  assert.equal(targetLink?.roleId, adminRoleA.id);
  assert.equal(
    targetPermission?.code,
    batchCoordinatorAssignmentDefinition.permission.code,
  );
  assert.deepEqual(audit.contextJson, {
    mode: "APPLY",
    departmentCode: departmentA.code,
    roleCode: adminRoleA.code,
    permissionCode: batchCoordinatorAssignmentDefinition.permission.code,
    permissionCreated: true,
    rolePermissionCreated: true,
  });
});

test("second apply is a true no-op for all eight definitions", async () => {
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
  assert.equal(h.state().permissions.length, 8);
  assert.equal(h.state().rolePermissions.length, 8);
  assert.equal(h.state().audits.length, 1);
});

test("exact Batch Coordinator assignment permission with absent link creates only the missing link and one audit", async () => {
  const state = ordinaryRuntimeState();
  state.permissions.push(
    structuredClone(exactBatchCoordinatorAssignmentPermission),
  );
  const h = makeHarness(state);
  const result = await applyAuthorizationProvisioning(h.client, byCode);
  const bindingResult = resultFor(
    result,
    batchCoordinatorAssignmentDefinition.permission.code,
  );

  assert.equal(bindingResult.permissionCreated, false);
  assert.equal(bindingResult.rolePermissionCreated, true);
  assert.equal(bindingResult.auditRecorded, true);
  assert.equal(h.counters.permissionCreates, 0);
  assert.deepEqual(h.counters.rolePermissionCreateCodes, [
    batchCoordinatorAssignmentDefinition.permission.code,
  ]);
  assert.equal(h.state().permissions.length, 8);
  assert.equal(h.state().rolePermissions.length, 8);
  assert.equal(h.state().audits.length, 1);
  assert.deepEqual(h.state().audits[0]!.contextJson, {
    mode: "APPLY",
    departmentCode: departmentA.code,
    roleCode: adminRoleA.code,
    permissionCode: batchCoordinatorAssignmentDefinition.permission.code,
    permissionCreated: false,
    rolePermissionCreated: true,
  });
});

test("all absent definitions are provisioned and audited in one Serializable transaction", async () => {
  const h = makeHarness();
  await applyAuthorizationProvisioning(h.client, byCode);

  assert.deepEqual(h.counters.permissionCreateCodes, [
    manageDefinition.permission.code,
    lifecycleDefinition.permission.code,
    bindingDefinition.permission.code,
    studentBatchBindingDefinition.permission.code,
    batchCoordinatorAssignmentDefinition.permission.code,
    summativeSetupDefinition.permission.code,
    summativeCommitteeDefinition.permission.code,
    summativeExaminerAssignmentDefinition.permission.code,
  ]);
  assert.deepEqual(h.counters.rolePermissionCreateCodes, [
    manageDefinition.permission.code,
    lifecycleDefinition.permission.code,
    bindingDefinition.permission.code,
    studentBatchBindingDefinition.permission.code,
    batchCoordinatorAssignmentDefinition.permission.code,
    summativeSetupDefinition.permission.code,
    summativeCommitteeDefinition.permission.code,
    summativeExaminerAssignmentDefinition.permission.code,
  ]);
  assert.deepEqual(h.counters.auditActions, [
    manageDefinition.auditAction,
    lifecycleDefinition.auditAction,
    bindingDefinition.auditAction,
    studentBatchBindingDefinition.auditAction,
    batchCoordinatorAssignmentDefinition.auditAction,
    summativeSetupDefinition.auditAction,
    summativeCommitteeDefinition.auditAction,
    summativeExaminerAssignmentDefinition.auditAction,
  ]);
  assert.equal(h.counters.transactions, 1);
  assert.deepEqual(h.counters.isolationLevels, [
    Prisma.TransactionIsolationLevel.Serializable,
  ]);
});

test("permission code mismatches including binding fail closed without committed writes", async () => {
  for (const definition of [
    manageDefinition,
    lifecycleDefinition,
    bindingDefinition,
    studentBatchBindingDefinition,
    batchCoordinatorAssignmentDefinition,
    summativeSetupDefinition,
    summativeCommitteeDefinition,
    summativeExaminerAssignmentDefinition,
  ] as const) {
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

test("equivalent semantics under incompatible codes including binding fail closed", async () => {
  for (const definition of [
    manageDefinition,
    lifecycleDefinition,
    bindingDefinition,
    studentBatchBindingDefinition,
    batchCoordinatorAssignmentDefinition,
    summativeSetupDefinition,
    summativeCommitteeDefinition,
    summativeExaminerAssignmentDefinition,
  ] as const) {
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

test("later Batch Coordinator assignment collision is detected before earlier absent definitions are written", async () => {
  const state = baseState();
  state.permissions.push({
    ...exactBatchCoordinatorAssignmentPermission,
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

test("ambiguous binding permission code and role-link identities fail closed", async () => {
  const ambiguousPermissionState = completeState();
  ambiguousPermissionState.permissions.push({
    ...exactBindingPermission,
    id: "duplicate-binding-permission",
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
    ...exactBindingLink,
    id: "duplicate-binding-link",
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

test("only the selected Law Department's exact Admin role receives the Batch Coordinator assignment link", async () => {
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

  const assignmentPermission = h
    .state()
    .permissions.find(
      (permission) =>
        permission.code ===
        batchCoordinatorAssignmentDefinition.permission.code,
    );
  assert.ok(assignmentPermission);
  const assignmentLinks = h
    .state()
    .rolePermissions.filter(
      (link) => link.permissionId === assignmentPermission.id,
    );
  assert.deepEqual(assignmentLinks, [
    {
      id: assignmentLinks[0]!.id,
      roleId: adminRoleA.id,
      permissionId: assignmentPermission.id,
    },
  ]);
  assert.equal(
    assignmentLinks.some((link) =>
      ["teacher-role-a", "student-role-a", "admin-role-b"].includes(
        link.roleId,
      ),
    ),
    false,
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

test("Batch Coordinator assignment RolePermission failure rolls back its new permission", async () => {
  const h = makeHarness(ordinaryRuntimeState(), {
    failRolePermissionForCode:
      batchCoordinatorAssignmentDefinition.permission.code,
  });
  await assert.rejects(
    applyAuthorizationProvisioning(h.client, byCode),
    /simulated role-permission failure/,
  );

  assert.equal(h.counters.transactions, 1);
  assert.deepEqual(h.state(), ordinaryRuntimeState());
  assert.equal(h.state().audits.length, 0);
});

test("Batch Coordinator assignment audit failure rolls back its new permission and link", async () => {
  const h = makeHarness(ordinaryRuntimeState(), {
    failAuditForCode: batchCoordinatorAssignmentDefinition.permission.code,
  });
  await assert.rejects(
    applyAuthorizationProvisioning(h.client, byCode),
    /simulated audit failure/,
  );

  assert.equal(h.counters.transactions, 1);
  assert.deepEqual(h.state(), ordinaryRuntimeState());
  assert.equal(h.state().audits.length, 0);
});

test("later Batch Coordinator assignment failure rolls back all earlier tentative writes and audits", async () => {
  const h = makeHarness(baseState(), {
    failAuditForCode: batchCoordinatorAssignmentDefinition.permission.code,
  });
  await assert.rejects(
    applyAuthorizationProvisioning(h.client, byCode),
    /simulated audit failure/,
  );

  assert.deepEqual(h.counters.permissionCreateCodes, [
    manageDefinition.permission.code,
    lifecycleDefinition.permission.code,
    bindingDefinition.permission.code,
    studentBatchBindingDefinition.permission.code,
    batchCoordinatorAssignmentDefinition.permission.code,
  ]);
  assert.deepEqual(h.counters.auditActions, [
    manageDefinition.auditAction,
    lifecycleDefinition.auditAction,
    bindingDefinition.auditAction,
    studentBatchBindingDefinition.auditAction,
    batchCoordinatorAssignmentDefinition.auditAction,
  ]);
  assert.equal(h.state().permissions.length, 0);
  assert.equal(h.state().rolePermissions.length, 0);
  assert.equal(h.state().audits.length, 0);
});

test("simultaneous and repeated logical applies preserve exact cardinality", async () => {
  const h = makeHarness(ordinaryRuntimeState());
  const [first, simultaneous] = await Promise.all([
    applyAuthorizationProvisioning(h.client, byCode),
    applyAuthorizationProvisioning(h.client, byCode),
  ]);
  const writesAfterSimultaneous = h.counters.writes;
  const repeated = await applyAuthorizationProvisioning(h.client, byCode);

  assert.equal(
    [first, simultaneous].filter(
      (result) =>
        resultFor(result, batchCoordinatorAssignmentDefinition.permission.code)
          .auditRecorded,
    ).length,
    1,
  );
  assert.equal(
    resultFor(repeated, batchCoordinatorAssignmentDefinition.permission.code)
      .auditRecorded,
    false,
  );
  assert.equal(h.counters.writes, writesAfterSimultaneous);
  assert.equal(
    h
      .state()
      .permissions.filter(
        (permission) =>
          permission.code ===
          batchCoordinatorAssignmentDefinition.permission.code,
      ).length,
    1,
  );
  const assignmentPermission = h
    .state()
    .permissions.find(
      (permission) =>
        permission.code ===
        batchCoordinatorAssignmentDefinition.permission.code,
    )!;
  assert.equal(
    h
      .state()
      .rolePermissions.filter(
        (link) =>
          link.roleId === adminRoleA.id &&
          link.permissionId === assignmentPermission.id,
      ).length,
    1,
  );
  assert.equal(
    h
      .state()
      .audits.filter(
        (audit) =>
          audit.action === batchCoordinatorAssignmentDefinition.auditAction,
      ).length,
    1,
  );
  assert.equal(h.state().permissions.length, 8);
  assert.equal(h.state().rolePermissions.length, 8);
  assert.equal(h.state().audits.length, 1);
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
      [
        manageDefinition.permission.code,
        lifecycleDefinition.permission.code,
        bindingDefinition.permission.code,
        studentBatchBindingDefinition.permission.code,
        batchCoordinatorAssignmentDefinition.permission.code,
        summativeSetupDefinition.permission.code,
        summativeCommitteeDefinition.permission.code,
        summativeExaminerAssignmentDefinition.permission.code,
      ],
    );
    assert.equal(summary.definitions[0]!.noOp, true);
    assert.equal(summary.definitions[1]!.noOp, true);
    assert.equal(summary.definitions[2]!.noOp, true);
    assert.equal(summary.definitions[3]!.noOp, true);
    assert.equal(summary.definitions[4]!.noOp, false);
    assert.equal(summary.definitions[5]!.noOp, true);
    assert.equal(summary.definitions[6]!.noOp, true);
    assert.equal(summary.definitions[7]!.noOp, true);
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
