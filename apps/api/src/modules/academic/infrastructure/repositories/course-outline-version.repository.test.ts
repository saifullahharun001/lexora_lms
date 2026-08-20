import assert from "node:assert/strict";
import test from "node:test";

import { CourseOutlineStatus } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { ACADEMIC_AUDIT_EVENTS } from "../../domain/academic.audit-events";
import { PrismaAcademicRepository } from "./prisma-academic.repository";

const narrativeFields = {
  courseSummary: "Summary",
  deliveryPlan: "Delivery",
  teachingStrategies: "Strategies",
  assessmentStrategy: "Assessment",
  evaluationPolicy: "Evaluation",
  makeUpProcedure: "Make-up",
};

function offering(overrides: Record<string, unknown> = {}) {
  return {
    id: "offering-a",
    departmentId: "department-a",
    courseId: "course-a",
    curriculumCourseId: "curriculum-a",
    syllabusVersionId: "syllabus-a",
    curriculumCourse: {
      id: "curriculum-a",
      departmentId: "department-a",
      courseId: "course-a",
    },
    syllabusVersion: {
      id: "syllabus-a",
      departmentId: "department-a",
      curriculumCourseId: "curriculum-a",
    },
    ...overrides,
  };
}

function outline(
  status: CourseOutlineStatus = CourseOutlineStatus.DRAFT,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "outline-a",
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    curriculumCourseId: "curriculum-a",
    syllabusVersionId: "syllabus-a",
    versionNumber: 5,
    status,
    courseSummary: "Summary",
    deliveryPlan: null,
    teachingStrategies: null,
    assessmentStrategy: null,
    evaluationPolicy: null,
    makeUpProcedure: null,
    submittedAt: null,
    approvedAt: null,
    activatedAt: null,
    archivedAt: null,
    createdAt: new Date("2026-08-20T00:00:00.000Z"),
    updatedAt: new Date("2026-08-20T00:00:00.000Z"),
    ...overrides,
  };
}

function createInput() {
  return {
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    actorUserId: "teacher-a",
    requestId: "request-a",
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
    ...narrativeFields,
  };
}

function uniqueError() {
  return new PrismaClientKnownRequestError("simulated conflict", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: "course_outline_version_dept_offering_number_uq" },
  });
}

