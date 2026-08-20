import assert from "node:assert/strict";
import test from "node:test";

import { CourseOutlineStatus } from "@prisma/client";

import { ACADEMIC_AUDIT_EVENTS } from "../../domain/academic.audit-events";
import { PrismaAcademicRepository } from "./prisma-academic.repository";

const transitionAt = new Date("2026-08-20T08:30:00.000Z");

function submissionInput(
  overrides: Partial<{
    departmentId: string;
    courseOfferingId: string;
    courseOutlineVersionId: string;
    actorUserId: string;
  }> = {},
) {
  return {
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    courseOutlineVersionId: "outline-a",
    actorUserId: "teacher-a",
    transitionAt,
    requestId: "request-a",
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
    ...overrides,
  };
}

function initialOutline(status: CourseOutlineStatus) {
  return {
    id: "outline-a",
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    curriculumCourseId: "curriculum-a",
    syllabusVersionId: "syllabus-a",
    versionNumber: 5,
    status,
    courseSummary: "Sensitive narrative summary",
    deliveryPlan: "Sensitive delivery plan",
    teachingStrategies: "Sensitive teaching strategies",
    assessmentStrategy: "Sensitive assessment strategy",
    evaluationPolicy: "Sensitive evaluation policy",
    makeUpProcedure: "Sensitive make-up procedure",
    submittedAt: null as Date | null,
    approvedAt: null as Date | null,
    activatedAt: null as Date | null,
    archivedAt: null as Date | null,
    createdAt: new Date("2026-08-20T00:00:00.000Z"),
    updatedAt: new Date("2026-08-20T00:00:00.000Z"),
  };
}

