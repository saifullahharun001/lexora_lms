import assert from "node:assert/strict";
import test from "node:test";

import { AcademicVersionStatus } from "@prisma/client";

import type {
  SyllabusVersionLifecycleAction,
  TransitionSyllabusVersionInput,
} from "../../application/ports/academic.repository.port";
import { ACADEMIC_AUDIT_EVENTS } from "../../domain/academic.audit-events";
import { PrismaAcademicRepository } from "./prisma-academic.repository";

type ConditionalMiss = "target" | "malformed-target" | "unexpected" | "missing";

const originalApproval = new Date("2026-08-15T00:00:00.000Z");
const transitionAt = new Date("2026-08-17T10:30:00.000Z");

function curriculumCourse() {
  return {
    id: "curriculum-course-a",
    departmentId: "department-a",
    curriculumVersionId: "curriculum-version-a",
    courseId: "course-a",
    assessmentTemplateId: "template-a",
    categoryCode: "CORE",
    academicYearNumber: 1,
    semesterNumber: 1,
    courseCodeSnapshot: "LAW-101",
    courseTitleSnapshot: "Law 101",
    creditHoursSnapshot: "3.00",
    totalMarksSnapshot: "100.00",
    course: {
      id: "course-a",
      departmentId: "department-a",
      academicProgramId: "program-a",
      code: "LAW-101",
      title: "Law 101",
    },
    curriculumVersion: {
      id: "curriculum-version-a",
      departmentId: "department-a",
      academicProgramId: "program-a",
      code: "CURR-1",
      name: "Curriculum 1",
      status: AcademicVersionStatus.ACTIVE,
      effectiveAcademicSessionCode: "2026-2027",
      academicProgram: { id: "program-a", departmentId: "department-a" },
    },
    assessmentTemplate: {
      id: "template-a",
      departmentId: "department-a",
      academicProgramId: "program-a",
      code: "ASSESS-1",
      versionNumber: 1,
      name: "Assessment 1",
      status: AcademicVersionStatus.ACTIVE,
      totalMarks: "100.00",
      academicProgram: { id: "program-a", departmentId: "department-a" },
    },
  };
}

type LifecycleState = ReturnType<typeof createState>;

function createState(status: AcademicVersionStatus) {
  return {
    id: "syllabus-a",
    departmentId: "department-a",
    curriculumCourseId: "curriculum-course-a",
    code: "SYL-1",
    versionNumber: 1,
    status,
    effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
    effectiveTo: new Date("2027-06-30T00:00:00.000Z"),
    approvedAt:
      status === AcademicVersionStatus.DRAFT ? null : originalApproval,
    archivedAt:
      status === AcademicVersionStatus.ARCHIVED
        ? new Date("2026-08-16T00:00:00.000Z")
        : null,
    createdAt: new Date("2026-08-14T00:00:00.000Z"),
    updatedAt: new Date("2026-08-16T00:00:00.000Z"),
    curriculumCourse: curriculumCourse(),
  };
}

function input(
  action: SyllabusVersionLifecycleAction,
  overrides: Partial<TransitionSyllabusVersionInput> = {},
): TransitionSyllabusVersionInput {
  return {
    departmentId: "department-a",
    syllabusVersionId: "syllabus-a",
    action,
    reason: "Lifecycle authority confirmed",
    actorUserId: "admin-a",
    transitionAt,
    requestId: "request-a",
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
    ...overrides,
  };
}

