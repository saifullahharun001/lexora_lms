import assert from "node:assert/strict";
import test from "node:test";

import { AcademicVersionStatus } from "@prisma/client";

import { PrismaAcademicRepository } from "./prisma-academic.repository";

function learningOutcomesRecord(
  status: AcademicVersionStatus = AcademicVersionStatus.ACTIVE,
) {
  const approvedAt =
    status === AcademicVersionStatus.DRAFT
      ? null
      : new Date("2026-08-17T10:00:00.000Z");
  const archivedAt =
    status === AcademicVersionStatus.ARCHIVED
      ? new Date("2026-08-18T10:00:00.000Z")
      : null;

  return {
    id: "offering-a",
    departmentId: "department-a",
    courseId: "course-a",
    curriculumCourseId: "curriculum-course-a",
    course: {
      id: "course-a",
      departmentId: "department-a",
      academicProgramId: "program-a",
    },
    curriculumCourse: {
      id: "curriculum-course-a",
      departmentId: "department-a",
      curriculumVersionId: "curriculum-version-a",
      courseId: "course-a",
      courseCodeSnapshot: "LAW101",
      courseTitleSnapshot: "Law",
      course: {
        id: "course-a",
        departmentId: "department-a",
        academicProgramId: "program-a",
      },
      curriculumVersion: {
        id: "curriculum-version-a",
        departmentId: "department-a",
        academicProgramId: "program-a",
        code: "LLB-2026",
        name: "LL.B. 2026",
        status,
        effectiveAcademicSessionCode: "2026-2027",
        approvedAt,
        archivedAt,
        academicProgram: { id: "program-a", departmentId: "department-a" },
      },
      learningOutcomes: [
        {
          id: "clo-b",
          departmentId: "department-a",
          curriculumVersionId: "curriculum-version-a",
          curriculumCourseId: "curriculum-course-a",
          code: "CLO-2",
          statement: "Apply legal rules",
          displayOrder: 2,
          ploMappings: [
            {
              departmentId: "department-a",
              curriculumVersionId: "curriculum-version-a",
              courseLearningOutcomeId: "clo-b",
              programLearningOutcomeId: "plo-b",
              programLearningOutcome: {
                id: "plo-b",
                departmentId: "department-a",
                curriculumVersionId: "curriculum-version-a",
                code: "PLO-2",
                statement: "Apply legal knowledge",
                displayOrder: 2,
              },
            },
            {
              departmentId: "department-a",
              curriculumVersionId: "curriculum-version-a",
              courseLearningOutcomeId: "clo-b",
              programLearningOutcomeId: "plo-a",
              programLearningOutcome: {
                id: "plo-a",
                departmentId: "department-a",
                curriculumVersionId: "curriculum-version-a",
                code: "PLO-1",
                statement: "Explain legal principles",
                displayOrder: 1,
              },
            },
          ],
        },
        {
          id: "clo-a",
          departmentId: "department-a",
          curriculumVersionId: "curriculum-version-a",
          curriculumCourseId: "curriculum-course-a",
          code: "CLO-1",
          statement: "Explain legal rules",
          displayOrder: 1,
          ploMappings: [],
        },
      ],
    },
  };
}

function harness(record: unknown | null) {
  const offeringQueries: unknown[] = [];
  const fallbackQueries: string[] = [];
  const prisma = {
    courseOffering: {
      findFirst: async (args: unknown) => {
        offeringQueries.push(args);
        return record;
      },
    },
    courseLearningOutcome: {
      findMany: async () => {
        fallbackQueries.push("course-learning-outcome");
        return [];
      },
    },
    programLearningOutcome: {
      findMany: async () => {
        fallbackQueries.push("program-learning-outcome");
        return [];
      },
    },
    curriculumCourse: {
      findFirst: async () => {
        fallbackQueries.push("curriculum-course");
        return null;
      },
    },
    curriculumVersion: {
      findFirst: async () => {
        fallbackQueries.push("curriculum-version");
        return null;
      },
    },
  };

  return {
    offeringQueries,
    fallbackQueries,
    repository: new PrismaAcademicRepository(prisma as never),
  };
}

test("Teacher query enforces exact offering, department, curriculum, readable version, and active assignment", async () => {
  const h = harness(learningOutcomesRecord());
  await h.repository.findApprovedLearningOutcomesForCourseOfferingForTeacher(
    "department-a",
    "offering-a",
    "teacher-a",
  );
  const query = h.offeringQueries[0] as {
    where: Record<string, unknown> & {
      curriculumCourse: { is: Record<string, unknown> };
      teacherAssignments: { some: Record<string, unknown> };
    };
    select: Record<string, unknown>;
  };

  assert.equal(query.where.id, "offering-a");
  assert.equal(query.where.departmentId, "department-a");
  assert.equal(query.where.archivedAt, null);
  assert.deepEqual(query.where.curriculumCourseId, { not: null });
  assert.deepEqual(query.where.teacherAssignments.some, {
    departmentId: "department-a",
    teacherUserId: "teacher-a",
    status: "ACTIVE",
    unassignedAt: null,
    archivedAt: null,
  });
  assert.equal(query.where.curriculumCourse.is.departmentId, "department-a");
  assert.deepEqual(query.where.curriculumCourse.is.curriculumVersion, {
    is: {
      departmentId: "department-a",
      status: {
        in: ["APPROVED", "ACTIVE", "RETIRED", "ARCHIVED"],
      },
    },
  });
  assert.ok("curriculumCourse" in query.select);
  assert.equal("syllabusVersionId" in query.where, false);
});

