import assert from "node:assert/strict";
import test from "node:test";

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import {
  ExaminationCourseExaminerAssignmentStatus,
  ExaminationCourseExaminerSeat,
  Prisma,
} from "@prisma/client";

import { PLATFORM_ROLES } from "@/modules/identity-access/authorization/roles.constants";

import { ExaminationCourseExaminerAssignmentService } from "./examination-course-examiner-assignment.service";

const authority = {
  departmentId: "department-a",
  actorUserId: "admin-a",
  userRoleId: "user-role-a",
  roleId: "role-a",
};

interface AssignmentFixture {
  id: string;
  departmentId: string;
  examinationId: string;
  examinationCourseId: string;
  assignedUserId: string;
  assignedByUserId: string;
  seat: ExaminationCourseExaminerSeat;
  status: ExaminationCourseExaminerAssignmentStatus;
  assignedAt: Date;
  expiresAt: Date | null;
  unassignedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function assignment(
  overrides: Partial<AssignmentFixture> = {},
): AssignmentFixture {
  return {
    id: "assignment-old",
    departmentId: "department-a",
    examinationId: "exam-a",
    examinationCourseId: "exam-course-a",
    assignedUserId: "user-old",
    assignedByUserId: "admin-a",
    seat: ExaminationCourseExaminerSeat.FIRST_EXAMINER,
    status: ExaminationCourseExaminerAssignmentStatus.ACTIVE,
    assignedAt: new Date("2026-01-01T00:00:00.000Z"),
    expiresAt: new Date("2026-01-02T00:00:00.000Z"),
    unassignedAt: null,
    archivedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function sqlText(query: unknown) {
  const value = query as { sql?: string; text?: string };
  return value.sql ?? value.text ?? String(query);
}

function harness(
  initial: AssignmentFixture[] = [],
  options: {
    currentCourse?: boolean;
    currentExamination?: boolean;
    eligibleTeacher?: boolean;
    failAuditAction?: string;
  } = {},
) {
  let records = structuredClone(initial);
  let audits: Array<{ data: Record<string, unknown> }> = [];
  const lockOrder: string[] = [];
  const teacherEligibilityQueries: string[] = [];
  const teacherEligibilityQueryValues: unknown[][] = [];
  const transactionOptions: unknown[] = [];
  const tx = {
    $queryRaw: async (query: unknown) => {
      const sql = sqlText(query);
      if (sql.includes('FROM "examinations"')) {
        lockOrder.push("examination");
        return options.currentExamination === false ? [] : [{ id: "exam-a" }];
      }
      if (sql.includes('FROM "examination_courses"')) {
        lockOrder.push("examination-course");
        return options.currentCourse === false ? [] : [{ id: "exam-course-a" }];
      }
      if (sql.includes('FROM "users"')) {
        lockOrder.push("eligible-teacher");
        teacherEligibilityQueries.push(sql);
        teacherEligibilityQueryValues.push(
          (query as { values?: unknown[] }).values ?? [],
        );
        return options.eligibleTeacher === false
          ? []
          : [
              {
                id: "user-new",
                userRoleId: "teacher-user-role-a",
                roleId: "teacher-role-a",
              },
            ];
      }
      if (sql.includes('FROM "examination_course_examiner_assignments"')) {
        lockOrder.push("assignments");
        if (sql.includes('WHERE "id" =')) {
          return records.length === 0 ? [] : [{ id: records[0]!.id }];
        }
        return records
          .filter(
            (record) =>
              record.departmentId === authority.departmentId &&
              record.status ===
                ExaminationCourseExaminerAssignmentStatus.ACTIVE,
          )
          .sort((left, right) => left.id.localeCompare(right.id))
          .map((record) => ({ id: record.id }));
      }
      return [];
    },
    examinationCourse: {
      findFirst: async () =>
        options.currentCourse === false
          ? null
          : { id: "exam-course-a", examinationId: "exam-a" },
    },
    examinationCourseExaminerAssignment: {
      findMany: async () =>
        records
          .filter(
            (record) =>
              record.status ===
              ExaminationCourseExaminerAssignmentStatus.ACTIVE,
          )
          .sort((left, right) => left.id.localeCompare(right.id)),
      findFirst: async (args: { where: { id: string } }) =>
        records.find((record) => record.id === args.where.id) ?? null,
      create: async (args: { data: Partial<AssignmentFixture> }) => {
        const now = new Date();
        const created = assignment({
          ...args.data,
          id: `assignment-${records.length + 1}`,
          createdAt: now,
          updatedAt: now,
        });
        records.push(created);
        return created;
      },
      updateMany: async (args: {
        where: { id: string };
        data: Partial<AssignmentFixture>;
      }) => {
        const record = records.find((item) => item.id === args.where.id);
        if (!record) return { count: 0 };
        Object.assign(record, args.data, { updatedAt: new Date() });
        return { count: 1 };
      },
    },
    auditLog: {
      create: async (entry: { data: Record<string, unknown> }) => {
        if (entry.data.action === options.failAuditAction) {
          throw new Error("audit failed");
        }
        audits.push(structuredClone(entry));
        return entry;
      },
    },
  };
  const prisma = {
    $transaction: async (
      operation: (client: typeof tx) => Promise<unknown>,
      transactionOption: unknown,
    ) => {
      transactionOptions.push(transactionOption);
      const recordSnapshot = structuredClone(records);
      const auditSnapshot = structuredClone(audits);
      try {
        return await operation(tx);
      } catch (error) {
        records = recordSnapshot;
        audits = auditSnapshot;
        throw error;
      }
    },
  };
  return {
    audits: () => audits,
    lockOrder,
    records: () => records,
    service: new ExaminationCourseExaminerAssignmentService(
      prisma as never,
      {
        get: () => ({
          requestId: "request-a",
          audit: { ipAddress: "127.0.0.1", userAgent: "test" },
        }),
      } as never,
      {
        authorize: async () => authority,
        assertCurrentAuthority: async () => undefined,
      } as never,
    ),
    teacherEligibilityQueries,
    teacherEligibilityQueryValues,
    transactionOptions,
  };
}

test("active same-department Teacher can be independently assigned First or Second Examiner", async () => {
  for (const seat of [
    ExaminationCourseExaminerSeat.FIRST_EXAMINER,
    ExaminationCourseExaminerSeat.SECOND_EXAMINER,
  ]) {
    const h = harness();
    const created = await h.service.assign("exam-course-a", {
      assignedUserId: "user-new",
      seat,
    });
    assert.equal(created.departmentId, authority.departmentId);
    assert.equal(created.examinationId, "exam-a");
    assert.equal(created.examinationCourseId, "exam-course-a");
    assert.equal(created.assignedByUserId, authority.actorUserId);
    assert.equal(created.seat, seat);
    assert.deepEqual(h.lockOrder.slice(0, 4), [
      "examination",
      "examination-course",
      "eligible-teacher",
      "assignments",
    ]);
    assert.equal(
      (h.transactionOptions[0] as { isolationLevel: unknown }).isolationLevel,
      Prisma.TransactionIsolationLevel.Serializable,
    );
    assert.equal(
      h.audits()[0]!.data.action,
      "summative-examination.examiner-assignment.created",
    );
  }
});

test("eligible Teacher lock validates current UserRole and Role without requiring Course Teacher status", async () => {
  const h = harness();
  await h.service.assign("exam-course-a", {
    assignedUserId: "multi-role-teacher",
    seat: ExaminationCourseExaminerSeat.FIRST_EXAMINER,
  });
  const sql = h.teacherEligibilityQueries[0]!;
  assert.match(sql, /JOIN "user_roles" ur/);
  assert.match(sql, /JOIN "roles" r/);
  assert.match(sql, /ur\."revoked_at" IS NULL/);
  assert.match(sql, /ur\."expires_at" IS NULL OR ur\."expires_at" >/);
  assert.match(sql, /r\."code" =/);
  assert.ok(
    h.teacherEligibilityQueryValues[0]!.includes(PLATFORM_ROLES.TEACHER),
  );
  assert.match(sql, /r\."archived_at" IS NULL/);
  assert.match(sql, /FOR UPDATE OF u, ur FOR SHARE OF r/);
  assert.doesNotMatch(sql, /teacher_course_assignments/i);
  assert.doesNotMatch(sql, /course_teacher/i);
});

for (const ineligibleCase of [
  "Student-only target",
  "Department-Admin-only target",
  "revoked Teacher UserRole",
  "expired Teacher UserRole",
  "archived Teacher Role",
  "wrong-department Teacher",
  "inactive User",
  "archived User",
  "deleted User",
]) {
  test(`${ineligibleCase} is rejected with safe not-found`, async () => {
    const h = harness([], { eligibleTeacher: false });
    await assert.rejects(
      h.service.assign("exam-course-a", {
        assignedUserId: "ineligible-user",
        seat: ExaminationCourseExaminerSeat.FIRST_EXAMINER,
      }),
      NotFoundException,
    );
    assert.equal(h.records().length, 0);
    assert.equal(h.audits().length, 0);
  });
}

test("valid ACTIVE seat occupant and same-user cross-seat occupant are never silently replaced", async () => {
  for (const existing of [
    assignment({ expiresAt: new Date("2099-01-01T00:00:00.000Z") }),
    assignment({
      assignedUserId: "user-new",
      seat: ExaminationCourseExaminerSeat.SECOND_EXAMINER,
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    }),
  ]) {
    const h = harness([existing]);
    await assert.rejects(
      h.service.assign("exam-course-a", {
        assignedUserId: "user-new",
        seat: ExaminationCourseExaminerSeat.FIRST_EXAMINER,
      }),
      ConflictException,
    );
    assert.equal(h.records().length, 1);
    assert.equal(
      h.records()[0]!.status,
      ExaminationCourseExaminerAssignmentStatus.ACTIVE,
    );
    assert.equal(h.audits().length, 0);
  }
});

test("expired ACTIVE conflict retirement, successor creation, and both audits are atomic", async () => {
  const h = harness([assignment()]);
  await h.service.assign("exam-course-a", {
    assignedUserId: "user-new",
    seat: ExaminationCourseExaminerSeat.FIRST_EXAMINER,
  });
  assert.equal(
    h.records()[0]!.status,
    ExaminationCourseExaminerAssignmentStatus.INACTIVE,
  );
  assert.ok(h.records()[0]!.unassignedAt instanceof Date);
  assert.equal(h.records().length, 2);
  assert.deepEqual(
    h.audits().map((audit) => audit.data.action),
    [
      "summative-examination.examiner-assignment.expired-auto-retired",
      "summative-examination.examiner-assignment.created",
    ],
  );

  const rollback = harness([assignment()], {
    failAuditAction: "summative-examination.examiner-assignment.created",
  });
  await assert.rejects(
    rollback.service.assign("exam-course-a", {
      assignedUserId: "user-new",
      seat: ExaminationCourseExaminerSeat.FIRST_EXAMINER,
    }),
    /audit failed/,
  );
  assert.equal(rollback.records().length, 1);
  assert.equal(
    rollback.records()[0]!.status,
    ExaminationCourseExaminerAssignmentStatus.ACTIVE,
  );
  assert.equal(rollback.audits().length, 0);

  const retirementAuditRollback = harness([assignment()], {
    failAuditAction:
      "summative-examination.examiner-assignment.expired-auto-retired",
  });
  await assert.rejects(
    retirementAuditRollback.service.assign("exam-course-a", {
      assignedUserId: "user-new",
      seat: ExaminationCourseExaminerSeat.FIRST_EXAMINER,
    }),
    /audit failed/,
  );
  assert.equal(retirementAuditRollback.records().length, 1);
  assert.equal(
    retirementAuditRollback.records()[0]!.status,
    ExaminationCourseExaminerAssignmentStatus.ACTIVE,
  );
  assert.equal(retirementAuditRollback.audits().length, 0);
});

test("cross-department/current-parent and target-user failures are safe not-found", async () => {
  for (const options of [
    { currentCourse: false },
    { currentExamination: false },
    { eligibleTeacher: false },
  ]) {
    const h = harness([], options);
    await assert.rejects(
      h.service.assign("foreign-or-archived-course", {
        assignedUserId: "foreign-inactive-or-deleted-user",
        seat: ExaminationCourseExaminerSeat.FIRST_EXAMINER,
      }),
      NotFoundException,
    );
    assert.equal(h.records().length, 0);
    assert.equal(h.audits().length, 0);
  }
  await assert.rejects(
    harness().service.unassign("foreign-assignment"),
    NotFoundException,
  );
});

test("assignment lifecycle preserves history and archived rows are immutable", async () => {
  const active = assignment({ expiresAt: new Date("2099-01-01T00:00:00.000Z") });
  const h = harness([active]);
  const inactive = await h.service.unassign(active.id);
  assert.equal(inactive.status, ExaminationCourseExaminerAssignmentStatus.INACTIVE);
  assert.ok(inactive.unassignedAt instanceof Date);
  const reactivated = await h.service.reactivate(active.id, {
    expiresAt: "2099-02-01T00:00:00.000Z",
  });
  assert.equal(reactivated.status, ExaminationCourseExaminerAssignmentStatus.ACTIVE);
  assert.equal(reactivated.unassignedAt, null);
  const updated = await h.service.updateExpiry(
    active.id,
    "2099-03-01T00:00:00.000Z",
  );
  assert.equal(updated.expiresAt?.toISOString(), "2099-03-01T00:00:00.000Z");
  const archived = await h.service.archive(active.id);
  assert.equal(archived.status, ExaminationCourseExaminerAssignmentStatus.ARCHIVED);
  assert.ok(archived.archivedAt instanceof Date);
  await assert.rejects(h.service.unassign(active.id), ConflictException);
  assert.equal(h.records().length, 1);
  assert.deepEqual(
    h.audits().map((audit) => audit.data.action),
    [
      "summative-examination.examiner-assignment.unassigned",
      "summative-examination.examiner-assignment.reactivated",
      "summative-examination.examiner-assignment.expiry-updated",
      "summative-examination.examiner-assignment.archived",
    ],
  );
});

test("creation, reactivation, and expiry update require strictly future expiry", async () => {
  const h = harness([
    assignment({
      status: ExaminationCourseExaminerAssignmentStatus.INACTIVE,
      unassignedAt: new Date("2026-01-03T00:00:00.000Z"),
    }),
  ]);
  for (const operation of [
    () =>
      h.service.assign("exam-course-a", {
        assignedUserId: "user-new",
        seat: ExaminationCourseExaminerSeat.SECOND_EXAMINER,
        expiresAt: "2000-01-01T00:00:00.000Z",
      }),
    () =>
      h.service.reactivate("assignment-old", {
        expiresAt: "2000-01-01T00:00:00.000Z",
      }),
    () => h.service.updateExpiry("assignment-old", "2000-01-01T00:00:00.000Z"),
  ]) {
    await assert.rejects(operation(), BadRequestException);
  }
});

test("list and get operations retain department and current governing-object scope", async () => {
  const queries: unknown[] = [];
  const service = new ExaminationCourseExaminerAssignmentService(
    {
      examinationCourse: {
        findFirst: async (args: unknown) => {
          queries.push(args);
          return { id: "exam-course-a" };
        },
      },
      examinationCourseExaminerAssignment: {
        findMany: async (args: unknown) => {
          queries.push(args);
          return [];
        },
        findFirst: async (args: unknown) => {
          queries.push(args);
          return assignment();
        },
      },
    } as never,
    {} as never,
    { authorize: async () => authority } as never,
  );
  await service.listHistory("exam-course-a");
  await service.getById("assignment-old");
  const serialized = JSON.stringify(queries);
  assert.match(serialized, /"departmentId":"department-a"/);
  assert.match(serialized, /"archivedAt":null/);
  assert.match(serialized, /"examinationCourseId":"exam-course-a"/);
});
