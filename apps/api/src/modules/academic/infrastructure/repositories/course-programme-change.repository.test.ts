import assert from "node:assert/strict";
import test from "node:test";

import { PrismaAcademicRepository } from "./prisma-academic.repository";

interface State {
  course: {
    id: string;
    departmentId: string;
    academicProgramId: string | null;
    archivedAt: Date | null;
    title: string;
  };
  programs: Array<{
    id: string;
    departmentId: string;
    archivedAt: Date | null;
  }>;
  curriculumCourses: Array<{
    id: string;
    departmentId: string;
    courseId: string;
  }>;
}

function baseState(): State {
  return {
    course: {
      id: "course-a",
      departmentId: "department-a",
      academicProgramId: "program-a",
      archivedAt: null,
      title: "Original title",
    },
    programs: [
      { id: "program-a", departmentId: "department-a", archivedAt: null },
      { id: "program-b", departmentId: "department-a", archivedAt: null },
    ],
    curriculumCourses: [],
  };
}

function harness(initial = baseState()) {
  let state = structuredClone(initial);
  const operations: string[] = [];
  const lockQueries: string[] = [];
  let requestedAcademicProgramId: string | null | undefined;
  let updateCalls = 0;

  const prisma = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      operations.push("transaction");
      const working = structuredClone(state);
      const tx = {
        $queryRaw: async (query: { sql?: string; text?: string }) => {
          const sql = query.sql ?? query.text ?? String(query);
          lockQueries.push(sql);

          if (/FROM "courses"/.test(sql)) {
            operations.push("course-lock");
            const course = working.course;
            return course.id === "course-a" &&
              course.departmentId === "department-a" &&
              course.archivedAt === null
              ? [
                  {
                    id: course.id,
                    academicProgramId: course.academicProgramId,
                  },
                ]
              : [];
          }
          if (/FROM "academic_programs"/.test(sql)) {
            operations.push("academic-program-lock");
            const program = working.programs.find(
              (candidate) =>
                candidate.id === requestedAcademicProgramId &&
                candidate.departmentId === "department-a" &&
                candidate.archivedAt === null,
            );
            return program ? [{ id: program.id }] : [];
          }
          if (/FROM "curriculum_courses"/.test(sql)) {
            operations.push("curriculum-course-lock");
            return working.curriculumCourses
              .filter((dependency) => dependency.courseId === "course-a")
              .sort((left, right) => left.id.localeCompare(right.id));
          }
          throw new Error(`Unexpected raw query: ${sql}`);
        },
        course: {
          updateMany: async (args: {
            where: { id: string; departmentId: string; archivedAt: null };
            data: Record<string, unknown>;
          }) => {
            operations.push("course-update");
            updateCalls += 1;
            if (
              working.course.id !== args.where.id ||
              working.course.departmentId !== args.where.departmentId ||
              working.course.archivedAt !== null
            ) {
              return { count: 0 };
            }
            for (const [key, value] of Object.entries(args.data)) {
              if (value !== undefined) {
                (working.course as Record<string, unknown>)[key] = value;
              }
            }
            return { count: 1 };
          },
          findFirst: async (args: {
            where: { id: string; departmentId: string; archivedAt: null };
          }) => {
            operations.push("course-read");
            const course = working.course;
            if (
              course.id !== args.where.id ||
              course.departmentId !== args.where.departmentId ||
              course.archivedAt !== null
            ) {
              return null;
            }
            return {
              ...course,
              academicProgram:
                working.programs.find(
                  (program) => program.id === course.academicProgramId,
                ) ?? null,
            };
          },
        },
      };

      const result = await callback(tx);
      state = working;
      return result;
    },
  };

  const repository = new PrismaAcademicRepository(prisma as never);
  return {
    update: (input: Record<string, unknown>) => {
      requestedAcademicProgramId = input.academicProgramId as
        | string
        | null
        | undefined;
      return repository.updateCourse(
        "department-a",
        "course-a",
        input as never,
      );
    },
    getState: () => state,
    getOperations: () => operations,
    getLockQueries: () => lockQueries,
    getUpdateCalls: () => updateCalls,
  };
}

test("ordinary Course updates retain the existing path without dependency locks", async () => {
  const h = harness();
  const result = await h.update({ title: "Updated title" });

  assert.equal(result.outcome, "UPDATED");
  assert.equal(h.getState().course.title, "Updated title");
  assert.deepEqual(h.getOperations(), [
    "transaction",
    "course-update",
    "course-read",
  ]);
  assert.equal(h.getLockQueries().length, 0);
});

test("same programme identity remains an allowed idempotent Course update", async () => {
  const h = harness();
  const result = await h.update({
    academicProgramId: "program-a",
    title: "Updated title",
  });

  assert.equal(result.outcome, "UPDATED");
  assert.equal(h.getState().course.academicProgramId, "program-a");
  assert.equal(h.getState().course.title, "Updated title");
  assert.deepEqual(h.getOperations(), [
    "transaction",
    "course-lock",
    "academic-program-lock",
    "course-update",
    "course-read",
  ]);
});