function harness(
  initialStatus: AcademicVersionStatus,
  options: {
    conditionalMiss?: ConditionalMiss;
    failAudit?: boolean;
    malformedPostTransition?: boolean;
  } = {},
) {
  let state: LifecycleState | null = createState(initialStatus);
  const audits: Array<{ data: Record<string, unknown> }> = [];
  const updates: Array<{
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }> = [];
  let missApplied = false;
  let postTransitionMalformed = false;

  const tx = {
    syllabusVersion: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        if (
          !state ||
          args.where.id !== state.id ||
          args.where.departmentId !== state.departmentId
        ) {
          return null;
        }
        if (
          options.malformedPostTransition &&
          updates.length > 0 &&
          !postTransitionMalformed
        ) {
          postTransitionMalformed = true;
          state = { ...state, approvedAt: null };
        }
        return state;
      },
      updateMany: async (args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        updates.push(args);
        if (options.conditionalMiss && !missApplied) {
          missApplied = true;
          if (options.conditionalMiss === "missing") {
            state = null;
          } else if (state) {
            state = {
              ...state,
              status:
                options.conditionalMiss === "target" ||
                options.conditionalMiss === "malformed-target"
                  ? (args.data.status as AcademicVersionStatus)
                  : AcademicVersionStatus.RETIRED,
              approvedAt:
                options.conditionalMiss === "malformed-target"
                  ? null
                  : "approvedAt" in args.data
                    ? (args.data.approvedAt as Date)
                    : state.approvedAt,
              archivedAt:
                (options.conditionalMiss === "target" ||
                  options.conditionalMiss === "malformed-target") &&
                "archivedAt" in args.data
                  ? (args.data.archivedAt as Date)
                  : state.archivedAt,
              updatedAt: transitionAt,
            };
          }
          return { count: 0 };
        }

        const approvedAtPredicateMatches =
          args.where.approvedAt === null
            ? state?.approvedAt === null
            : typeof args.where.approvedAt === "object" &&
                args.where.approvedAt !== null &&
                "not" in args.where.approvedAt
              ? state?.approvedAt !== null
              : true;
        const curriculumCourseFilter = args.where.curriculumCourse as {
          is: { id: string; departmentId: string };
        };

        if (
          !state ||
          state.status !== args.where.status ||
          state.departmentId !== args.where.departmentId ||
          state.curriculumCourseId !== args.where.curriculumCourseId ||
          state.curriculumCourse.id !== curriculumCourseFilter.is.id ||
          state.curriculumCourse.departmentId !==
            curriculumCourseFilter.is.departmentId ||
          !approvedAtPredicateMatches ||
          state.archivedAt !== null
        ) {
          return { count: 0 };
        }

        state = {
          ...state,
          ...args.data,
          updatedAt: transitionAt,
        } as LifecycleState;
        return { count: 1 };
      },
    },
    auditLog: {
      create: async (args: { data: Record<string, unknown> }) => {
        if (options.failAudit) throw new Error("AUDIT_WRITE_FAILED");
        audits.push(args);
        return { id: "audit-a" };
      },
    },
  };

  const prisma = {
    async $transaction<T>(callback: (client: typeof tx) => Promise<T>) {
      const before = state ? structuredClone(state) : null;
      const auditCount = audits.length;
      try {
        return await callback(tx);
      } catch (error) {
        state = before;
        audits.splice(auditCount);
        throw error;
      }
    },
  };

  return {
    repository: new PrismaAcademicRepository(prisma as never),
    audits,
    updates,
    getState: () => state,
    setParentDepartment: (departmentId: string) => {
      if (state) state.curriculumCourse.departmentId = departmentId;
    },
    setTimestamps: (timestamps: {
      approvedAt?: Date | null;
      archivedAt?: Date | null;
    }) => {
      if (state) Object.assign(state, timestamps);
    },
  };
}

const positiveCases = [
  {
    action: "APPROVE",
    from: AcademicVersionStatus.DRAFT,
    to: AcademicVersionStatus.APPROVED,
    event: ACADEMIC_AUDIT_EVENTS.SYLLABUS_VERSION_APPROVED,
  },
  {
    action: "ACTIVATE",
    from: AcademicVersionStatus.APPROVED,
    to: AcademicVersionStatus.ACTIVE,
    event: ACADEMIC_AUDIT_EVENTS.SYLLABUS_VERSION_ACTIVATED,
  },
  {
    action: "RETIRE",
    from: AcademicVersionStatus.ACTIVE,
    to: AcademicVersionStatus.RETIRED,
    event: ACADEMIC_AUDIT_EVENTS.SYLLABUS_VERSION_RETIRED,
  },
  {
    action: "ARCHIVE",
    from: AcademicVersionStatus.RETIRED,
    to: AcademicVersionStatus.ARCHIVED,
    event: ACADEMIC_AUDIT_EVENTS.SYLLABUS_VERSION_ARCHIVED,
  },
] as const;

