import assert from "node:assert/strict";
import test from "node:test";

import { AcademicVersionStatus } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { ACADEMIC_AUDIT_EVENTS } from "../../domain/academic.audit-events";
import { PrismaAcademicRepository } from "./prisma-academic.repository";

function curriculumCourse(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

function syllabusRecord(
  parent = curriculumCourse(),
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "syllabus-a",
    departmentId: "department-a",
    curriculumCourseId: parent.id,
    code: "SYL-1",
    versionNumber: 1,
    status: AcademicVersionStatus.DRAFT,
    effectiveFrom: null,
    effectiveTo: null,
    approvedAt: null,
    archivedAt: null,
    createdAt: new Date("2026-08-14T10:00:00.000Z"),
    updatedAt: new Date("2026-08-14T10:00:00.000Z"),
    curriculumCourse: parent,
    ...overrides,
  };
}

function createInput() {
  return {
    departmentId: "department-a",
    curriculumCourseId: "curriculum-course-a",
    code: "SYL-1",
    versionNumber: 1,
    actorUserId: "admin-a",
    requestId: "request-a",
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
  };
}

function harness(
  options: {
    parent?: ReturnType<typeof curriculumCourse> | null;
    records?: Array<ReturnType<typeof syllabusRecord>>;
    createError?: Error;
  } = {},
) {
  const parent =
    options.parent === undefined ? curriculumCourse() : options.parent;
  const records = options.records ?? [];
  const calls: Array<{ kind: string; value: unknown }> = [];
  const prisma = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        curriculumCourse: {
          findFirst: async (args: {
            where: { id: string; departmentId: string };
          }) => {
            calls.push({ kind: "parent-read", value: args });
            return parent &&
              parent.id === args.where.id &&
              parent.departmentId === args.where.departmentId
              ? parent
              : null;
          },
        },
        syllabusVersion: {
          create: async (args: { data: Record<string, unknown> }) => {
            calls.push({ kind: "create", value: args });
            if (options.createError) throw options.createError;
            return syllabusRecord(parent!, {
              ...args.data,
              id: "syllabus-created",
            });
          },
        },
        auditLog: {
          create: async (args: unknown) => {
            calls.push({ kind: "audit", value: args });
            return args;
          },
        },
      }),
    syllabusVersion: {
      findMany: async (args: {
        where: {
          departmentId: string;
          curriculumCourseId?: string;
          status?: AcademicVersionStatus;
        };
      }) => {
        calls.push({ kind: "list", value: args });
        return records.filter(
          (record) =>
            record.departmentId === args.where.departmentId &&
            (!args.where.curriculumCourseId ||
              record.curriculumCourseId === args.where.curriculumCourseId) &&
            (!args.where.status || record.status === args.where.status),
        );
      },
      findFirst: async (args: {
        where: { id: string; departmentId: string };
      }) => {
        calls.push({ kind: "detail", value: args });
        return (
          records.find(
            (record) =>
              record.id === args.where.id &&
              record.departmentId === args.where.departmentId,
          ) ?? null
        );
      },
    },
  };

  return {
    calls,
    repository: new PrismaAcademicRepository(prisma as never),
  };
}

test("valid same-department creation is forced to DRAFT and audited transactionally", async () => {
  const h = harness();
  const result = await h.repository.createSyllabusVersion(createInput());

  assert.equal(result.outcome, "CREATED");
  if (result.outcome !== "CREATED") return;
  assert.deepEqual(
    {
      id: (result.syllabusVersion as { id: string }).id,
      status: (result.syllabusVersion as { status: string }).status,
      approvedAt: (result.syllabusVersion as { approvedAt: Date | null })
        .approvedAt,
      archivedAt: (result.syllabusVersion as { archivedAt: Date | null })
        .archivedAt,
    },
    {
      id: "syllabus-created",
      status: AcademicVersionStatus.DRAFT,
      approvedAt: null,
      archivedAt: null,
    },
  );

  const parentRead = h.calls.find((call) => call.kind === "parent-read")!
    .value as { where: Record<string, unknown> };
  assert.deepEqual(parentRead.where, {
    id: "curriculum-course-a",
    departmentId: "department-a",
  });

  const create = h.calls.find((call) => call.kind === "create")!.value as {
    data: Record<string, unknown>;
  };
  assert.equal(create.data.departmentId, "department-a");
  assert.equal(create.data.status, AcademicVersionStatus.DRAFT);
  assert.equal(create.data.approvedAt, null);
  assert.equal(create.data.archivedAt, null);

  const audit = h.calls.find((call) => call.kind === "audit")!.value as {
    data: Record<string, unknown> & { contextJson: Record<string, unknown> };
  };
  assert.equal(
    audit.data.action,
    ACADEMIC_AUDIT_EVENTS.SYLLABUS_VERSION_CREATED,
  );
  assert.equal(audit.data.actorUserId, "admin-a");
  assert.equal(audit.data.departmentId, "department-a");
  assert.equal(audit.data.targetType, "syllabus_version");
  assert.equal(audit.data.targetId, "syllabus-created");
  assert.equal(audit.data.requestId, "request-a");
  assert.equal(audit.data.ipAddress, "127.0.0.1");
  assert.equal(audit.data.userAgent, "test-agent");
  assert.deepEqual(audit.data.contextJson, {
    syllabusVersionId: "syllabus-created",
    curriculumCourseId: "curriculum-course-a",
    code: "SYL-1",
    versionNumber: 1,
    status: AcademicVersionStatus.DRAFT,
  });
});