function harness(
  status: CourseOutlineStatus = CourseOutlineStatus.DRAFT,
  options: {
    assignment?: "ACTIVE" | "INACTIVE" | "UNASSIGNED" | "ARCHIVED";
    authorityLocked?: boolean;
    offeringFound?: boolean;
    outlineFound?: boolean;
    identityMatches?: boolean;
    outlineOverrides?: Partial<ReturnType<typeof initialOutline>>;
    updateCount?: number;
    statusAfterMiss?: CourseOutlineStatus | null;
    auditError?: Error;
  } = {},
) {
  let record = { ...initialOutline(status), ...options.outlineOverrides };
  const audits: unknown[] = [];
  const calls: Array<{ kind: string; args: any }> = [];

  const tx = {
    $queryRaw: async (args: any) => {
      calls.push({ kind: "authority-lock", args });
      if (
        options.authorityLocked === false ||
        options.offeringFound === false ||
        options.assignment === "INACTIVE" ||
        options.assignment === "UNASSIGNED" ||
        options.assignment === "ARCHIVED" ||
        args.values[0] !== "department-a" ||
        args.values[1] !== "teacher-a" ||
        args.values[2] !== "offering-a" ||
        args.values[3] !== "department-a"
      ) {
        return [];
      }
      return [
        {
          courseOfferingId: "offering-a",
          teacherCourseAssignmentId: "assignment-a",
        },
      ];
    },
    courseOffering: {
      findFirst: async (args: any) => {
        calls.push({ kind: "offering", args });
        if (
          options.offeringFound === false ||
          args.where.id !== "offering-a" ||
          args.where.departmentId !== "department-a" ||
          options.assignment === "INACTIVE" ||
          options.assignment === "UNASSIGNED" ||
          options.assignment === "ARCHIVED"
        ) {
          return null;
        }
        return {
          id: "offering-a",
          departmentId: "department-a",
          curriculumCourseId: "curriculum-a",
          syllabusVersionId: "syllabus-a",
        };
      },
    },
    courseOutlineVersion: {
      findFirst: async (args: any) => {
        calls.push({ kind: "outline", args });
        if (
          options.outlineFound === false ||
          args.where.id !== "outline-a" ||
          args.where.departmentId !== "department-a" ||
          args.where.courseOfferingId !== "offering-a"
        ) {
          return null;
        }
        if (args.select?.status === true && args.select?.id !== true) {
          return options.statusAfterMiss === null
            ? null
            : {
                status: options.statusAfterMiss ?? record.status,
                submittedAt: record.submittedAt,
                approvedAt: record.approvedAt,
                activatedAt: record.activatedAt,
                archivedAt: record.archivedAt,
              };
        }
        if (options.identityMatches === false) {
          return { ...record, syllabusVersionId: "syllabus-other" };
        }
        return { ...record };
      },
      updateMany: async (args: any) => {
        calls.push({ kind: "update", args });
        const count = options.updateCount ?? 1;
        if (count === 1) record = { ...record, ...args.data };
        return { count };
      },
    },
    auditLog: {
      create: async (args: any) => {
        calls.push({ kind: "audit", args });
        if (options.auditError) throw options.auditError;
        audits.push(args);
        return args;
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      const recordBefore = { ...record };
      const auditCountBefore = audits.length;
      try {
        return await callback(tx);
      } catch (error) {
        record = recordBefore;
        audits.splice(auditCountBefore);
        throw error;
      }
    },
  };

  return {
    audits,
    calls,
    record: () => ({ ...record }),
    repository: new PrismaAcademicRepository(prisma as never),
  };
}

test("assigned Teacher submits exact DRAFT with server timestamp while identity, version, and narratives remain immutable", async () => {
  const h = harness();
  const before = h.record();
  const result =
    await h.repository.submitCourseOutlineVersion(submissionInput());
  assert.equal(result.outcome, "SUBMITTED");
  if (result.outcome !== "SUBMITTED") return;

  assert.equal(
    result.courseOutlineVersion.status,
    CourseOutlineStatus.SUBMITTED_BY_TEACHER,
  );
  assert.equal(result.courseOutlineVersion.submittedAt, transitionAt);
  for (const field of [
    "departmentId",
    "courseOfferingId",
    "curriculumCourseId",
    "syllabusVersionId",
    "versionNumber",
    "courseSummary",
    "deliveryPlan",
    "teachingStrategies",
    "assessmentStrategy",
    "evaluationPolicy",
    "makeUpProcedure",
    "approvedAt",
    "activatedAt",
    "archivedAt",
  ] as const) {
    assert.equal(h.record()[field], before[field]);
  }

  const offeringQuery = h.calls.find((call) => call.kind === "offering")!.args;
  assert.deepEqual(offeringQuery.where.teacherAssignments, {
    some: {
      departmentId: "department-a",
      courseOfferingId: "offering-a",
      teacherUserId: "teacher-a",
      status: "ACTIVE",
      unassignedAt: null,
      archivedAt: null,
    },
  });
  const authorityLock = h.calls.find(
    (call) => call.kind === "authority-lock",
  )!.args as { strings: string[]; values: unknown[] };
  const authoritySql = authorityLock.strings.join("?");
  assert.equal(h.calls[0]?.kind, "authority-lock");
  assert.match(authoritySql, /FROM "course_offerings" co/);
  assert.match(authoritySql, /INNER JOIN "teacher_course_assignments" tca/);
  assert.match(authoritySql, /tca\."course_offering_id" = co\."id"/);
  assert.match(authoritySql, /tca\."department_id" = \?/);
  assert.match(authoritySql, /tca\."teacher_user_id" = \?/);
  assert.match(authoritySql, /tca\."status" = 'ACTIVE'/);
  assert.match(authoritySql, /tca\."unassigned_at" IS NULL/);
  assert.match(authoritySql, /tca\."archived_at" IS NULL/);
  assert.match(authoritySql, /co\."archived_at" IS NULL/);
  assert.match(authoritySql, /co\."id" = \?/);
  assert.match(authoritySql, /co\."department_id" = \?/);
  assert.match(authoritySql, /FOR UPDATE OF co, tca/);
  assert.deepEqual(authorityLock.values, [
    "department-a",
    "teacher-a",
    "offering-a",
    "department-a",
  ]);
  const update = h.calls.find((call) => call.kind === "update")!.args;
  assert.deepEqual(update.where, {
    id: "outline-a",
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    curriculumCourseId: "curriculum-a",
    syllabusVersionId: "syllabus-a",
    status: CourseOutlineStatus.DRAFT,
    submittedAt: null,
    approvedAt: null,
    activatedAt: null,
    archivedAt: null,
  });
  assert.deepEqual(update.data, {
    status: CourseOutlineStatus.SUBMITTED_BY_TEACHER,
    submittedAt: transitionAt,
  });
});

test("inactive, unassignedAt, archived, missing, wrong-department, and wrong-offering authorization fail safely without audit", async () => {
  const cases = [
    [
      harness(CourseOutlineStatus.DRAFT, { assignment: "INACTIVE" }),
      submissionInput(),
    ],
    [
      harness(CourseOutlineStatus.DRAFT, { assignment: "UNASSIGNED" }),
      submissionInput(),
    ],
    [
      harness(CourseOutlineStatus.DRAFT, { assignment: "ARCHIVED" }),
      submissionInput(),
    ],
    [
      harness(CourseOutlineStatus.DRAFT, { offeringFound: false }),
      submissionInput(),
    ],
    [harness(), submissionInput({ departmentId: "department-other" })],
    [harness(), submissionInput({ courseOfferingId: "offering-other" })],
  ] as const;
  for (const [h, input] of cases) {
    assert.deepEqual(await h.repository.submitCourseOutlineVersion(input), {
      outcome: "OFFERING_NOT_FOUND",
    });
    assert.equal(
      h.calls.some((call) => call.kind === "update"),
      false,
    );
    assert.equal(h.audits.length, 0);
  }
});

test("revoked authority cannot proceed beyond the authorization lock", async () => {
  const h = harness(CourseOutlineStatus.DRAFT, { authorityLocked: false });
  assert.deepEqual(
    await h.repository.submitCourseOutlineVersion(submissionInput()),
    { outcome: "OFFERING_NOT_FOUND" },
  );
  assert.deepEqual(
    h.calls.map((call) => call.kind),
    ["authority-lock"],
  );
  assert.equal(h.record().status, CourseOutlineStatus.DRAFT);
  assert.equal(h.audits.length, 0);
});

test("wrong nested outline, another-offering outline, and academic binding mismatch fail safely without mutation or audit", async () => {
  const cases = [
    [harness(), submissionInput({ courseOutlineVersionId: "outline-other" })],
    [
      harness(CourseOutlineStatus.DRAFT, { outlineFound: false }),
      submissionInput(),
    ],
    [
      harness(CourseOutlineStatus.DRAFT, { identityMatches: false }),
      submissionInput(),
    ],
  ] as const;
  for (const [h, input] of cases) {
    assert.deepEqual(await h.repository.submitCourseOutlineVersion(input), {
      outcome: "OUTLINE_NOT_FOUND",
    });
    assert.equal(
      h.calls.some((call) => call.kind === "update"),
      false,
    );
    assert.equal(h.audits.length, 0);
  }
});

test("only DRAFT is submittable; repeat and every later or returned state conflict without success audit", async () => {
  for (const status of [
    CourseOutlineStatus.SUBMITTED_BY_TEACHER,
    CourseOutlineStatus.RETURNED_FOR_CORRECTION,
    CourseOutlineStatus.COORDINATOR_REVIEW,
    CourseOutlineStatus.APPROVED,
    CourseOutlineStatus.ACTIVE,
    CourseOutlineStatus.ARCHIVED,
  ]) {
    const h = harness(status);
    assert.deepEqual(
      await h.repository.submitCourseOutlineVersion(submissionInput()),
      { outcome: "OUTLINE_NOT_SUBMITTABLE" },
    );
    assert.equal(
      h.calls.some((call) => call.kind === "update"),
      false,
    );
    assert.equal(h.audits.length, 0);
  }
});

test("malformed DRAFT lifecycle metadata cannot be submitted or audited", async () => {
  for (const [field, value] of [
    ["submittedAt", new Date("2026-08-20T01:00:00.000Z")],
    ["approvedAt", new Date("2026-08-20T02:00:00.000Z")],
    ["activatedAt", new Date("2026-08-20T03:00:00.000Z")],
    ["archivedAt", new Date("2026-08-20T04:00:00.000Z")],
  ] as const) {
    const h = harness(CourseOutlineStatus.DRAFT, {
      outlineOverrides: { [field]: value },
    });
    assert.deepEqual(
      await h.repository.submitCourseOutlineVersion(submissionInput()),
      { outcome: "OUTLINE_NOT_SUBMITTABLE" },
    );
    assert.equal(
      h.calls.some((call) => call.kind === "update"),
      false,
    );
    assert.equal(h.audits.length, 0);
  }
});

test("repeated submission is a conflict and creates no second success audit", async () => {
  const h = harness();
  assert.equal(
    (await h.repository.submitCourseOutlineVersion(submissionInput())).outcome,
    "SUBMITTED",
  );
  assert.deepEqual(
    await h.repository.submitCourseOutlineVersion(submissionInput()),
    { outcome: "OUTLINE_NOT_SUBMITTABLE" },
  );
  assert.equal(h.audits.length, 1);
});

test("conditional mutation miss distinguishes inaccessible target, raced state, and write conflict without audit", async () => {
  for (const [statusAfterMiss, outcome] of [
    [null, "OUTLINE_NOT_FOUND"],
    [CourseOutlineStatus.SUBMITTED_BY_TEACHER, "OUTLINE_NOT_SUBMITTABLE"],
    [CourseOutlineStatus.DRAFT, "VERSION_CONFLICT"],
  ] as const) {
    const h = harness(CourseOutlineStatus.DRAFT, {
      updateCount: 0,
      statusAfterMiss,
    });
    assert.deepEqual(
      await h.repository.submitCourseOutlineVersion(submissionInput()),
      { outcome },
    );
    assert.equal(h.audits.length, 0);
  }
});

test("submission audit uses the assignment-authorized actor and structural metadata only", async () => {
  const h = harness();
  await h.repository.submitCourseOutlineVersion(submissionInput());
  assert.equal(h.audits.length, 1);
  const audit = h.audits[0] as any;
  assert.equal(
    audit.data.action,
    ACADEMIC_AUDIT_EVENTS.COURSE_OUTLINE_SUBMITTED,
  );
  assert.equal(audit.data.actorUserId, "teacher-a");
  assert.equal(audit.data.departmentId, "department-a");
  assert.equal(audit.data.targetType, "course_outline_version");
  assert.equal(audit.data.targetId, "outline-a");
  assert.equal(audit.data.outcome, "SUCCESS");
  assert.equal(audit.data.occurredAt, transitionAt);
  assert.deepEqual(audit.data.contextJson, {
    courseOutlineVersionId: "outline-a",
    courseOfferingId: "offering-a",
    curriculumCourseId: "curriculum-a",
    syllabusVersionId: "syllabus-a",
    versionNumber: 5,
    previousStatus: CourseOutlineStatus.DRAFT,
    newStatus: CourseOutlineStatus.SUBMITTED_BY_TEACHER,
    transitionTimestamp: transitionAt.toISOString(),
  });
  const serialized = JSON.stringify(audit.data.contextJson);
  for (const narrative of [
    "Sensitive narrative summary",
    "Sensitive delivery plan",
    "Sensitive teaching strategies",
    "Sensitive assessment strategy",
    "Sensitive evaluation policy",
    "Sensitive make-up procedure",
  ]) {
    assert.equal(serialized.includes(narrative), false);
  }
});

test("audit failure rolls the transition back", async () => {
  const h = harness(CourseOutlineStatus.DRAFT, {
    auditError: new Error("audit unavailable"),
  });
  await assert.rejects(
    h.repository.submitCourseOutlineVersion(submissionInput()),
    /audit unavailable/,
  );
  assert.equal(h.record().status, CourseOutlineStatus.DRAFT);
  assert.equal(h.record().submittedAt, null);
  assert.equal(h.audits.length, 0);
});