for (const lifecycleCase of positiveCases) {
  test(`${lifecycleCase.from} -> ${lifecycleCase.to} mutates and audits atomically`, async () => {
    const h = harness(lifecycleCase.from);
    const before = h.getState()!;
    const approvedAtBefore = before.approvedAt;
    const effectiveFromBefore = before.effectiveFrom;
    const effectiveToBefore = before.effectiveTo;

    const result = await h.repository.transitionSyllabusVersion(
      input(lifecycleCase.action),
    );

    assert.equal(result.outcome, "TRANSITIONED");
    if (result.outcome !== "TRANSITIONED") return;
    assert.equal(result.syllabusVersion.status, lifecycleCase.to);
    assert.equal(h.getState()!.status, lifecycleCase.to);
    assert.equal(h.getState()!.effectiveFrom, effectiveFromBefore);
    assert.equal(h.getState()!.effectiveTo, effectiveToBefore);
    assert.equal(h.audits.length, 1);
    assert.equal(h.audits[0]!.data.action, lifecycleCase.event);
    assert.equal(h.audits[0]!.data.targetType, "syllabus_version");
    assert.equal(h.audits[0]!.data.targetId, "syllabus-a");
    assert.equal(h.audits[0]!.data.actorUserId, "admin-a");
    assert.equal(h.audits[0]!.data.departmentId, "department-a");
    assert.equal(h.audits[0]!.data.occurredAt, transitionAt);

    const context = h.audits[0]!.data.contextJson as Record<string, unknown>;
    assert.equal(context.syllabusVersionId, "syllabus-a");
    assert.equal(context.curriculumCourseId, "curriculum-course-a");
    assert.equal(context.code, "SYL-1");
    assert.equal(context.versionNumber, 1);
    assert.equal(context.previousStatus, lifecycleCase.from);
    assert.equal(context.newStatus, lifecycleCase.to);
    assert.equal(context.reason, "Lifecycle authority confirmed");
    assert.equal(context.actorUserId, "admin-a");
    assert.equal(context.departmentId, "department-a");
    assert.equal(context.transitionTimestamp, transitionAt.toISOString());

    if (lifecycleCase.action === "APPROVE") {
      assert.equal(h.getState()!.approvedAt, transitionAt);
      assert.equal(h.updates[0]!.where.approvedAt, null);
    } else {
      assert.equal(h.getState()!.approvedAt, approvedAtBefore);
      assert.equal("approvedAt" in h.updates[0]!.data, false);
      assert.deepEqual(h.updates[0]!.where.approvedAt, { not: null });
    }
    if (lifecycleCase.action === "ARCHIVE") {
      assert.equal(h.getState()!.archivedAt, transitionAt);
    } else {
      assert.equal(h.getState()!.archivedAt, null);
      assert.equal("archivedAt" in h.updates[0]!.data, false);
    }
    assert.equal("effectiveFrom" in h.updates[0]!.data, false);
    assert.equal("effectiveTo" in h.updates[0]!.data, false);
  });
}

for (const lifecycleCase of positiveCases) {
  test(`${lifecycleCase.action} retry at its exact valid target is unaudited and idempotent`, async () => {
    const h = harness(lifecycleCase.to);
    const before = structuredClone(h.getState());
    const result = await h.repository.transitionSyllabusVersion(
      input(lifecycleCase.action),
    );

    assert.equal(result.outcome, "ALREADY_TARGET");
    assert.deepEqual(h.getState(), before);
    assert.equal(h.updates.length, 0);
    assert.equal(h.audits.length, 0);
  });
}