test("actual programme change with no CurriculumCourse dependency is allowed", async () => {
  const h = harness();
  const result = await h.update({ academicProgramId: "program-b" });

  assert.equal(result.outcome, "UPDATED");
  assert.equal(h.getState().course.academicProgramId, "program-b");
  assert.deepEqual(h.getOperations(), [
    "transaction",
    "course-lock",
    "academic-program-lock",
    "curriculum-course-lock",
    "course-update",
    "course-read",
  ]);
});

test("programme removal with no CurriculumCourse dependency is allowed", async () => {
  const h = harness();
  const result = await h.update({ academicProgramId: null });

  assert.equal(result.outcome, "UPDATED");
  assert.equal(h.getState().course.academicProgramId, null);
  assert.deepEqual(h.getOperations(), [
    "transaction",
    "course-lock",
    "curriculum-course-lock",
    "course-update",
    "course-read",
  ]);
});

test("one same-department CurriculumCourse blocks programme movement", async () => {
  const state = baseState();
  state.curriculumCourses.push({
    id: "curriculum-course-a",
    departmentId: "department-a",
    courseId: "course-a",
  });
  const h = harness(state);

  assert.equal(
    (await h.update({ academicProgramId: "program-b" })).outcome,
    "PROGRAMME_DEPENDENCY_CONFLICT",
  );
  assert.equal(h.getState().course.academicProgramId, "program-a");
  assert.equal(h.getUpdateCalls(), 0);
});

test("one same-department CurriculumCourse blocks programme removal", async () => {
  const state = baseState();
  state.curriculumCourses.push({
    id: "curriculum-course-a",
    departmentId: "department-a",
    courseId: "course-a",
  });
  const h = harness(state);

  assert.equal(
    (await h.update({ academicProgramId: null })).outcome,
    "PROGRAMME_DEPENDENCY_CONFLICT",
  );
  assert.equal(h.getState().course.academicProgramId, "program-a");
  assert.equal(h.getUpdateCalls(), 0);
});

test("multiple CurriculumCourse dependencies block deterministically", async () => {
  const state = baseState();
  state.curriculumCourses.push(
    {
      id: "curriculum-course-b",
      departmentId: "department-a",
      courseId: "course-a",
    },
    {
      id: "curriculum-course-a",
      departmentId: "department-a",
      courseId: "course-a",
    },
  );
  const h = harness(state);

  assert.equal(
    (await h.update({ academicProgramId: "program-b" })).outcome,
    "PROGRAMME_DEPENDENCY_CONFLICT",
  );
  assert.equal(h.getState().course.academicProgramId, "program-a");
  assert.equal(h.getUpdateCalls(), 0);
  assert.match(h.getLockQueries()[2]!, /ORDER BY "id"/);
});

test("malformed cross-department CurriculumCourse fails closed", async () => {
  const state = baseState();
  state.curriculumCourses.push({
    id: "curriculum-course-a",
    departmentId: "department-b",
    courseId: "course-a",
  });
  const h = harness(state);

  assert.equal(
    (await h.update({ academicProgramId: "program-b" })).outcome,
    "PROGRAMME_DEPENDENCY_CONFLICT",
  );
  assert.equal(h.getState().course.academicProgramId, "program-a");
  assert.equal(h.getUpdateCalls(), 0);
});

test("wrong-department Course is safely not found", async () => {
  const state = baseState();
  state.course.departmentId = "department-b";
  const h = harness(state);

  assert.equal(
    (await h.update({ academicProgramId: "program-b" })).outcome,
    "COURSE_NOT_FOUND",
  );
  assert.equal(h.getUpdateCalls(), 0);
});

test("wrong-department AcademicProgram is rejected before dependency inspection", async () => {
  const state = baseState();
  state.programs[1]!.departmentId = "department-b";
  const h = harness(state);

  assert.equal(
    (await h.update({ academicProgramId: "program-b" })).outcome,
    "ACADEMIC_PROGRAM_NOT_FOUND",
  );
  assert.equal(h.getState().course.academicProgramId, "program-a");
  assert.equal(h.getUpdateCalls(), 0);
});

test("Course lock precedes the mandatory CurriculumCourse boundary used by StudentBatch binding", async () => {
  const state = baseState();
  // A StudentBatch-bound CourseOffering necessarily has a CurriculumCourse.
  // That persisted dependency is the transitive immutable boundary under test.
  state.curriculumCourses.push({
    id: "curriculum-course-a",
    departmentId: "department-a",
    courseId: "course-a",
  });
  const h = harness(state);

  assert.equal(
    (await h.update({ academicProgramId: "program-b" })).outcome,
    "PROGRAMME_DEPENDENCY_CONFLICT",
  );
  assert.deepEqual(h.getOperations(), [
    "transaction",
    "course-lock",
    "academic-program-lock",
    "curriculum-course-lock",
  ]);
  assert.equal(
    h.getLockQueries().some((query) => /FROM "course_offerings"/.test(query)),
    false,
  );
  for (const query of h.getLockQueries()) {
    assert.match(query, /FOR UPDATE/);
  }
  assert.match(h.getLockQueries()[0]!, /"department_id"/);
  assert.match(h.getLockQueries()[1]!, /"department_id"/);
  assert.match(h.getLockQueries()[2]!, /ORDER BY "id"/);
  assert.equal(
    h.getLockQueries().some((query) => /FROM "curriculum_versions"/.test(query)),
    false,
  );
  assert.equal(h.getUpdateCalls(), 0);
});