function createHarness(
  options: {
    locked?: boolean;
    offering?: ReturnType<typeof offering> | null;
    existingStatuses?: CourseOutlineStatus[];
    maxVersion?: number | null;
    createError?: Error;
    auditError?: Error;
  } = {},
) {
  const calls: Array<{ kind: string; args: unknown }> = [];
  const persisted: unknown[] = [];
  const authoritativeOffering =
    options.offering === undefined ? offering() : options.offering;
  const tx = {
    $queryRaw: async (args: unknown) => {
      calls.push({ kind: "lock", args });
      return options.locked === false ? [] : [{ id: "offering-a" }];
    },
    courseOffering: {
      findFirst: async (args: unknown) => {
        calls.push({ kind: "offering", args });
        return authoritativeOffering;
      },
    },
    courseOutlineVersion: {
      findFirst: async (args: {
        where: { status?: { in?: CourseOutlineStatus[] } };
      }) => {
        calls.push({ kind: "open-version", args });
        const openStatuses = args.where.status?.in ?? [];
        const existingStatus = options.existingStatuses?.find((status) =>
          openStatuses.includes(status),
        );
        return existingStatus ? { id: "outline-existing" } : null;
      },
      aggregate: async (args: unknown) => {
        calls.push({ kind: "aggregate", args });
        return {
          _max: {
            versionNumber:
              options.maxVersion === undefined ? 4 : options.maxVersion,
          },
        };
      },
      create: async (args: { data: Record<string, unknown> }) => {
        calls.push({ kind: "create", args });
        if (options.createError) throw options.createError;
        const record = outline(CourseOutlineStatus.DRAFT, {
          ...args.data,
          id: "outline-created",
        });
        persisted.push(record);
        return record;
      },
    },
    auditLog: {
      create: async (args: unknown) => {
        calls.push({ kind: "audit", args });
        if (options.auditError) throw options.auditError;
        return args;
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      calls.push({ kind: "transaction", args: null });
      const before = persisted.length;
      try {
        return await callback(tx);
      } catch (error) {
        persisted.splice(before);
        throw error;
      }
    },
  };

  return {
    calls,
    persisted,
    repository: new PrismaAcademicRepository(prisma as never),
  };
}

test("assigned Teacher creates an exactly bound server-derived DRAFT and success audit atomically", async () => {
  const h = createHarness();
  const result = await h.repository.createCourseOutlineVersion(createInput());
  assert.equal(result.outcome, "CREATED");
  if (result.outcome !== "CREATED") return;

  const offeringQuery = h.calls.find((call) => call.kind === "offering")!
    .args as { where: Record<string, unknown> };
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
  const lock = h.calls.find((call) => call.kind === "lock")!.args as {
    strings: string[];
    values: unknown[];
  };
  assert.match(lock.strings.join("?"), /teacher_course_assignments/);
  assert.match(lock.strings.join("?"), /teacher_user_id/);
  assert.deepEqual(lock.values, [
    "offering-a",
    "department-a",
    "department-a",
    "teacher-a",
  ]);

  const create = h.calls.find((call) => call.kind === "create")!.args as {
    data: Record<string, unknown>;
  };
  assert.deepEqual(create.data, {
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    curriculumCourseId: "curriculum-a",
    syllabusVersionId: "syllabus-a",
    versionNumber: 5,
    status: CourseOutlineStatus.DRAFT,
    ...narrativeFields,
  });

  const audit = h.calls.find((call) => call.kind === "audit")!.args as {
    data: Record<string, unknown> & { contextJson: Record<string, unknown> };
  };
  assert.equal(audit.data.action, ACADEMIC_AUDIT_EVENTS.COURSE_OUTLINE_CREATED);
  assert.equal(audit.data.targetType, "course_outline_version");
  assert.equal(audit.data.targetId, "outline-created");
  assert.deepEqual(audit.data.contextJson, {
    courseOutlineVersionId: "outline-created",
    courseOfferingId: "offering-a",
    curriculumCourseId: "curriculum-a",
    syllabusVersionId: "syllabus-a",
    versionNumber: 5,
    status: CourseOutlineStatus.DRAFT,
  });
  assert.equal(JSON.stringify(audit.data.contextJson).includes("Summary"), false);
  assert.deepEqual(
    h.calls.map((call) => call.kind),
    [
      "transaction",
      "lock",
      "offering",
      "open-version",
      "aggregate",
      "create",
      "audit",
    ],
  );
});

test("create normalizes omitted narratives to null while deriving identity and version number", async () => {
  const h = createHarness({ maxVersion: null });
  const result = await h.repository.createCourseOutlineVersion({
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    actorUserId: "teacher-a",
  });
  assert.equal(result.outcome, "CREATED");
  const data = (
    h.calls.find((call) => call.kind === "create")!.args as {
      data: Record<string, unknown>;
    }
  ).data;
  assert.equal(data.versionNumber, 1);
  for (const field of Object.keys(narrativeFields)) assert.equal(data[field], null);
});

test("wrong department or inaccessible offering fails safely before dependency, insert, and audit", async () => {
  const h = createHarness({ locked: false });
  assert.deepEqual(await h.repository.createCourseOutlineVersion(createInput()), {
    outcome: "OFFERING_NOT_FOUND",
  });
  assert.deepEqual(h.calls.map((call) => call.kind), ["transaction", "lock"]);
});

test("unassigned, inactive, unassignedAt, and archived assignment protection is exact and fails without success audit", async () => {
  const h = createHarness({ offering: null });
  assert.deepEqual(await h.repository.createCourseOutlineVersion(createInput()), {
    outcome: "OFFERING_NOT_FOUND",
  });
  const query = h.calls.find((call) => call.kind === "offering")!.args as {
    where: {
      teacherAssignments: { some: Record<string, unknown> };
    };
  };
  assert.deepEqual(query.where.teacherAssignments.some, {
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    teacherUserId: "teacher-a",
    status: "ACTIVE",
    unassignedAt: null,
    archivedAt: null,
  });
  assert.equal(h.calls.some((call) => call.kind === "audit"), false);
});

test("curriculum-unbound, syllabus-unbound, and malformed binding chains cannot create or audit", async () => {
  for (const malformed of [
    offering({ curriculumCourseId: null, curriculumCourse: null }),
    offering({ syllabusVersionId: null, syllabusVersion: null }),
    offering({
      syllabusVersion: {
        id: "syllabus-a",
        departmentId: "department-b",
        curriculumCourseId: "curriculum-a",
      },
    }),
  ]) {
    const h = createHarness({ offering: malformed });
    assert.deepEqual(await h.repository.createCourseOutlineVersion(createInput()), {
      outcome: "OFFERING_NOT_FULLY_BOUND",
    });
    assert.equal(h.calls.some((call) => call.kind === "create"), false);
    assert.equal(h.calls.some((call) => call.kind === "audit"), false);
  }
});

test("every in-progress status blocks a new version without insert or success audit", async () => {
  for (const status of [
    CourseOutlineStatus.DRAFT,
    CourseOutlineStatus.SUBMITTED_BY_TEACHER,
    CourseOutlineStatus.COORDINATOR_REVIEW,
    CourseOutlineStatus.RETURNED_FOR_CORRECTION,
  ]) {
    const h = createHarness({ existingStatuses: [status] });
    assert.deepEqual(
      await h.repository.createCourseOutlineVersion(createInput()),
      { outcome: "OPEN_VERSION_ALREADY_EXISTS" },
    );
    const openQuery = h.calls.find((call) => call.kind === "open-version")!
      .args as { where: { status: { in: CourseOutlineStatus[] } } };
    assert.deepEqual(openQuery.where.status.in, [
      CourseOutlineStatus.DRAFT,
      CourseOutlineStatus.SUBMITTED_BY_TEACHER,
      CourseOutlineStatus.COORDINATOR_REVIEW,
      CourseOutlineStatus.RETURNED_FOR_CORRECTION,
    ]);
    assert.equal(h.calls.some((call) => call.kind === "create"), false);
    assert.equal(h.calls.some((call) => call.kind === "audit"), false);
  }
});

test("APPROVED, ACTIVE, and ARCHIVED-only history permits creation of the next server-numbered DRAFT", async () => {
  const h = createHarness({
    existingStatuses: [
      CourseOutlineStatus.APPROVED,
      CourseOutlineStatus.ACTIVE,
      CourseOutlineStatus.ARCHIVED,
    ],
    maxVersion: 3,
  });
  const result = await h.repository.createCourseOutlineVersion(createInput());
  assert.equal(result.outcome, "CREATED");
  if (result.outcome !== "CREATED") return;
  assert.equal(result.courseOutlineVersion.versionNumber, 4);
  assert.equal(result.courseOutlineVersion.status, CourseOutlineStatus.DRAFT);
});

test("generated-version unique conflicts are controlled and never audited", async () => {

  const conflict = createHarness({ createError: uniqueError() });
  assert.deepEqual(
    await conflict.repository.createCourseOutlineVersion(createInput()),
    { outcome: "VERSION_CONFLICT" },
  );
  assert.equal(conflict.calls.some((call) => call.kind === "audit"), false);
});

test("one actor identity drives assignment authorization and audit even if a forged legacy teacher identity is supplied", async () => {
  const h = createHarness();
  const input = {
    ...createInput(),
    actorUserId: "authoritative-actor",
    teacherUserId: "different-audit-or-assignment-user",
  } as never;
  const result = await h.repository.createCourseOutlineVersion(input);
  assert.equal(result.outcome, "CREATED");
  const assignment = h.calls.find((call) => call.kind === "offering")!.args as {
    where: { teacherAssignments: { some: Record<string, unknown> } };
  };
  assert.equal(
    assignment.where.teacherAssignments.some.teacherUserId,
    "authoritative-actor",
  );
  const audit = h.calls.find((call) => call.kind === "audit")!.args as {
    data: { actorUserId: string };
  };
  assert.equal(audit.data.actorUserId, "authoritative-actor");
});

test("audit failure rolls Course Outline creation back", async () => {
  const h = createHarness({ auditError: new Error("audit unavailable") });
  await assert.rejects(
    h.repository.createCourseOutlineVersion(createInput()),
    /audit unavailable/,
  );
  assert.deepEqual(h.persisted, []);
});

test("concurrent creates serialize per offering and cannot silently reuse a generated version or create two drafts", async () => {
  const records: Array<ReturnType<typeof outline>> = [];
  const audits: unknown[] = [];
  let lockTail = Promise.resolve();
  const prisma = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const previous = lockTail;
      let release!: () => void;
      lockTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      const tx = {
        $queryRaw: async () => [{ id: "offering-a" }],
        courseOffering: { findFirst: async () => offering() },
        courseOutlineVersion: {
          findFirst: async (args: {
            where: { status?: { in?: CourseOutlineStatus[] } };
          }) =>
            records.find((record) =>
              args.where.status?.in?.includes(record.status),
            ) ?? null,
          aggregate: async () => ({
            _max: {
              versionNumber:
                records.length === 0
                  ? null
                  : Math.max(...records.map((record) => record.versionNumber)),
            },
          }),
          create: async (args: { data: Record<string, unknown> }) => {
            const record = outline(CourseOutlineStatus.DRAFT, {
              ...args.data,
              id: `outline-${records.length + 1}`,
            });
            records.push(record);
            return record;
          },
        },
        auditLog: { create: async (args: unknown) => audits.push(args) },
      };
      try {
        return await callback(tx);
      } finally {
        release();
      }
    },
  };
  const repository = new PrismaAcademicRepository(prisma as never);
  const results = await Promise.all([
    repository.createCourseOutlineVersion(createInput()),
    repository.createCourseOutlineVersion(createInput()),
  ]);
  assert.deepEqual(
    results.map((result) => result.outcome).sort(),
    ["CREATED", "OPEN_VERSION_ALREADY_EXISTS"],
  );
  assert.equal(records.length, 1);
  assert.equal(records[0]?.versionNumber, 1);
  assert.equal(audits.length, 1);
});