test("skipped, backward, and terminal ARCHIVED transitions fail closed", async () => {
  const invalidCases: Array<
    [AcademicVersionStatus, SyllabusVersionLifecycleAction]
  > = [
    [AcademicVersionStatus.DRAFT, "ACTIVATE"],
    [AcademicVersionStatus.DRAFT, "RETIRE"],
    [AcademicVersionStatus.APPROVED, "ARCHIVE"],
    [AcademicVersionStatus.ACTIVE, "APPROVE"],
    [AcademicVersionStatus.ACTIVE, "ARCHIVE"],
    [AcademicVersionStatus.RETIRED, "ACTIVATE"],
    [AcademicVersionStatus.ARCHIVED, "ACTIVATE"],
    [AcademicVersionStatus.ARCHIVED, "APPROVE"],
  ];

  for (const [status, action] of invalidCases) {
    const h = harness(status);
    const before = structuredClone(h.getState());
    const result = await h.repository.transitionSyllabusVersion(input(action));
    assert.equal(result.outcome, "INVALID_TRANSITION");
    assert.deepEqual(h.getState(), before);
    assert.equal(h.updates.length, 0);
    assert.equal(h.audits.length, 0);
  }
});

test("wrong-department direct ID is safe not-found without mutation or audit", async () => {
  const h = harness(AcademicVersionStatus.DRAFT);
  const result = await h.repository.transitionSyllabusVersion(
    input("APPROVE", { departmentId: "department-b" }),
  );

  assert.equal(result.outcome, "SYLLABUS_VERSION_NOT_FOUND");
  assert.equal(h.updates.length, 0);
  assert.equal(h.audits.length, 0);
});

test("malformed cross-department CurriculumCourse dependency fails closed", async () => {
  const h = harness(AcademicVersionStatus.DRAFT);
  h.setParentDepartment("department-b");
  const result = await h.repository.transitionSyllabusVersion(input("APPROVE"));

  assert.equal(result.outcome, "DEPENDENCY_SCOPE_MISMATCH");
  assert.equal(h.updates.length, 0);
  assert.equal(h.audits.length, 0);
});

test("malformed lifecycle timestamps are neither mutated nor accepted as idempotent", async () => {
  const malformedCases: Array<{
    status: AcademicVersionStatus;
    action: SyllabusVersionLifecycleAction;
    approvedAt?: Date | null;
    archivedAt?: Date | null;
  }> = [
    {
      status: AcademicVersionStatus.DRAFT,
      action: "APPROVE",
      approvedAt: originalApproval,
    },
    {
      status: AcademicVersionStatus.APPROVED,
      action: "APPROVE",
      approvedAt: null,
    },
    {
      status: AcademicVersionStatus.APPROVED,
      action: "ACTIVATE",
      approvedAt: null,
    },
    {
      status: AcademicVersionStatus.ACTIVE,
      action: "ACTIVATE",
      approvedAt: null,
    },
    {
      status: AcademicVersionStatus.RETIRED,
      action: "ARCHIVE",
      approvedAt: null,
    },
    {
      status: AcademicVersionStatus.ARCHIVED,
      action: "ARCHIVE",
      approvedAt: null,
    },
    {
      status: AcademicVersionStatus.ACTIVE,
      action: "RETIRE",
      archivedAt: transitionAt,
    },
  ];

  for (const lifecycleCase of malformedCases) {
    const h = harness(lifecycleCase.status);
    h.setTimestamps({
      ...(lifecycleCase.approvedAt !== undefined
        ? { approvedAt: lifecycleCase.approvedAt }
        : {}),
      ...(lifecycleCase.archivedAt !== undefined
        ? { archivedAt: lifecycleCase.archivedAt }
        : {}),
    });
    const before = structuredClone(h.getState());
    const result = await h.repository.transitionSyllabusVersion(
      input(lifecycleCase.action),
    );
    assert.equal(result.outcome, "INVALID_TRANSITION");
    assert.deepEqual(h.getState(), before);
    assert.equal(h.updates.length, 0);
    assert.equal(h.audits.length, 0);
  }
});