test("Department Admin query omits Teacher assignment and keeps exact object scope", async () => {
  const h = harness(learningOutcomesRecord());
  await h.repository.findApprovedLearningOutcomesForCourseOffering(
    "department-a",
    "offering-a",
  );
  const query = h.offeringQueries[0] as { where: Record<string, unknown> };

  assert.equal(query.where.id, "offering-a");
  assert.equal(query.where.departmentId, "department-a");
  assert.equal(query.where.archivedAt, null);
  assert.deepEqual(query.where.curriculumCourseId, { not: null });
  assert.ok("curriculumCourse" in query.where);
  assert.equal("teacherAssignments" in query.where, false);
  assert.equal("syllabusVersionId" in query.where, false);
});

test("APPROVED, ACTIVE, RETIRED, and valid ARCHIVED curriculum outcomes are readable", async () => {
  for (const status of [
    AcademicVersionStatus.APPROVED,
    AcademicVersionStatus.ACTIVE,
    AcademicVersionStatus.RETIRED,
    AcademicVersionStatus.ARCHIVED,
  ]) {
    const h = harness(learningOutcomesRecord(status));
    const result =
      await h.repository.findApprovedLearningOutcomesForCourseOffering(
        "department-a",
        "offering-a",
      );

    assert.equal(result?.curriculumCourse.curriculumVersion.status, status);
  }
});

test("DRAFT curriculum outcomes fail closed", async () => {
  const h = harness(learningOutcomesRecord(AcademicVersionStatus.DRAFT));

  assert.equal(
    await h.repository.findApprovedLearningOutcomesForCourseOffering(
      "department-a",
      "offering-a",
    ),
    null,
  );
});

test("malformed and unknown curriculum lifecycle states fail closed", async (t) => {
  const records = [
    learningOutcomesRecord(AcademicVersionStatus.APPROVED),
    learningOutcomesRecord(AcademicVersionStatus.ARCHIVED),
    learningOutcomesRecord(AcademicVersionStatus.ACTIVE),
  ];
  records.at(0)!.curriculumCourse.curriculumVersion.approvedAt = null;
  records.at(1)!.curriculumCourse.curriculumVersion.archivedAt = null;
  records.at(2)!.curriculumCourse.curriculumVersion.status =
    "UNKNOWN" as AcademicVersionStatus;

  for (const [index, record] of records.entries()) {
    await t.test(`malformed-${index}`, async () => {
      const h = harness(record);
      assert.equal(
        await h.repository.findApprovedLearningOutcomesForCourseOffering(
          "department-a",
          "offering-a",
        ),
        null,
      );
    });
  }
});

test("curriculum-unbound or inaccessible offering returns null without fallback", async () => {
  for (const record of [
    null,
    {
      ...learningOutcomesRecord(),
      curriculumCourseId: null,
      curriculumCourse: null,
    },
  ]) {
    const h = harness(record);
    assert.equal(
      await h.repository.findApprovedLearningOutcomesForCourseOffering(
        "department-a",
        "offering-a",
      ),
      null,
    );
    assert.equal(h.offeringQueries.length, 1);
    assert.deepEqual(h.fallbackQueries, []);
  }
});

test("wrong-department and incoherent course/programme chains fail closed", async (t) => {
  const records = [
    learningOutcomesRecord(),
    learningOutcomesRecord(),
    learningOutcomesRecord(),
    learningOutcomesRecord(),
  ];
  records.at(0)!.departmentId = "department-b";
  records.at(1)!.curriculumCourse.departmentId = "department-b";
  records.at(2)!.curriculumCourse.course.departmentId = "department-b";
  records.at(3)!.curriculumCourse.curriculumVersion.academicProgram.id =
    "program-b";

  for (const [index, record] of records.entries()) {
    await t.test(`identity-${index}`, async () => {
      const h = harness(record);
      assert.equal(
        await h.repository.findApprovedLearningOutcomesForCourseOffering(
          "department-a",
          "offering-a",
        ),
        null,
      );
    });
  }
});

test("cross-version and wrong-CurriculumCourse CLOs fail closed", async (t) => {
  const crossVersion = learningOutcomesRecord();
  crossVersion.curriculumCourse.learningOutcomes.at(0)!.curriculumVersionId =
    "curriculum-version-b";
  const wrongCourse = learningOutcomesRecord();
  wrongCourse.curriculumCourse.learningOutcomes.at(0)!.curriculumCourseId =
    "curriculum-course-b";

  for (const record of [crossVersion, wrongCourse]) {
    await t.test("malformed CLO identity", async () => {
      const h = harness(record);
      assert.equal(
        await h.repository.findApprovedLearningOutcomesForCourseOffering(
          "department-a",
          "offering-a",
        ),
        null,
      );
    });
  }
});

