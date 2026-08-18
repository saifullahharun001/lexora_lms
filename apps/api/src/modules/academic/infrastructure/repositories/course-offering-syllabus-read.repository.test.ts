import assert from "node:assert/strict";
import test from "node:test";

import { AcademicVersionStatus } from "@prisma/client";

import { PrismaAcademicRepository } from "./prisma-academic.repository";

function syllabusRecord(
  status: AcademicVersionStatus = AcademicVersionStatus.RETIRED,
) {
  return {
    id: "syllabus-a",
    departmentId: "department-a",
    curriculumCourseId: "curriculum-a",
    code: "SYL-1",
    versionNumber: 1,
    status,
    effectiveFrom: null,
    effectiveTo: null,
    approvedAt: new Date("2026-08-17T10:00:00.000Z"),
    archivedAt:
      status === AcademicVersionStatus.ARCHIVED
        ? new Date("2026-08-18T10:00:00.000Z")
        : null,
    createdAt: new Date("2026-08-14T10:00:00.000Z"),
    updatedAt: new Date("2026-08-18T10:00:00.000Z"),
    curriculumCourse: {
      id: "curriculum-a",
      departmentId: "department-a",
      curriculumVersionId: "curriculum-version-a",
      courseId: "course-a",
      assessmentTemplateId: "template-a",
      categoryCode: "CORE",
      academicYearNumber: 1,
      semesterNumber: 1,
      courseCodeSnapshot: "LAW101",
      courseTitleSnapshot: "Law",
      creditHoursSnapshot: "3.00",
      totalMarksSnapshot: "100.00",
      course: {
        id: "course-a",
        departmentId: "department-a",
        academicProgramId: "program-a",
        code: "LAW101",
        title: "Law",
      },
      curriculumVersion: {
        id: "curriculum-version-a",
        departmentId: "department-a",
        academicProgramId: "program-a",
        code: "LLB-2026",
        name: "LL.B. 2026",
        status: AcademicVersionStatus.ACTIVE,
        effectiveAcademicSessionCode: "2026-2027",
        academicProgram: { id: "program-a", departmentId: "department-a" },
      },
      assessmentTemplate: {
        id: "template-a",
        departmentId: "department-a",
        academicProgramId: "program-a",
        code: "STANDARD",
        versionNumber: 1,
        name: "Standard",
        status: AcademicVersionStatus.ACTIVE,
        totalMarks: "100.00",
        academicProgram: { id: "program-a", departmentId: "department-a" },
      },
    },
  };
}

function harness(record: ReturnType<typeof syllabusRecord> | null) {
  const offeringQueries: unknown[] = [];
  const syllabusQueries: unknown[] = [];
  const prisma = {
    courseOffering: {
      findFirst: async (args: unknown) => {
        offeringQueries.push(args);
        return record ? { syllabusVersion: record } : null;
      },
    },
    syllabusVersion: {
      findFirst: async (args: unknown) => {
        syllabusQueries.push(args);
        return null;
      },
    },
  };

  return {
    offeringQueries,
    syllabusQueries,
    repository: new PrismaAcademicRepository(prisma as never),
  };
}