test("guarded mutation includes immutable identity, department, expected state, and timestamps", async () => {
  const h = harness(AcademicVersionStatus.APPROVED);
  await h.repository.transitionSyllabusVersion(input("ACTIVATE"));

  assert.equal(h.updates.length, 1);
  assert.deepEqual(h.updates[0]!.where, {
    id: "syllabus-a",
    departmentId: "department-a",
    curriculumCourseId: "curriculum-course-a",
    status: AcademicVersionStatus.APPROVED,
    approvedAt: { not: null },
    archivedAt: null,
    curriculumCourse: {
      is: { id: "curriculum-course-a", departmentId: "department-a" },
    },
  });
});

test("concurrent same-action guarded miss resolves as one unaudited idempotent observer", async () => {
  const h = harness(AcademicVersionStatus.APPROVED, {
    conditionalMiss: "target",
  });
  const result = await h.repository.transitionSyllabusVersion(
    input("ACTIVATE"),
  );

  assert.equal(result.outcome, "ALREADY_TARGET");
  assert.equal(h.getState()!.status, AcademicVersionStatus.ACTIVE);
  assert.equal(h.updates.length, 1);
  assert.equal(h.audits.length, 0);
});

test("repeated same-action requests create one real transition and one success audit", async () => {
  const h = harness(AcademicVersionStatus.DRAFT);
  const first = await h.repository.transitionSyllabusVersion(input("APPROVE"));
  const laterRetryAt = new Date("2026-08-17T11:30:00.000Z");
  const retry = await h.repository.transitionSyllabusVersion(
    input("APPROVE", { transitionAt: laterRetryAt }),
  );

  assert.equal(first.outcome, "TRANSITIONED");
  assert.equal(retry.outcome, "ALREADY_TARGET");
  assert.equal(h.updates.length, 1);
  assert.equal(h.audits.length, 1);
  assert.equal(h.getState()!.approvedAt, transitionAt);
  assert.notEqual(h.getState()!.approvedAt, laterRetryAt);
});

test("guarded miss reread rejects malformed target and unexpected state", async () => {
  for (const conditionalMiss of ["malformed-target", "unexpected"] as const) {
    const h = harness(AcademicVersionStatus.APPROVED, { conditionalMiss });
    const result = await h.repository.transitionSyllabusVersion(
      input("ACTIVATE"),
    );
    assert.equal(result.outcome, "INVALID_TRANSITION");
    assert.equal(h.audits.length, 0);
  }
});

test("guarded miss after scoped disappearance returns safe not-found", async () => {
  const h = harness(AcademicVersionStatus.APPROVED, {
    conditionalMiss: "missing",
  });
  const result = await h.repository.transitionSyllabusVersion(
    input("ACTIVATE"),
  );

  assert.equal(result.outcome, "SYLLABUS_VERSION_NOT_FOUND");
  assert.equal(h.audits.length, 0);
});

test("malformed post-transition reread rolls mutation back without success audit", async () => {
  const h = harness(AcademicVersionStatus.DRAFT, {
    malformedPostTransition: true,
  });
  const result = await h.repository.transitionSyllabusVersion(input("APPROVE"));

  assert.equal(result.outcome, "INVALID_TRANSITION");
  assert.equal(h.getState()!.status, AcademicVersionStatus.DRAFT);
  assert.equal(h.getState()!.approvedAt, null);
  assert.equal(h.audits.length, 0);
});

test("audit failure rolls lifecycle mutation back with the transaction", async () => {
  const h = harness(AcademicVersionStatus.DRAFT, { failAudit: true });

  await assert.rejects(
    h.repository.transitionSyllabusVersion(input("APPROVE")),
    /AUDIT_WRITE_FAILED/,
  );
  assert.equal(h.getState()!.status, AcademicVersionStatus.DRAFT);
  assert.equal(h.getState()!.approvedAt, null);
  assert.equal(h.audits.length, 0);
});
