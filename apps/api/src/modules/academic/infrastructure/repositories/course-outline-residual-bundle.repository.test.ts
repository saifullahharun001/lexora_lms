import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { CourseOutlineStatus } from "@prisma/client";

import { PrismaAcademicRepository } from "./prisma-academic.repository";

function version(
  id: string,
  versionNumber: number,
  status: CourseOutlineStatus,
) {
  return {
    id,
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    curriculumCourseId: "curriculum-a",
    syllabusVersionId: "syllabus-a",
    versionNumber,
    status,
    courseSummary: null,
    deliveryPlan: null,
    teachingStrategies: null,
    assessmentStrategy: null,
    evaluationPolicy: null,
    makeUpProcedure: null,
    submittedAt: null,
    approvedAt: null,
    activatedAt: null,
    archivedAt: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  };
}

function harness(offering: {
  activeCourseOutlineVersionId: string | null;
  courseOutlineVersions: ReturnType<typeof version>[];
} | null) {
  const calls: unknown[] = [];
  const prisma = {
    courseOffering: {
      findFirst: async (input: unknown) => {
        calls.push(input);
        return offering;
      },
    },
  };
  return {
    calls,
    repository: new PrismaAcademicRepository(prisma as never),
  };
}

test("state derives active only from an exact ACTIVE pointer and preserves descending order", async () => {
  const versions = [
    version("open", 3, CourseOutlineStatus.DRAFT),
    version("active", 2, CourseOutlineStatus.ACTIVE),
    version("old", 1, CourseOutlineStatus.ARCHIVED),
  ];
  const h = harness({
    activeCourseOutlineVersionId: "active",
    courseOutlineVersions: versions,
  });
  const result = await h.repository.getCourseOutlineState({
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    access: { kind: "DEPARTMENT_ADMIN" },
  });
  assert.equal(result.outcome, "FOUND");
  if (result.outcome !== "FOUND") return;
  assert.equal(result.state.activeVersion?.id, "active");
  assert.equal(result.state.openVersion?.id, "open");
  assert.equal(result.state.latestVersionNumber, 3);
  assert.deepEqual(result.state.versions, versions);
  assert.deepEqual(
    (h.calls[0] as { select: { courseOutlineVersions: { orderBy: unknown } } })
      .select.courseOutlineVersions.orderBy,
    { versionNumber: "desc" },
  );
});

test("all and only the four open statuses are selected", async () => {
  for (const status of [
    CourseOutlineStatus.DRAFT,
    CourseOutlineStatus.SUBMITTED_BY_TEACHER,
    CourseOutlineStatus.COORDINATOR_REVIEW,
    CourseOutlineStatus.RETURNED_FOR_CORRECTION,
  ]) {
    const h = harness({
      activeCourseOutlineVersionId: null,
      courseOutlineVersions: [version("open", 1, status)],
    });
    const result = await h.repository.getCourseOutlineState({
      departmentId: "department-a",
      courseOfferingId: "offering-a",
      access: { kind: "DEPARTMENT_ADMIN" },
    });
    assert.equal(result.outcome, "FOUND");
    if (result.outcome === "FOUND") {
      assert.equal(result.state.openVersion?.status, status);
    }
  }

  for (const status of [
    CourseOutlineStatus.APPROVED,
    CourseOutlineStatus.ARCHIVED,
  ]) {
    const h = harness({
      activeCourseOutlineVersionId: null,
      courseOutlineVersions: [version("closed", 1, status)],
    });
    const result = await h.repository.getCourseOutlineState({
      departmentId: "department-a",
      courseOfferingId: "offering-a",
      access: { kind: "DEPARTMENT_ADMIN" },
    });
    assert.equal(result.outcome, "FOUND");
    if (result.outcome === "FOUND") {
      assert.equal(result.state.openVersion, null);
    }
  }
});

test("no versions yields null active/open/latest state", async () => {
  const h = harness({
    activeCourseOutlineVersionId: null,
    courseOutlineVersions: [],
  });
  const result = await h.repository.getCourseOutlineState({
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    access: { kind: "DEPARTMENT_ADMIN" },
  });
  assert.deepEqual(result, {
    outcome: "FOUND",
    state: {
      activeVersion: null,
      openVersion: null,
      latestVersionNumber: null,
      versions: [],
    },
  });
});