function readHarness(options: { offeringFound?: boolean } = {}) {
  const calls: Array<{ kind: string; args: unknown }> = [];
  const versions = [
    outline(CourseOutlineStatus.APPROVED, { id: "outline-1", versionNumber: 1 }),
    outline(CourseOutlineStatus.ARCHIVED, { id: "outline-2", versionNumber: 2 }),
  ];
  const prisma = {
    courseOffering: {
      findFirst: async (args: unknown) => {
        calls.push({ kind: "offering", args });
        return options.offeringFound === false ? null : { id: "offering-a" };
      },
    },
    courseOutlineVersion: {
      findMany: async (args: unknown) => {
        calls.push({ kind: "list", args });
        return [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
      },
      findFirst: async (args: unknown) => {
        calls.push({ kind: "detail", args });
        return versions[0];
      },
    },
  };
  return { calls, repository: new PrismaAcademicRepository(prisma as never) };
}

test("Teacher list/detail reads require active exact assignment and nested department/offering/version identity", async () => {
  const h = readHarness();
  const list = await h.repository.findCourseOutlineVersionsForTeacher(
    "department-a",
    "offering-a",
    "teacher-a",
  );
  const detail = await h.repository.findCourseOutlineVersionByIdForTeacher(
    "department-a",
    "offering-a",
    "outline-1",
    "teacher-a",
  );
  assert.deepEqual(list?.map((record) => record.versionNumber), [2, 1]);
  assert.equal(detail?.id, "outline-1");
  for (const call of h.calls.filter((entry) => entry.kind === "offering")) {
    const args = call.args as {
      where: { teacherAssignments: { some: Record<string, unknown> } };
    };
    assert.deepEqual(args.where.teacherAssignments.some, {
      departmentId: "department-a",
      courseOfferingId: "offering-a",
      teacherUserId: "teacher-a",
      status: "ACTIVE",
      unassignedAt: null,
      archivedAt: null,
    });
  }
  const detailQuery = h.calls.find((call) => call.kind === "detail")!
    .args as { where: Record<string, unknown> };
  assert.deepEqual(detailQuery.where, {
    id: "outline-1",
    departmentId: "department-a",
    courseOfferingId: "offering-a",
  });
});

test("Department Admin reads are department-scoped and inaccessible offerings return safe null", async () => {
  const admin = readHarness();
  await admin.repository.findCourseOutlineVersions("department-a", "offering-a");
  const offeringQuery = admin.calls[0]!.args as {
    where: Record<string, unknown>;
  };
  assert.equal(offeringQuery.where.departmentId, "department-a");
  assert.equal(offeringQuery.where.teacherAssignments, undefined);

  const hidden = readHarness({ offeringFound: false });
  assert.equal(
    await hidden.repository.findCourseOutlineVersionsForTeacher(
      "department-a",
      "foreign-offering",
      "teacher-a",
    ),
    null,
  );
  assert.equal(
    await hidden.repository.findCourseOutlineVersionByIdForTeacher(
      "department-a",
      "offering-a",
      "foreign-outline-direct-id",
      "teacher-a",
    ),
    null,
  );
  assert.equal(hidden.calls.some((call) => call.kind === "detail"), false);
});

test("Teacher-specific read methods fail closed when actor assignment identity is omitted", async () => {
  const h = readHarness();
  assert.equal(
    await h.repository.findCourseOutlineVersionsForTeacher(
      "department-a",
      "offering-a",
      undefined as never,
    ),
    null,
  );
  assert.equal(
    await h.repository.findCourseOutlineVersionByIdForTeacher(
      "department-a",
      "offering-a",
      "outline-a",
      undefined as never,
    ),
    null,
  );
  assert.deepEqual(h.calls, []);
});

function updateHarness(
  status: CourseOutlineStatus,
  options: {
    offeringFound?: boolean;
    outlineFound?: boolean;
    updateCount?: number;
    statusAfterMiss?: CourseOutlineStatus | null;
    auditError?: Error;
  } = {},
) {
  let record = outline(status);
  const calls: Array<{ kind: string; args: unknown }> = [];
  const tx = {
    courseOffering: {
      findFirst: async (args: unknown) => {
        calls.push({ kind: "offering", args });
        return options.offeringFound === false
          ? null
          : {
              id: "offering-a",
              departmentId: "department-a",
              curriculumCourseId: "curriculum-a",
              syllabusVersionId: "syllabus-a",
            };
      },
    },
    courseOutlineVersion: {
      findFirst: async (args: { select?: Record<string, boolean> }) => {
        calls.push({ kind: "outline", args });
        if (options.outlineFound === false) return null;
        if (args.select && Object.keys(args.select).length === 1 && args.select.status) {
          return options.statusAfterMiss === null
            ? null
            : { status: options.statusAfterMiss ?? record.status };
        }
        return record;
      },
      updateMany: async (args: { data: Record<string, unknown> }) => {
        calls.push({ kind: "update", args });
        const count = options.updateCount ?? 1;
        if (count > 0) record = { ...record, ...args.data, updatedAt: new Date() };
        return { count };
      },
    },
    auditLog: {
      create: async (args: unknown) => {
        calls.push({ kind: "audit", args });
        if (options.auditError) throw options.auditError;
        return args;
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      const before = record;
      try {
        return await callback(tx);
      } catch (error) {
        record = before;
        throw error;
      }
    },
  };
  return {
    calls,
    record: () => record,
    repository: new PrismaAcademicRepository(prisma as never),
  };
}

function updateInput() {
  return {
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    courseOutlineVersionId: "outline-a",
    actorUserId: "teacher-a",
    requestId: "request-a",
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
    courseSummary: "Changed narrative body",
    deliveryPlan: "Changed delivery body",
  };
}

test("Teacher can patch DRAFT and RETURNED_FOR_CORRECTION through a conditional status-qualified mutation", async () => {
  for (const status of [
    CourseOutlineStatus.DRAFT,
    CourseOutlineStatus.RETURNED_FOR_CORRECTION,
  ]) {
    const h = updateHarness(status);
    const result = await h.repository.updateCourseOutlineVersion(updateInput());
    assert.equal(result.outcome, "UPDATED");
    const offeringArgs = h.calls.find((call) => call.kind === "offering")!
      .args as {
      where: { teacherAssignments: { some: Record<string, unknown> } };
    };
    const assignment = offeringArgs.where.teacherAssignments.some;
    assert.deepEqual(assignment, {
      departmentId: "department-a",
      courseOfferingId: "offering-a",
      teacherUserId: "teacher-a",
      status: "ACTIVE",
      unassignedAt: null,
      archivedAt: null,
    });
    const mutation = h.calls.find((call) => call.kind === "update")!.args as {
      where: { status: { in: CourseOutlineStatus[] } };
      data: Record<string, unknown>;
    };
    assert.deepEqual(mutation.where.status.in, [
      CourseOutlineStatus.DRAFT,
      CourseOutlineStatus.RETURNED_FOR_CORRECTION,
    ]);
    assert.deepEqual(mutation.data, {
      courseSummary: "Changed narrative body",
      deliveryPlan: "Changed delivery body",
    });
  }
});

test("direct repository input ignores forged changedFields, lifecycle, version, and academic identity mutation keys", async () => {
  const h = updateHarness(CourseOutlineStatus.DRAFT);
  const before = structuredClone(h.record());
  const result = await h.repository.updateCourseOutlineVersion({
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    courseOutlineVersionId: "outline-a",
    actorUserId: "teacher-a",
    courseSummary: "Allowed narrative change",
    changedFields: [
      "status",
      "versionNumber",
      "departmentId",
      "courseOfferingId",
      "curriculumCourseId",
      "syllabusVersionId",
      "submittedAt",
      "approvedAt",
      "activatedAt",
      "archivedAt",
    ],
    status: CourseOutlineStatus.APPROVED,
    versionNumber: 99,
    curriculumCourseId: "curriculum-forged",
    syllabusVersionId: "syllabus-forged",
    submittedAt: new Date("2026-08-21T00:00:00.000Z"),
    approvedAt: new Date("2026-08-21T00:00:00.000Z"),
    activatedAt: new Date("2026-08-21T00:00:00.000Z"),
    archivedAt: new Date("2026-08-21T00:00:00.000Z"),
  } as never);

  assert.equal(result.outcome, "UPDATED");
  const mutation = h.calls.find((call) => call.kind === "update")!.args as {
    data: Record<string, unknown>;
  };
  assert.deepEqual(mutation.data, {
    courseSummary: "Allowed narrative change",
  });
  assert.equal(h.record().status, CourseOutlineStatus.DRAFT);
  assert.equal(h.record().versionNumber, before.versionNumber);
  assert.equal(h.record().departmentId, before.departmentId);
  assert.equal(h.record().courseOfferingId, before.courseOfferingId);
  assert.equal(h.record().curriculumCourseId, before.curriculumCourseId);
  assert.equal(h.record().syllabusVersionId, before.syllabusVersionId);
  assert.equal(h.record().submittedAt, null);
  assert.equal(h.record().approvedAt, null);
  assert.equal(h.record().activatedAt, null);
  assert.equal(h.record().archivedAt, null);
});

test("submitted, coordinator-review, approved, active, and archived outlines are immutable and unaudited", async () => {
  for (const status of [
    CourseOutlineStatus.SUBMITTED_BY_TEACHER,
    CourseOutlineStatus.COORDINATOR_REVIEW,
    CourseOutlineStatus.APPROVED,
    CourseOutlineStatus.ACTIVE,
    CourseOutlineStatus.ARCHIVED,
  ]) {
    const h = updateHarness(status);
    assert.deepEqual(await h.repository.updateCourseOutlineVersion(updateInput()), {
      outcome: "OUTLINE_NOT_EDITABLE",
    });
    assert.equal(h.calls.some((call) => call.kind === "update"), false);
    assert.equal(h.calls.some((call) => call.kind === "audit"), false);
  }
});

test("conditional update miss safely distinguishes missing, newly non-editable, and concurrency conflict", async () => {
  for (const [statusAfterMiss, outcome] of [
    [null, "OUTLINE_NOT_FOUND"],
    [CourseOutlineStatus.APPROVED, "OUTLINE_NOT_EDITABLE"],
    [CourseOutlineStatus.DRAFT, "VERSION_CONFLICT"],
  ] as const) {
    const h = updateHarness(CourseOutlineStatus.DRAFT, {
      updateCount: 0,
      statusAfterMiss,
    });
    assert.deepEqual(await h.repository.updateCourseOutlineVersion(updateInput()), {
      outcome,
    });
    assert.equal(h.calls.some((call) => call.kind === "audit"), false);
  }
});

test("direct outline ids from another offering/department and inaccessible assignments fail before mutation and audit", async () => {
  for (const options of [
    { offeringFound: false },
    { outlineFound: false },
  ]) {
    const h = updateHarness(CourseOutlineStatus.DRAFT, options);
    const result = await h.repository.updateCourseOutlineVersion(updateInput());
    assert.ok(
      result.outcome === "OFFERING_NOT_FOUND" ||
        result.outcome === "OUTLINE_NOT_FOUND",
    );
    const outlineQuery = h.calls.find((call) => call.kind === "outline")
      ?.args as { where: Record<string, unknown> } | undefined;
    if (outlineQuery) {
      assert.deepEqual(outlineQuery.where, {
        id: "outline-a",
        departmentId: "department-a",
        courseOfferingId: "offering-a",
      });
    }
    assert.equal(h.calls.some((call) => call.kind === "update"), false);
    assert.equal(h.calls.some((call) => call.kind === "audit"), false);
  }
});

test("update audit contains changed field names and structural identity but no narrative bodies", async () => {
  const h = updateHarness(CourseOutlineStatus.DRAFT);
  const result = await h.repository.updateCourseOutlineVersion(updateInput());
  assert.equal(result.outcome, "UPDATED");
  const audit = h.calls.find((call) => call.kind === "audit")!.args as {
    data: {
      action: string;
      targetType: string;
      contextJson: { changedFields: string[] };
    };
  };
  assert.equal(audit.data.action, ACADEMIC_AUDIT_EVENTS.COURSE_OUTLINE_UPDATED);
  assert.equal(audit.data.targetType, "course_outline_version");
  assert.deepEqual(audit.data.contextJson.changedFields, [
    "courseSummary",
    "deliveryPlan",
  ]);
  const serialized = JSON.stringify(audit.data.contextJson);
  assert.equal(serialized.includes("Changed narrative body"), false);
  assert.equal(serialized.includes("Changed delivery body"), false);
});

test("no-op update creates neither mutation nor success audit", async () => {
  const h = updateHarness(CourseOutlineStatus.DRAFT);
  assert.deepEqual(
    await h.repository.updateCourseOutlineVersion({
      ...updateInput(),
      courseSummary: "Summary",
      deliveryPlan: null,
    }),
    { outcome: "NO_CHANGES" },
  );
  assert.equal(h.calls.some((call) => call.kind === "update"), false);
  assert.equal(h.calls.some((call) => call.kind === "audit"), false);
});

test("audit failure rolls Course Outline update back", async () => {
  const h = updateHarness(CourseOutlineStatus.DRAFT, {
    auditError: new Error("audit unavailable"),
  });
  await assert.rejects(
    h.repository.updateCourseOutlineVersion(updateInput()),
    /audit unavailable/,
  );
  assert.equal(h.record().courseSummary, "Summary");
  assert.equal(h.record().deliveryPlan, null);
});