test("Teacher bound-syllabus query enforces exact offering and active same-department assignment", async () => {
  const h = harness(syllabusRecord());
  const result =
    await h.repository.findBoundSyllabusVersionForCourseOfferingForTeacher(
      "department-a",
      "offering-a",
      "teacher-a",
    );
  const query = h.offeringQueries[0] as {
    where: Record<string, unknown> & {
      teacherAssignments: { some: Record<string, unknown> };
    };
    select: { syllabusVersion: { select: Record<string, unknown> } };
  };

  assert.equal(query.where.id, "offering-a");
  assert.equal(query.where.departmentId, "department-a");
  assert.equal(query.where.archivedAt, null);
  assert.deepEqual(query.where.syllabusVersionId, { not: null });
  assert.deepEqual(query.where.syllabusVersion, { isNot: null });
  assert.deepEqual(query.where.teacherAssignments.some, {
    departmentId: "department-a",
    teacherUserId: "teacher-a",
    status: "ACTIVE",
    unassignedAt: null,
    archivedAt: null,
  });
  assert.equal(query.select.syllabusVersion.select.id, true);
  assert.equal(query.select.syllabusVersion.select.departmentId, true);
  assert.ok("curriculumCourse" in query.select.syllabusVersion.select);
  assert.equal("status" in query.where, false);
  assert.deepEqual(result, {
    id: "syllabus-a",
    code: "SYL-1",
    versionNumber: 1,
    status: AcademicVersionStatus.RETIRED,
    effectiveFrom: null,
    effectiveTo: null,
    approvedAt: new Date("2026-08-17T10:00:00.000Z"),
    archivedAt: null,
    createdAt: new Date("2026-08-14T10:00:00.000Z"),
    updatedAt: new Date("2026-08-18T10:00:00.000Z"),
    curriculumCourse: {
      id: "curriculum-a",
      categoryCode: "CORE",
      academicYearNumber: 1,
      semesterNumber: 1,
      courseCodeSnapshot: "LAW101",
      courseTitleSnapshot: "Law",
      creditHoursSnapshot: "3.00",
      totalMarksSnapshot: "100.00",
      course: { id: "course-a", code: "LAW101", title: "Law" },
      curriculumVersion: {
        id: "curriculum-version-a",
        code: "LLB-2026",
        name: "LL.B. 2026",
        status: AcademicVersionStatus.ACTIVE,
        effectiveAcademicSessionCode: "2026-2027",
      },
      assessmentTemplate: {
        id: "template-a",
        code: "STANDARD",
        versionNumber: 1,
        name: "Standard",
        status: AcademicVersionStatus.ACTIVE,
        totalMarks: "100.00",
      },
    },
  });
});

test("department-scoped query has no Teacher assignment clause and reuses generic safe select", async () => {
  const h = harness(syllabusRecord());
  await h.repository.findBoundSyllabusVersionForCourseOffering(
    "department-a",
    "offering-a",
  );
  await h.repository.findSyllabusVersionById("department-a", "syllabus-a");
  const offeringQuery = h.offeringQueries[0] as {
    where: Record<string, unknown>;
    select: { syllabusVersion: { select: unknown } };
  };
  const genericQuery = h.syllabusQueries[0] as { select: unknown };

  assert.deepEqual(offeringQuery.where, {
    id: "offering-a",
    departmentId: "department-a",
    archivedAt: null,
    syllabusVersionId: { not: null },
    syllabusVersion: { isNot: null },
  });
  assert.equal("teacherAssignments" in offeringQuery.where, false);
  assert.equal("status" in offeringQuery.where, false);
  assert.deepEqual(
    offeringQuery.select.syllabusVersion.select,
    genericQuery.select,
  );
});

test("unbound or inaccessible CourseOffering returns null without fallback", async () => {
  const h = harness(null);

  assert.equal(
    await h.repository.findBoundSyllabusVersionForCourseOffering(
      "department-a",
      "offering-a",
    ),
    null,
  );
  assert.equal(h.offeringQueries.length, 1);
  assert.equal(h.syllabusQueries.length, 0);
});

test("malformed cross-department syllabus dependency is rejected by existing sanitization", async () => {
  const malformed = syllabusRecord();
  malformed.curriculumCourse.course.departmentId = "department-b";
  const h = harness(malformed);

  assert.equal(
    await h.repository.findBoundSyllabusVersionForCourseOffering(
      "department-a",
      "offering-a",
    ),
    null,
  );
});

test("exact RETIRED and ARCHIVED bindings remain readable without syllabus status filtering", async () => {
  for (const status of [
    AcademicVersionStatus.RETIRED,
    AcademicVersionStatus.ARCHIVED,
  ]) {
    const h = harness(syllabusRecord(status));
    const result = await h.repository.findBoundSyllabusVersionForCourseOffering(
      "department-a",
      "offering-a",
    );
    const where = (h.offeringQueries[0] as { where: Record<string, unknown> })
      .where;

    assert.equal((result as { status: AcademicVersionStatus }).status, status);
    assert.equal("status" in where, false);
    assert.deepEqual(where.syllabusVersion, { isNot: null });
  }
});