test("wrong-department parent is safe not-found without create or audit", async () => {
  const h = harness({
    parent: curriculumCourse({ departmentId: "department-b" }),
  });
  assert.deepEqual(await h.repository.createSyllabusVersion(createInput()), {
    outcome: "CURRICULUM_COURSE_NOT_FOUND",
  });
  assert.equal(
    h.calls.some((call) => call.kind === "create"),
    false,
  );
  assert.equal(
    h.calls.some((call) => call.kind === "audit"),
    false,
  );
});

test("malformed cross-department dependency chain fails closed", async () => {
  const parent = curriculumCourse();
  parent.curriculumVersion.academicProgram.departmentId = "department-b";
  const h = harness({ parent });

  assert.deepEqual(await h.repository.createSyllabusVersion(createInput()), {
    outcome: "DEPENDENCY_SCOPE_MISMATCH",
  });
  assert.equal(
    h.calls.some((call) => call.kind === "create"),
    false,
  );
  assert.equal(
    h.calls.some((call) => call.kind === "audit"),
    false,
  );
});

function uniqueError(target: string) {
  return new PrismaClientKnownRequestError("simulated unique conflict", {
    code: "P2002",
    clientVersion: "test",
    meta: { target },
  });
}

test("scoped duplicate code and version number map to explicit outcomes", async () => {
  for (const [target, outcome] of [
    ["syllabus_version_dept_curriculum_course_code_uq", "DUPLICATE_CODE"],
    [
      "syllabus_version_dept_curriculum_course_number_uq",
      "DUPLICATE_VERSION_NUMBER",
    ],
  ] as const) {
    const h = harness({ createError: uniqueError(target) });
    assert.deepEqual(await h.repository.createSyllabusVersion(createInput()), {
      outcome,
    });
    assert.equal(
      h.calls.some((call) => call.kind === "audit"),
      false,
    );
  }
});

test("list includes historical versions but only within the requested department", async () => {
  const parent = curriculumCourse();
  const records = [
    syllabusRecord(parent),
    syllabusRecord(parent, {
      id: "syllabus-archived",
      code: "SYL-OLD",
      versionNumber: 2,
      status: AcademicVersionStatus.ARCHIVED,
      approvedAt: new Date("2025-01-01T00:00:00.000Z"),
      archivedAt: new Date("2026-01-01T00:00:00.000Z"),
    }),
    syllabusRecord(
      curriculumCourse({
        id: "curriculum-course-b",
        departmentId: "department-b",
      }),
      {
        id: "syllabus-b",
        departmentId: "department-b",
        curriculumCourseId: "curriculum-course-b",
      },
    ),
  ];
  const h = harness({ records });

  const result = await h.repository.findSyllabusVersions({
    departmentId: "department-a",
  });
  assert.deepEqual(
    result.map((record) => (record as { id: string }).id),
    ["syllabus-a", "syllabus-archived"],
  );
  const query = h.calls.find((call) => call.kind === "list")!.value as {
    where: Record<string, unknown>;
  };
  assert.equal(query.where.departmentId, "department-a");
  assert.equal("archivedAt" in query.where, false);
});

test("direct object reads use department scope and hide foreign or malformed records", async () => {
  const sameDepartment = syllabusRecord();
  const foreign = syllabusRecord(
    curriculumCourse({
      id: "curriculum-course-b",
      departmentId: "department-b",
    }),
    {
      id: "syllabus-b",
      departmentId: "department-b",
      curriculumCourseId: "curriculum-course-b",
    },
  );
  const malformedParent = curriculumCourse();
  malformedParent.course.departmentId = "department-b";
  const malformed = syllabusRecord(malformedParent, {
    id: "syllabus-malformed",
  });
  const h = harness({ records: [sameDepartment, foreign, malformed] });

  assert.equal(
    (await h.repository.findSyllabusVersionById("department-a", "syllabus-a"))
      ?.id,
    "syllabus-a",
  );
  assert.equal(
    await h.repository.findSyllabusVersionById("department-a", "syllabus-b"),
    null,
  );
  assert.equal(
    await h.repository.findSyllabusVersionById(
      "department-a",
      "syllabus-malformed",
    ),
    null,
  );
});