test("pointer-only ACTIVE history returns the pointed version without inference", async () => {
  const active = version("active", 1, CourseOutlineStatus.ACTIVE);
  const h = harness({
    activeCourseOutlineVersionId: active.id,
    courseOutlineVersions: [active],
  });
  const result = await h.repository.getCourseOutlineState({
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    access: { kind: "DEPARTMENT_ADMIN" },
  });
  assert.equal(result.outcome, "FOUND");
  if (result.outcome === "FOUND") {
    assert.equal(result.state.activeVersion?.id, active.id);
    assert.equal(result.state.openVersion, null);
  }
});

test("null pointer with ACTIVE row is an integrity conflict", async () => {
  const h = harness({
    activeCourseOutlineVersionId: null,
    courseOutlineVersions: [
      version("active", 1, CourseOutlineStatus.ACTIVE),
    ],
  });
  assert.deepEqual(
    await h.repository.getCourseOutlineState({
      departmentId: "department-a",
      courseOfferingId: "offering-a",
      access: { kind: "DEPARTMENT_ADMIN" },
    }),
    { outcome: "INTEGRITY_CONFLICT" },
  );
});

test("missing, non-ACTIVE, or mismatched pointer targets fail closed", async () => {
  for (const courseOutlineVersions of [
    [version("other", 1, CourseOutlineStatus.ARCHIVED)],
    [version("pointer", 1, CourseOutlineStatus.APPROVED)],
    [
      version("pointer", 2, CourseOutlineStatus.ARCHIVED),
      version("other-active", 1, CourseOutlineStatus.ACTIVE),
    ],
  ]) {
    const h = harness({
      activeCourseOutlineVersionId: "pointer",
      courseOutlineVersions,
    });
    assert.deepEqual(
      await h.repository.getCourseOutlineState({
        departmentId: "department-a",
        courseOfferingId: "offering-a",
        access: { kind: "DEPARTMENT_ADMIN" },
      }),
      { outcome: "INTEGRITY_CONFLICT" },
    );
  }
});

test("multiple ACTIVE or multiple open rows fail closed", async () => {
  for (const courseOutlineVersions of [
    [
      version("active-a", 2, CourseOutlineStatus.ACTIVE),
      version("active-b", 1, CourseOutlineStatus.ACTIVE),
    ],
    [
      version("draft", 2, CourseOutlineStatus.DRAFT),
      version("returned", 1, CourseOutlineStatus.RETURNED_FOR_CORRECTION),
    ],
  ]) {
    const h = harness({
      activeCourseOutlineVersionId:
        courseOutlineVersions[0]!.status === CourseOutlineStatus.ACTIVE
          ? "active-a"
          : null,
      courseOutlineVersions,
    });
    assert.deepEqual(
      await h.repository.getCourseOutlineState({
        departmentId: "department-a",
        courseOfferingId: "offering-a",
        access: { kind: "DEPARTMENT_ADMIN" },
      }),
      { outcome: "INTEGRITY_CONFLICT" },
    );
  }
});

test("Teacher state lookup embeds exact active assignment and department scope", async () => {
  const h = harness({
    activeCourseOutlineVersionId: null,
    courseOutlineVersions: [],
  });
  await h.repository.getCourseOutlineState({
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    access: { kind: "ASSIGNED_TEACHER", actorUserId: "teacher-a" },
  });
  assert.deepEqual(
    (h.calls[0] as {
      where: { teacherAssignments: { some: unknown } };
    }).where.teacherAssignments.some,
    {
      departmentId: "department-a",
      courseOfferingId: "offering-a",
      teacherUserId: "teacher-a",
      status: "ACTIVE",
      unassignedAt: null,
      archivedAt: null,
    },
  );
});

