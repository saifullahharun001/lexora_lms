import assert from "node:assert/strict";
import test from "node:test";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { ExaminationSetupService } from "./examination-setup.service";

const authority = {
  departmentId: "department-a",
  actorUserId: "admin-a",
  userRoleId: "user-role-a",
  roleId: "role-a",
};

function offering(overrides: Record<string, unknown> = {}) {
  return {
    id: "offering-a",
    departmentId: "department-a",
    academicTermId: "term-a",
    studentBatchId: "batch-a",
    curriculumCourseId: "curriculum-course-a",
    syllabusVersionId: "syllabus-a",
    curriculumCourse: {
      id: "curriculum-course-a",
      curriculumVersionId: "curriculum-version-a",
      assessmentTemplateId: "template-a",
      curriculumVersion: {
        id: "curriculum-version-a",
        academicProgramId: "program-a",
        archivedAt: null,
      },
      assessmentTemplate: { id: "template-a", archivedAt: null },
    },
    syllabusVersion: { id: "syllabus-a", archivedAt: null },
    studentBatch: {
      id: "batch-a",
      departmentId: "department-a",
      academicProgramId: "program-a",
      academicSessionId: "session-a",
      archivedAt: null,
    },
    ...overrides,
  };
}

function courseHarness(
  offeringRecord = offering(),
  failAudit = false,
  createError?: unknown,
) {
  const createCalls: Array<{ data: Record<string, unknown> }> = [];
  const audits: unknown[] = [];
  const locks: string[] = [];
  let pendingCreates: Array<{ data: Record<string, unknown> }> = [];
  const tx = {
    $queryRaw: async (query: { sql?: string; text?: string }) => {
      const sql = query.sql ?? query.text ?? String(query);
      if (sql.includes('FROM "course_offerings"')) {
        locks.push("course-offering");
        return [{ id: "offering-a" }];
      }
      if (sql.includes('FROM "examinations"')) {
        locks.push("examination");
        return [{ id: "exam-a" }];
      }
      return [];
    },
    courseOffering: { findFirst: async () => offeringRecord },
    examination: {
      findFirst: async () => ({
        id: "exam-a",
        departmentId: "department-a",
        academicProgramId: "program-a",
        academicSessionId: "session-a",
        academicTermId: "term-a",
        archivedAt: null,
      }),
    },
    assessmentTemplateComponent: {
      findFirst: async () => ({
        id: "summative-component-a",
        maximumMarks: new Prisma.Decimal("75.00"),
      }),
    },
    examinationCourse: {
      create: async (args: { data: Record<string, unknown> }) => {
        if (createError) throw createError;
        pendingCreates.push(args);
        return { id: "exam-course-a", ...args.data };
      },
    },
    auditLog: {
      create: async (entry: unknown) => {
        if (failAudit) throw new Error("audit unavailable");
        audits.push(entry);
        return entry;
      },
    },
  };
  const prisma = {
    $transaction: async (
      callback: (client: unknown) => Promise<unknown>,
      _options: unknown,
    ) => {
      pendingCreates = [];
      const result = await callback(tx);
      createCalls.push(...pendingCreates);
      return result;
    },
  };
  return {
    audits,
    createCalls,
    locks,
    service: new ExaminationSetupService(
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
  };
}

function examinationHarness(createError?: unknown) {
  const createCalls: Array<{ data: Record<string, unknown> }> = [];
  const audits: unknown[] = [];
  let pendingCreates: Array<{ data: Record<string, unknown> }> = [];
  const tx = {
    $queryRaw: async () => [{ id: "parent-a" }],
    examination: {
      create: async (args: { data: Record<string, unknown> }) => {
        if (createError) throw createError;
        pendingCreates.push(args);
        return { id: "exam-a", ...args.data };
      },
    },
    auditLog: {
      create: async (entry: unknown) => {
        audits.push(entry);
        return entry;
      },
    },
  };
  const prisma = {
    $transaction: async (
      callback: (client: unknown) => Promise<unknown>,
      _options: unknown,
    ) => {
      pendingCreates = [];
      const result = await callback(tx);
      createCalls.push(...pendingCreates);
      return result;
    },
  };
  return {
    audits,
    createCalls,
    service: new ExaminationSetupService(
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
  };
}

function p2002(target: string | string[]) {
  return { code: "P2002", meta: { target } };
}

test("setup management fails closed before reads when exact authority is absent", async () => {
  const service = new ExaminationSetupService(
    {} as never,
    {} as never,
    {
      authorize: async () => {
        throw new ForbiddenException(
          "Summative examination management access denied",
        );
      },
    } as never,
  );
  await assert.rejects(service.listExaminations(), ForbiddenException);
});

test("ExaminationCourse derives every academic snapshot and full mark from locked authoritative rows", async () => {
  const h = courseHarness();
  const result = await h.service.createExaminationCourse({
    examinationId: "exam-a",
    courseOfferingId: "offering-a",
    ruleVersionCode: " RULE-2026 ",
  });
  assert.deepEqual(h.locks, ["course-offering", "examination"]);
  assert.equal(result.departmentId, "department-a");
  assert.equal(result.academicProgramId, "program-a");
  assert.equal(result.academicSessionId, "session-a");
  assert.equal(result.academicTermId, "term-a");
  assert.equal(result.studentBatchId, "batch-a");
  assert.equal(result.curriculumVersionId, "curriculum-version-a");
  assert.equal(result.curriculumCourseId, "curriculum-course-a");
  assert.equal(result.syllabusVersionId, "syllabus-a");
  assert.equal(result.assessmentTemplateId, "template-a");
  assert.equal(
    result.summativeAssessmentComponentId,
    "summative-component-a",
  );
  assert.equal(result.summativeComponentCode, "SUMMATIVE_EXAMINATION");
  assert.equal(result.summativeFullMark.toString(), "75");
  assert.equal(result.ruleVersionCode, "RULE-2026");
  assert.equal(h.createCalls.length, 1);
  assert.equal(h.audits.length, 1);
});

test("StudentBatch-bound offering cannot establish a contradictory Examination programme or session", async () => {
  for (const studentBatch of [
    {
      id: "batch-a",
      departmentId: "department-a",
      academicProgramId: "program-b",
      academicSessionId: "session-a",
      archivedAt: null,
    },
    {
      id: "batch-a",
      departmentId: "department-a",
      academicProgramId: "program-a",
      academicSessionId: "session-b",
      archivedAt: null,
    },
  ]) {
    const h = courseHarness(offering({ studentBatch }));
    await assert.rejects(
      h.service.createExaminationCourse({
        examinationId: "exam-a",
        courseOfferingId: "offering-a",
        ruleVersionCode: "RULE-2026",
      }),
      BadRequestException,
    );
    assert.equal(h.createCalls.length, 0);
    assert.equal(h.audits.length, 0);
  }
});

test("ExaminationCourse audit failure aborts the protected transaction", async () => {
  const h = courseHarness(offering(), true);
  await assert.rejects(
    h.service.createExaminationCourse({
      examinationId: "exam-a",
      courseOfferingId: "offering-a",
      ruleVersionCode: "RULE-2026",
    }),
    /audit unavailable/,
  );
  assert.equal(h.createCalls.length, 0);
  assert.equal(h.audits.length, 0);
});

for (const target of [
  ["departmentId", "examinationId", "courseOfferingId"],
  ["department_id", "examination_id", "course_offering_id"],
]) {
  test(`ExaminationCourse maps its exact P2002 field target (${target.join(", ")}) to conflict`, async () => {
    const h = courseHarness(offering(), false, p2002(target));

    await assert.rejects(
      h.service.createExaminationCourse({
        examinationId: "exam-a",
        courseOfferingId: "offering-a",
        ruleVersionCode: "RULE-2026",
      }),
      (error: unknown) => {
        assert.ok(error instanceof ConflictException);
        assert.equal(error.message, "Examination course already exists");
        return true;
      },
    );
    assert.equal(h.createCalls.length, 0);
    assert.equal(h.audits.length, 0);
  });
}

test("ExaminationCourse preserves constraint-name P2002 conflict handling", async () => {
  const h = courseHarness(
    offering(),
    false,
    p2002("examination_course_offering_uq"),
  );

  await assert.rejects(
    h.service.createExaminationCourse({
      examinationId: "exam-a",
      courseOfferingId: "offering-a",
      ruleVersionCode: "RULE-2026",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ConflictException);
      assert.equal(error.message, "Examination course already exists");
      return true;
    },
  );
  assert.equal(h.createCalls.length, 0);
  assert.equal(h.audits.length, 0);
});

test("ExaminationCourse rethrows an unrelated P2002 unchanged", async () => {
  const uniqueError = p2002(["id"]);
  const h = courseHarness(offering(), false, uniqueError);

  await assert.rejects(
    h.service.createExaminationCourse({
      examinationId: "exam-a",
      courseOfferingId: "offering-a",
      ruleVersionCode: "RULE-2026",
    }),
    (error: unknown) => error === uniqueError,
  );
  assert.equal(h.createCalls.length, 0);
  assert.equal(h.audits.length, 0);
});

test("Examination creation still commits its create and success audit", async () => {
  const h = examinationHarness();

  const result = await h.service.createExamination({
    academicProgramId: "program-a",
    academicSessionId: "session-a",
    academicTermId: "term-a",
    code: " EXAM-2026 ",
    name: " Final Examination ",
    categoryCode: " SUMMATIVE ",
    ruleVersionCode: " RULE-2026 ",
  });

  assert.equal(result.code, "EXAM-2026");
  assert.equal(result.name, "Final Examination");
  assert.equal(h.createCalls.length, 1);
  assert.equal(h.audits.length, 1);
});

for (const target of [
  ["departmentId", "code"],
  ["department_id", "code"],
]) {
  test(`Examination maps its exact P2002 field target (${target.join(", ")}) to conflict`, async () => {
    const h = examinationHarness(p2002(target));

    await assert.rejects(
      h.service.createExamination({
        academicProgramId: "program-a",
        academicSessionId: "session-a",
        academicTermId: "term-a",
        code: "EXAM-2026",
        name: "Final Examination",
        categoryCode: "SUMMATIVE",
        ruleVersionCode: "RULE-2026",
      }),
      (error: unknown) => {
        assert.ok(error instanceof ConflictException);
        assert.equal(
          error.message,
          "Examination code already exists in this department",
        );
        return true;
      },
    );
    assert.equal(h.createCalls.length, 0);
    assert.equal(h.audits.length, 0);
  });
}