test("malformed CLO-to-PLO mapping identities fail closed", async (t) => {
  const records = [
    learningOutcomesRecord(),
    learningOutcomesRecord(),
    learningOutcomesRecord(),
    learningOutcomesRecord(),
  ];
  records
    .at(0)!
    .curriculumCourse.learningOutcomes.at(0)!
    .ploMappings.at(0)!.departmentId = "department-b";
  records
    .at(1)!
    .curriculumCourse.learningOutcomes.at(0)!
    .ploMappings.at(0)!.courseLearningOutcomeId = "clo-a";
  records
    .at(2)!
    .curriculumCourse.learningOutcomes.at(0)!
    .ploMappings.at(0)!.programLearningOutcomeId = "plo-other";
  records
    .at(3)!
    .curriculumCourse.learningOutcomes.at(0)!
    .ploMappings.at(0)!.programLearningOutcome.curriculumVersionId =
    "curriculum-version-b";

  for (const [index, record] of records.entries()) {
    await t.test(`mapping-${index}`, async () => {
      const h = harness(record);
      assert.equal(
        await h.repository.findApprovedLearningOutcomesForCourseOffering(
          "department-a",
          "offering-a",
        ),
        null,
      );
    });
  }
});

test("output is deterministic and exposes only the compact safe representation", async () => {
  const h = harness(learningOutcomesRecord());
  const result =
    await h.repository.findApprovedLearningOutcomesForCourseOffering(
      "department-a",
      "offering-a",
    );

  assert.deepEqual(result, {
    courseOfferingId: "offering-a",
    curriculumCourse: {
      id: "curriculum-course-a",
      courseCodeSnapshot: "LAW101",
      courseTitleSnapshot: "Law",
      curriculumVersion: {
        id: "curriculum-version-a",
        code: "LLB-2026",
        name: "LL.B. 2026",
        status: AcademicVersionStatus.ACTIVE,
        effectiveAcademicSessionCode: "2026-2027",
      },
    },
    courseLearningOutcomes: [
      {
        id: "clo-a",
        code: "CLO-1",
        statement: "Explain legal rules",
        displayOrder: 1,
        mappedProgramLearningOutcomes: [],
      },
      {
        id: "clo-b",
        code: "CLO-2",
        statement: "Apply legal rules",
        displayOrder: 2,
        mappedProgramLearningOutcomes: [
          {
            id: "plo-a",
            code: "PLO-1",
            statement: "Explain legal principles",
            displayOrder: 1,
          },
          {
            id: "plo-b",
            code: "PLO-2",
            statement: "Apply legal knowledge",
            displayOrder: 2,
          },
        ],
      },
    ],
  });
  const serialized = JSON.stringify(result);
  for (const forbiddenField of [
    "departmentId",
    "curriculumVersionId",
    "curriculumCourseId",
    "courseLearningOutcomeId",
    "programLearningOutcomeId",
    "createdAt",
    "updatedAt",
    "teacherUserId",
    "syllabusVersionId",
  ]) {
    assert.equal(serialized.includes(forbiddenField), false);
  }
});

test("zero CLOs and zero mappings are valid empty collections", async () => {
  const noClos = learningOutcomesRecord();
  noClos.curriculumCourse.learningOutcomes = [];
  const noClosResult = await harness(
    noClos,
  ).repository.findApprovedLearningOutcomesForCourseOffering(
    "department-a",
    "offering-a",
  );
  assert.deepEqual(noClosResult?.courseLearningOutcomes, []);

  const noMappings = learningOutcomesRecord();
  noMappings.curriculumCourse.learningOutcomes.at(0)!.ploMappings = [];
  const noMappingsResult = await harness(
    noMappings,
  ).repository.findApprovedLearningOutcomesForCourseOffering(
    "department-a",
    "offering-a",
  );
  assert.deepEqual(
    noMappingsResult?.courseLearningOutcomes.find(
      (outcome) => outcome.id === "clo-b",
    )?.mappedProgramLearningOutcomes,
    [],
  );
});

test("read never falls back to another CurriculumVersion or CurriculumCourse", async () => {
  const wrongCurriculumCourse = learningOutcomesRecord();
  wrongCurriculumCourse.curriculumCourse.id = "curriculum-course-b";
  const wrongCurriculumVersion = learningOutcomesRecord();
  wrongCurriculumVersion.curriculumCourse.curriculumVersion.id =
    "curriculum-version-b";

  for (const malformed of [wrongCurriculumCourse, wrongCurriculumVersion]) {
    const h = harness(malformed);
    assert.equal(
      await h.repository.findApprovedLearningOutcomesForCourseOffering(
        "department-a",
        "offering-a",
      ),
      null,
    );
    assert.equal(h.offeringQueries.length, 1);
    assert.deepEqual(h.fallbackQueries, []);
  }
});
