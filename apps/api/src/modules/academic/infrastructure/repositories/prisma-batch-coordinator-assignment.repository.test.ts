import assert from "node:assert/strict";
import test from "node:test";

import {
  BatchCoordinatorAssignmentStatus,
  DepartmentStatus,
  Prisma,
} from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import type {
  CreateBatchCoordinatorAssignmentInput,
  TransitionBatchCoordinatorAssignmentInput,
} from "../../application/ports/batch-coordinator-assignment.repository.port";
import { PrismaBatchCoordinatorAssignmentRepository } from "./prisma-batch-coordinator-assignment.repository";

const assignedAt = new Date("2026-08-25T10:00:00.000Z");
const later = new Date("2026-08-25T11:00:00.000Z");

function record(
  coordinatorUserId = "coordinator-a",
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `assignment-${coordinatorUserId}`,
    departmentId: "department-a",
    studentBatchId: "batch-a",
    academicTermId: "term-a",
    coordinatorUserId,
    assignedByUserId: "admin-a",
    status: BatchCoordinatorAssignmentStatus.ACTIVE,
    assignedAt,
    expiresAt: null as Date | null,
    unassignedAt: null as Date | null,
    archivedAt: null as Date | null,
    createdAt: assignedAt,
    updatedAt: assignedAt,
    ...overrides,
  };
}

type Assignment = ReturnType<typeof record>;
interface State {
  assignments: Assignment[];
  audits: Array<Record<string, unknown>>;
}

interface TransactionFailure {
  error: unknown;
  afterRollback?: (state: State) => void;
}

function sqlText(query: unknown) {
  return (
    (query as { sql?: string; text?: string }).sql ??
    (query as { text?: string }).text ??
    String(query)
  );
}

function sqlValues(query: unknown) {
  return ((query as { values?: unknown[] }).values ?? []) as string[];
}