test("inaccessible assignment, department, or offering returns safe not-found", async () => {
  const h = harness(null);
  assert.deepEqual(
    await h.repository.getCourseOutlineState({
      departmentId: "department-a",
      courseOfferingId: "cross-department-id",
      access: { kind: "ASSIGNED_TEACHER", actorUserId: "teacher-a" },
    }),
    { outcome: "NOT_FOUND" },
  );
});

test("schema and migration enforce parent identity, template identity, checks, and RESTRICT without a batch snapshot", () => {
  const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
  const migration = readFileSync(
    join(
      process.cwd(),
      "prisma",
      "migrations",
      "202609050001_add_course_outline_structured_content",
      "migration.sql",
    ),
    "utf8",
  );
  for (const model of [
    "CourseOutlineTopicPlan",
    "CourseOutlineTopicCloMapping",
    "CourseOutlineSupplementalResource",
    "CourseOutlineAssessmentScheduleItem",
  ]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }
  assert.match(schema, /course_outline_version_full_identity_uq/);
  assert.match(schema, /course_outline_assessment_schedule_course_template_fkey/);
  assert.doesNotMatch(
    schema.slice(schema.indexOf("model CourseOutlineTopicPlan")),
    /studentBatchId/,
  );
  assert.match(migration, /CHECK \("display_order" > 0\)/);
  assert.match(
    migration,
    /CHECK \("planned_week_number" IS NULL OR "planned_week_number" > 0\)/,
  );
  assert.equal(
    (migration.match(/ON DELETE RESTRICT ON UPDATE RESTRICT/g) ?? []).length,
    8,
  );
  assert.doesNotMatch(
    migration,
    /^\s*(?:UPDATE|DELETE FROM|INSERT INTO)\b/im,
  );
  assert.doesNotMatch(migration, /planned_week_number" <= 14/);
});

test("schema and migration contain the four child-side FK indexes in exact column order", () => {
  const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
  const migration = readFileSync(
    join(
      process.cwd(),
      "prisma",
      "migrations",
      "202609050001_add_course_outline_structured_content",
      "migration.sql",
    ),
    "utf8",
  );
  const indexes = [
    {
      name: "course_outline_topic_plan_topic_identity_idx",
      prismaFields:
        "syllabusContentTopicId, departmentId, syllabusVersionId, curriculumCourseId",
      table: "course_outline_topic_plans",
      columns: [
        "syllabus_content_topic_id",
        "department_id",
        "syllabus_version_id",
        "curriculum_course_id",
      ],
    },
    {
      name: "course_outline_topic_clo_mapping_clo_identity_idx",
      prismaFields:
        "courseLearningOutcomeId, departmentId, curriculumVersionId, curriculumCourseId",
      table: "course_outline_topic_clo_mappings",
      columns: [
        "course_learning_outcome_id",
        "department_id",
        "curriculum_version_id",
        "curriculum_course_id",
      ],
    },
    {
      name: "course_outline_assessment_schedule_course_template_idx",
      prismaFields:
        "curriculumCourseId, departmentId, assessmentTemplateId",
      table: "course_outline_assessment_schedule_items",
      columns: [
        "curriculum_course_id",
        "department_id",
        "assessment_template_id",
      ],
    },
    {
      name: "course_outline_assessment_schedule_component_identity_idx",
      prismaFields:
        "assessmentTemplateComponentId, departmentId, assessmentTemplateId",
      table: "course_outline_assessment_schedule_items",
      columns: [
        "assessment_template_component_id",
        "department_id",
        "assessment_template_id",
      ],
    },
  ] as const;

  for (const index of indexes) {
    const schemaPattern = new RegExp(
      `@@index\\(\\[${index.prismaFields}\\], map: "${index.name}"\\)`,
      "g",
    );
    assert.equal((schema.match(schemaPattern) ?? []).length, 1);

    const orderedColumns = index.columns
      .map((column) => `"${column}"`)
      .join("\\s*,\\s*");
    const migrationPattern = new RegExp(
      `CREATE INDEX "${index.name}"\\s+ON "${index.table}"\\(\\s*${orderedColumns}\\s*\\)`,
      "g",
    );
    assert.equal((migration.match(migrationPattern) ?? []).length, 1);
  }
});