function harness(initialAssignments: Assignment[] = []) {
  let state: State = {
    assignments: structuredClone(initialAssignments),
    audits: [],
  };
  let auditFailure = false;
  const parentAvailability = {
    management: true,
    batch: true,
    term: true,
    coordinator: true,
  };
  const departmentState: {
    id: string;
    status: DepartmentStatus;
    archivedAt: Date | null;
    deletedAt: Date | null;
  } = {
    id: "department-a",
    status: DepartmentStatus.ACTIVE,
    archivedAt: null,
    deletedAt: null,
  };
  const transactions: unknown[] = [];
  const rawSql: string[] = [];
  const advisoryLockIdentityKeys: string[] = [];
  const authorityQueries: Array<Record<string, unknown>> = [];
  const transactionFailures: TransactionFailure[] = [];
  let transactionTail = Promise.resolve();

  const client = (working: State) => ({
    $queryRaw: async (query: unknown) => {
      const sql = sqlText(query);
      const values = sqlValues(query);
      rawSql.push(sql);
      if (/JOIN "role_permissions"/.test(sql)) {
        return parentAvailability.management ? [{ id: "admin-a" }] : [];
      }
      if (/pg_advisory_xact_lock/.test(sql)) {
        advisoryLockIdentityKeys.push(values[0]!);
        return [{ locked: 1 }];
      }
      if (/FROM "student_batches"/.test(sql)) {
        return parentAvailability.batch ? [{ id: "batch-a" }] : [];
      }
      if (/FROM "academic_terms"/.test(sql)) {
        return parentAvailability.term ? [{ id: "term-a" }] : [];
      }
      if (/FROM "users"/.test(sql)) {
        return parentAvailability.coordinator ? [{ id: values[0] }] : [];
      }
      if (/FROM "batch_coordinator_assignments"/.test(sql)) {
        const assignmentId = values[0];
        const departmentId = values[1];
        return working.assignments.some(
          (item) =>
            item.id === assignmentId && item.departmentId === departmentId,
        )
          ? [{ id: assignmentId }]
          : [];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    batchCoordinatorAssignment: {
      findUnique: async (args: {
        where: {
          departmentId_studentBatchId_academicTermId_coordinatorUserId: {
            departmentId: string;
            studentBatchId: string;
            academicTermId: string;
            coordinatorUserId: string;
          };
        };
      }) => {
        const identity =
          args.where
            .departmentId_studentBatchId_academicTermId_coordinatorUserId;
        return (
          working.assignments.find(
            (item) =>
              item.departmentId === identity.departmentId &&
              item.studentBatchId === identity.studentBatchId &&
              item.academicTermId === identity.academicTermId &&
              item.coordinatorUserId === identity.coordinatorUserId,
          ) ?? null
        );
      },
      create: async (args: {
        data: Omit<Assignment, "id" | "createdAt" | "updatedAt">;
      }) => {
        const created = record(args.data.coordinatorUserId, {
          ...args.data,
          id: `assignment-${working.assignments.length + 1}`,
          createdAt: args.data.assignedAt,
          updatedAt: args.data.assignedAt,
        });
        working.assignments.push(created);
        return created;
      },
      findFirst: async (args: { where: Record<string, unknown> }) => {
        const where = args.where;
        if (typeof where.id === "string") {
          return (
            working.assignments.find(
              (item) =>
                item.id === where.id &&
                item.departmentId === where.departmentId,
            ) ?? null
          );
        }

        authorityQueries.push(where);

        const departmentWhere = (
          where.department as {
            is?: {
              id: string;
              status: DepartmentStatus;
              archivedAt: Date | null;
              deletedAt: Date | null;
            };
          }
        )?.is;
        const validDepartment = Boolean(
          departmentWhere &&
            departmentState.id === departmentWhere.id &&
            departmentState.status === departmentWhere.status &&
            departmentState.archivedAt === departmentWhere.archivedAt &&
            departmentState.deletedAt === departmentWhere.deletedAt,
        );
        const evaluatedAt = (where.assignedAt as { lte: Date }).lte;
        const matching = working.assignments.find(
          (item) =>
            item.departmentId === where.departmentId &&
            item.studentBatchId === where.studentBatchId &&
            item.academicTermId === where.academicTermId &&
            item.coordinatorUserId === where.coordinatorUserId &&
            item.status === BatchCoordinatorAssignmentStatus.ACTIVE &&
            item.archivedAt === null &&
            item.unassignedAt === null &&
            item.assignedAt <= evaluatedAt &&
            (item.expiresAt === null || item.expiresAt > evaluatedAt),
        );
        return validDepartment &&
          parentAvailability.batch &&
          parentAvailability.term &&
          parentAvailability.coordinator
          ? (matching ?? null)
          : null;
      },
      findMany: async (args: { where: Record<string, unknown> }) =>
        working.assignments.filter((item) =>
          Object.entries(args.where).every(
            ([key, value]) =>
              value === undefined || item[key as keyof Assignment] === value,
          ),
        ),
      updateMany: async (args: {
        where: { id: string; departmentId: string };
        data: Partial<Assignment>;
      }) => {
        const item = working.assignments.find(
          (candidate) =>
            candidate.id === args.where.id &&
            candidate.departmentId === args.where.departmentId,
        );
        if (!item) return { count: 0 };
        Object.assign(item, args.data, { updatedAt: later });
        return { count: 1 };
      },
    },
    auditLog: {
      create: async (args: { data: Record<string, unknown> }) => {
        if (auditFailure) throw new Error("AUDIT_WRITE_FAILED");
        working.audits.push(structuredClone(args.data));
        return { id: `audit-${working.audits.length}` };
      },
    },
  });

  const prisma = {
    batchCoordinatorAssignment: {
      findFirst: (args: never) =>
        client(state).batchCoordinatorAssignment.findFirst(args),
      findUnique: (args: never) =>
        client(state).batchCoordinatorAssignment.findUnique(args),
      findMany: (args: never) =>
        client(state).batchCoordinatorAssignment.findMany(args),
    },
    $transaction: async (
      operation: (tx: unknown) => Promise<unknown>,
      options: unknown,
    ) => {
      transactions.push(options);
      const previous = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        const working = structuredClone(state);
        const result = await operation(client(working));
        const failure = transactionFailures.shift();
        if (failure) {
          failure.afterRollback?.(state);
          throw failure.error;
        }
        state = working;
        return result;
      } finally {
        release();
      }
    },
  };

  return {
    repository: new PrismaBatchCoordinatorAssignmentRepository(prisma as never),
    snapshot: () => structuredClone(state),
    transactions,
    rawSql,
    advisoryLockIdentityKeys,
    authorityQueries,
    parentAvailability,
    departmentState,
    failNextTransaction(
      error: unknown,
      afterRollback?: TransactionFailure["afterRollback"],
    ) {
      transactionFailures.push({ error, afterRollback });
    },
    failAudit() {
      auditFailure = true;
    },
  };
}

function createInput(
  coordinatorUserId = "coordinator-a",
): CreateBatchCoordinatorAssignmentInput {
  return {
    departmentId: "department-a",
    actorUserId: "admin-a",
    userRoleId: "user-role-a",
    roleId: "role-a",
    transitionAt: assignedAt,
    studentBatchId: "batch-a",
    academicTermId: "term-a",
    coordinatorUserId,
    expiresAt: null,
    requestId: "request-a",
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
  };
}

function transitionInput(
  assignmentId: string,
  transitionAt = later,
): TransitionBatchCoordinatorAssignmentInput {
  return {
    departmentId: "department-a",
    actorUserId: "admin-a",
    userRoleId: "user-role-a",
    roleId: "role-a",
    assignmentId,
    transitionAt,
  };
}

function knownRequestError(code: string, meta?: Record<string, unknown>) {
  return new PrismaClientKnownRequestError("test Prisma failure", {
    code,
    clientVersion: "6.19.3",
    meta,
  });
}

test("create is department-scoped, parent-validated, transactionally audited, idempotent, and multi-Coordinator", async () => {
  const h = harness();
  const first = await h.repository.create(createInput());
  assert.equal(first.outcome, "CREATED");
  assert.equal(h.snapshot().assignments[0]!.assignedByUserId, "admin-a");
  assert.equal(h.snapshot().audits.length, 1);
  assert.equal(
    h.snapshot().audits[0]!.action,
    "course-management.batch-coordinator-assignment.assigned",
  );

  const duplicate = await h.repository.create(createInput());
  assert.equal(duplicate.outcome, "ALREADY_ACTIVE");
  assert.equal(h.snapshot().assignments.length, 1);
  assert.equal(h.snapshot().audits.length, 1);

  const secondCoordinator = await h.repository.create(
    createInput("coordinator-b"),
  );
  assert.equal(secondCoordinator.outcome, "CREATED");
  assert.equal(h.snapshot().assignments.length, 2);
  assert.equal(h.snapshot().audits.length, 2);
  assert.ok(h.rawSql.some((sql) => /pg_advisory_xact_lock/.test(sql)));
  assert.ok(
    h.transactions.every(
      (options) =>
        (options as { isolationLevel: unknown }).isolationLevel ===
        Prisma.TransactionIsolationLevel.Serializable,
    ),
  );
});

test("create binds a deterministic, boundary-safe PostgreSQL advisory-lock identity", async () => {
  const sqlHarness = harness();
  assert.equal(
    (await sqlHarness.repository.create(createInput())).outcome,
    "CREATED",
  );
  const lockSql = sqlHarness.rawSql.find((sql) =>
    /pg_advisory_xact_lock/.test(sql),
  );
  assert.ok(lockSql);
  const normalizedLockSql = lockSql.replace(/\s+/g, " ").trim();
  assert.match(normalizedLockSql, /WITH acquired_lock AS MATERIALIZED \(/);
  assert.match(normalizedLockSql, /pg_advisory_xact_lock\(/);
  assert.match(normalizedLockSql, /hashtextextended\(/);
  assert.match(
    normalizedLockSql,
    /SELECT 1::int AS "locked" FROM acquired_lock$/,
  );

  async function lockKey(
    overrides: Partial<CreateBatchCoordinatorAssignmentInput> = {},
  ) {
    const h = harness();
    const input = { ...createInput(), ...overrides };
    assert.equal((await h.repository.create(input)).outcome, "CREATED");
    assert.ok(h.rawSql.some((sql) => /pg_advisory_xact_lock/.test(sql)));
    assert.equal(h.advisoryLockIdentityKeys.length, 1);
    return h.advisoryLockIdentityKeys[0]!;
  }

  const expected = JSON.stringify([
    "department-a",
    "batch-a",
    "term-a",
    "coordinator-a",
  ]);
  const first = await lockKey();
  const repeated = await lockKey();

  assert.equal(first, expected);
  assert.equal(repeated, expected);
  assert.equal(first.includes("\u0000"), false);

  assert.notEqual(
    await lockKey({ departmentId: "department-ab", studentBatchId: "c" }),
    await lockKey({ departmentId: "department-a", studentBatchId: "bc" }),
  );

  for (const override of [
    { departmentId: "department-b" },
    { studentBatchId: "batch-b" },
    { academicTermId: "term-b" },
    { coordinatorUserId: "coordinator-b" },
  ]) {
    assert.notEqual(await lockKey(override), expected);
  }
});

test("cross-department or inactive parent shapes fail closed without mutation", async () => {
  const cases = [
    ["batch", "STUDENT_BATCH_NOT_FOUND"],
    ["term", "ACADEMIC_TERM_NOT_FOUND"],
    ["coordinator", "COORDINATOR_USER_NOT_FOUND"],
    ["management", "MANAGEMENT_AUTHORITY_INVALID"],
  ] as const;
  for (const [parent, outcome] of cases) {
    const h = harness();
    h.parentAvailability[parent] = false;
    assert.equal((await h.repository.create(createInput())).outcome, outcome);
    assert.deepEqual(h.snapshot(), { assignments: [], audits: [] });
  }
});

test("audit failure rolls back create and lifecycle mutation", async () => {
  const createHarness = harness();
  createHarness.failAudit();
  await assert.rejects(
    createHarness.repository.create(createInput()),
    /AUDIT_WRITE_FAILED/,
  );
  assert.deepEqual(createHarness.snapshot(), { assignments: [], audits: [] });

  const lifecycleHarness = harness([record()]);
  lifecycleHarness.failAudit();
  await assert.rejects(
    lifecycleHarness.repository.unassign(
      transitionInput("assignment-coordinator-a"),
    ),
    /AUDIT_WRITE_FAILED/,
  );
  assert.equal(
    lifecycleHarness.snapshot().assignments[0]!.status,
    BatchCoordinatorAssignmentStatus.ACTIVE,
  );
  assert.equal(lifecycleHarness.snapshot().assignments[0]!.unassignedAt, null);
});

test("authority lookup uses the exact four-part identity and every lifecycle/parent predicate", async () => {
  const h = harness([record()]);
  const query = {
    departmentId: "department-a",
    coordinatorUserId: "coordinator-a",
    studentBatchId: "batch-a",
    academicTermId: "term-a",
    evaluatedAt: later,
  };
  assert.equal(await h.repository.hasActiveAuthority(query), true);
  const authorityWhere = h.authorityQueries[0]! as {
    status: BatchCoordinatorAssignmentStatus;
    archivedAt: null;
    unassignedAt: null;
    department: {
      is: {
        id: string;
        status: DepartmentStatus;
        archivedAt: null;
        deletedAt: null;
      };
    };
    studentBatch: { is: { departmentId: string; archivedAt: null } };
    academicTerm: { is: { departmentId: string; archivedAt: null } };
    coordinatorUser: {
      is: {
        departmentId: string;
        status: string;
        archivedAt: null;
        deletedAt: null;
      };
    };
  };
  assert.equal(authorityWhere.status, BatchCoordinatorAssignmentStatus.ACTIVE);
  assert.equal(authorityWhere.archivedAt, null);
  assert.equal(authorityWhere.unassignedAt, null);
  assert.deepEqual(authorityWhere.department.is, {
    id: "department-a",
    status: DepartmentStatus.ACTIVE,
    archivedAt: null,
    deletedAt: null,
  });
  assert.equal(authorityWhere.studentBatch.is.departmentId, "department-a");
  assert.equal(authorityWhere.studentBatch.is.archivedAt, null);
  assert.equal(authorityWhere.academicTerm.is.departmentId, "department-a");
  assert.equal(authorityWhere.academicTerm.is.archivedAt, null);
  assert.equal(authorityWhere.coordinatorUser.is.departmentId, "department-a");
  assert.equal(authorityWhere.coordinatorUser.is.status, "ACTIVE");
  assert.equal(authorityWhere.coordinatorUser.is.archivedAt, null);
  assert.equal(authorityWhere.coordinatorUser.is.deletedAt, null);

  const invalidRecords = [
    record("coordinator-a", {
      status: BatchCoordinatorAssignmentStatus.INACTIVE,
    }),
    record("coordinator-a", { unassignedAt: assignedAt }),
    record("coordinator-a", { expiresAt: assignedAt }),
    record("coordinator-a", {
      status: BatchCoordinatorAssignmentStatus.ARCHIVED,
      archivedAt: assignedAt,
    }),
    record("coordinator-a", {
      assignedAt: new Date("2026-08-25T12:00:00.000Z"),
    }),
  ];
  for (const invalid of invalidRecords) {
    assert.equal(
      await harness([invalid]).repository.hasActiveAuthority(query),
      false,
    );
  }
  for (const mismatch of [
    { studentBatchId: "batch-b" },
    { academicTermId: "term-b" },
    { coordinatorUserId: "coordinator-b" },
    { departmentId: "department-b" },
  ]) {
    assert.equal(
      await h.repository.hasActiveAuthority({ ...query, ...mismatch }),
      false,
    );
  }
  for (const parent of ["batch", "term", "coordinator"] as const) {
    const invalidParent = harness([record()]);
    invalidParent.parentAvailability[parent] = false;
    assert.equal(
      await invalidParent.repository.hasActiveAuthority(query),
      false,
    );
  }
});

test("authority lookup independently requires an active, non-archived, non-deleted Department", async () => {
  const query = {
    departmentId: "department-a",
    coordinatorUserId: "coordinator-a",
    studentBatchId: "batch-a",
    academicTermId: "term-a",
    evaluatedAt: later,
  };

  const active = harness([record()]);
  assert.equal(await active.repository.hasActiveAuthority(query), true);

  for (const invalidDepartment of [
    { status: DepartmentStatus.DISABLED },
    { archivedAt: assignedAt },
    { deletedAt: assignedAt },
  ]) {
    const invalid = harness([record()]);
    Object.assign(invalid.departmentState, invalidDepartment);
    assert.equal(
      await invalid.repository.hasActiveAuthority(query),
      false,
    );
    assert.deepEqual(
      (invalid.authorityQueries[0]!.department as { is: unknown }).is,
      {
        id: "department-a",
        status: DepartmentStatus.ACTIVE,
        archivedAt: null,
        deletedAt: null,
      },
    );
  }
});

test("explicit lifecycle transitions control authority and no-ops do not duplicate audits", async () => {
  const h = harness([record()]);
  const id = "assignment-coordinator-a";
  const query = {
    departmentId: "department-a",
    coordinatorUserId: "coordinator-a",
    studentBatchId: "batch-a",
    academicTermId: "term-a",
    evaluatedAt: later,
  };

  assert.equal(
    (await h.repository.unassign(transitionInput(id))).outcome,
    "UNASSIGNED",
  );
  assert.equal(await h.repository.hasActiveAuthority(query), false);
  assert.equal(
    (await h.repository.unassign(transitionInput(id))).outcome,
    "ALREADY_INACTIVE",
  );
  assert.equal(h.snapshot().audits.length, 1);

  const reactivated = await h.repository.reactivate({
    ...transitionInput(id, new Date("2026-08-25T12:00:00.000Z")),
    expiresAt: null,
  });
  assert.equal(reactivated.outcome, "REACTIVATED");
  assert.equal(
    await h.repository.hasActiveAuthority({
      ...query,
      evaluatedAt: new Date("2026-08-25T12:30:00.000Z"),
    }),
    true,
  );

  assert.equal(
    (
      await h.repository.archive(
        transitionInput(id, new Date("2026-08-25T13:00:00.000Z")),
      )
    ).outcome,
    "ARCHIVED",
  );
  assert.equal(
    (
      await h.repository.reactivate({
        ...transitionInput(id, new Date("2026-08-25T14:00:00.000Z")),
        expiresAt: null,
      })
    ).outcome,
    "ASSIGNMENT_ARCHIVED",
  );
  assert.equal(h.snapshot().audits.length, 3);
});

test("PATCH changes only expiry on currently usable assignments and cannot restore expired authority", async () => {
  const h = harness([record()]);
  const id = "assignment-coordinator-a";
  const expiresAt = new Date("2026-08-25T13:00:00.000Z");
  const updated = await h.repository.updateExpiry({
    ...transitionInput(id),
    expiresAt,
  });
  assert.equal(updated.outcome, "UPDATED");
  assert.equal(
    h.snapshot().assignments[0]!.expiresAt?.getTime(),
    expiresAt.getTime(),
  );
  assert.deepEqual(
    {
      studentBatchId: h.snapshot().assignments[0]!.studentBatchId,
      academicTermId: h.snapshot().assignments[0]!.academicTermId,
      coordinatorUserId: h.snapshot().assignments[0]!.coordinatorUserId,
    },
    {
      studentBatchId: "batch-a",
      academicTermId: "term-a",
      coordinatorUserId: "coordinator-a",
    },
  );
  assert.equal(
    (
      await h.repository.updateExpiry({
        ...transitionInput(id),
        expiresAt,
      })
    ).outcome,
    "NO_CHANGES",
  );
  assert.equal(h.snapshot().audits.length, 1);

  const expired = harness([record("coordinator-a", { expiresAt: assignedAt })]);
  assert.equal(
    (
      await expired.repository.updateExpiry({
        ...transitionInput(id),
        expiresAt: new Date("2026-08-25T13:00:00.000Z"),
      })
    ).outcome,
    "NOT_ACTIVE",
  );
  assert.equal(expired.snapshot().audits.length, 0);
  assert.equal(
    (
      await expired.repository.reactivate({
        ...transitionInput(id),
        expiresAt: null,
      })
    ).outcome,
    "REACTIVATED",
  );
});

test("concurrent duplicate create converges and archive/reactivate cannot revive an archive", async () => {
  const duplicateHarness = harness();
  const duplicateResults = await Promise.all([
    duplicateHarness.repository.create(createInput()),
    duplicateHarness.repository.create(createInput()),
  ]);
  assert.deepEqual(duplicateResults.map((result) => result.outcome).sort(), [
    "ALREADY_ACTIVE",
    "CREATED",
  ]);
  assert.equal(duplicateHarness.snapshot().assignments.length, 1);
  assert.equal(duplicateHarness.snapshot().audits.length, 1);

  const raceHarness = harness([
    record("coordinator-a", {
      status: BatchCoordinatorAssignmentStatus.INACTIVE,
      unassignedAt: assignedAt,
    }),
  ]);
  const id = "assignment-coordinator-a";
  const [archived, reactivated] = await Promise.all([
    raceHarness.repository.archive(transitionInput(id, later)),
    raceHarness.repository.reactivate({
      ...transitionInput(id, new Date("2026-08-25T12:00:00.000Z")),
      expiresAt: null,
    }),
  ]);
  assert.equal(archived.outcome, "ARCHIVED");
  assert.equal(reactivated.outcome, "ASSIGNMENT_ARCHIVED");
  assert.equal(
    raceHarness.snapshot().assignments[0]!.status,
    BatchCoordinatorAssignmentStatus.ARCHIVED,
  );
});

test("concurrent unassign/reactivate serializes to one valid lifecycle state", async () => {
  const h = harness([record()]);
  const id = "assignment-coordinator-a";
  const [unassigned, reactivated] = await Promise.all([
    h.repository.unassign(transitionInput(id, later)),
    h.repository.reactivate({
      ...transitionInput(id, new Date("2026-08-25T12:00:00.000Z")),
      expiresAt: null,
    }),
  ]);
  assert.equal(unassigned.outcome, "UNASSIGNED");
  assert.equal(reactivated.outcome, "REACTIVATED");
  const final = h.snapshot().assignments[0]!;
  assert.equal(final.status, BatchCoordinatorAssignmentStatus.ACTIVE);
  assert.equal(final.unassignedAt, null);
  assert.equal(
    await h.repository.hasActiveAuthority({
      departmentId: "department-a",
      coordinatorUserId: "coordinator-a",
      studentBatchId: "batch-a",
      academicTermId: "term-a",
      evaluatedAt: new Date("2026-08-25T12:30:00.000Z"),
    }),
    true,
  );
});

test("Serializable transactions continue to retry P2034", async () => {
  const h = harness();
  h.failNextTransaction(knownRequestError("P2034"));

  assert.equal((await h.repository.create(createInput())).outcome, "CREATED");
  assert.equal(h.transactions.length, 2);
  assert.equal(h.snapshot().assignments.length, 1);
  assert.equal(h.snapshot().audits.length, 1);
});

test("P2010 with SQLSTATE 40001 retries and observes a competing terminal archive", async () => {
  const h = harness([
    record("coordinator-a", {
      status: BatchCoordinatorAssignmentStatus.INACTIVE,
      unassignedAt: assignedAt,
    }),
  ]);
  h.failNextTransaction(
    knownRequestError("P2010", { code: "40001" }),
    (state) => {
      const assignment = state.assignments[0]!;
      Object.assign(assignment, {
        status: BatchCoordinatorAssignmentStatus.ARCHIVED,
        archivedAt: later,
      });
      state.audits.push({
        action: "course-management.batch-coordinator-assignment.archived",
        outcome: "SUCCESS",
      });
    },
  );

  const result = await h.repository.reactivate({
    ...transitionInput(
      "assignment-coordinator-a",
      new Date("2026-08-25T12:00:00.000Z"),
    ),
    expiresAt: null,
  });

  assert.equal(result.outcome, "ASSIGNMENT_ARCHIVED");
  assert.equal(h.transactions.length, 2);
  assert.equal(
    h.snapshot().assignments[0]!.status,
    BatchCoordinatorAssignmentStatus.ARCHIVED,
  );
  assert.deepEqual(
    h.snapshot().audits.map((audit) => audit.action),
    ["course-management.batch-coordinator-assignment.archived"],
  );
});

test("generic P2010, unrelated Prisma errors, and application errors are not retried", async () => {
  for (const error of [
    knownRequestError("P2010"),
    knownRequestError("P2010", { code: "42601" }),
    knownRequestError("P2010", { code: 40001 }),
    knownRequestError("P2028"),
    new Error("APPLICATION_FAILURE"),
  ]) {
    const h = harness();
    h.failNextTransaction(error);

    await assert.rejects(
      h.repository.create(createInput()),
      (caught: unknown) => caught === error,
    );
    assert.equal(h.transactions.length, 1);
    assert.deepEqual(h.snapshot(), { assignments: [], audits: [] });
  }
});

test("retryable Serializable conflicts stop after exactly three attempts", async () => {
  const h = harness();
  const error = knownRequestError("P2010", { code: "40001" });
  h.failNextTransaction(error);
  h.failNextTransaction(error);
  h.failNextTransaction(error);

  await assert.rejects(
    h.repository.create(createInput()),
    (caught: unknown) => caught === error,
  );
  assert.equal(h.transactions.length, 3);
  assert.ok(
    h.transactions.every(
      (options) =>
        (
          options as {
            isolationLevel: unknown;
            maxWait: number;
            timeout: number;
          }
        ).isolationLevel === Prisma.TransactionIsolationLevel.Serializable &&
        (options as { maxWait: number }).maxWait === 10_000 &&
        (options as { timeout: number }).timeout === 30_000,
    ),
  );
  assert.deepEqual(h.snapshot(), { assignments: [], audits: [] });
});
