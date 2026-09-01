import assert from "node:assert/strict";
import test from "node:test";

import { Prisma } from "@prisma/client";

import { SummativeThirdExaminerMarksService } from "./summative-third-examiner-marks.service";

const fixedAt = new Date("2026-09-01T12:00:00.000Z");

function harness(options: {
  locked?: boolean;
  malformedLocked?: boolean;
  failAudit?: boolean;
  failCalculation?: boolean;
} = {}) {
  const state = {
    submission: {
      id: "third-submission-a",
      candidateId: "candidate-a",
      examinationCourseId: "course-a",
      referralId: "referral-a",
      questionConfigurationId: "config-a",
      versionNumber: 1,
      status: options.locked ? "LOCKED" : "DRAFT",
      totalMark: options.locked ? new Prisma.Decimal("30") : null,
      submittedAt: options.locked ? fixedAt : null,
      lockedAt: options.locked && !options.malformedLocked ? fixedAt : null,
      createdAt: fixedAt,
      updatedAt: fixedAt,
      questionMarks: [
        {
          id: "mark-a",
          questionItemId: "question-a",
          awardedMark: new Prisma.Decimal("10"),
          createdAt: fixedAt,
          updatedAt: fixedAt,
        },
        {
          id: "mark-b",
          questionItemId: "question-b",
          awardedMark: new Prisma.Decimal("20"),
          createdAt: fixedAt,
          updatedAt: fixedAt,
        },
      ],
    } as any,
    audits: [] as any[],
    calculationCalls: [] as any[],
    calculations: [] as any[],
    transactionOptions: [] as any[],
  };
  const referral = {
    id: "referral-a",
    departmentId: "department-a",
    examinationId: "examination-a",
    examinationCourseId: "course-a",
    candidateId: "candidate-a",
    thirdExaminerUserId: "third-a",
    questionConfigurationId: "config-a",
    deadline: new Date("2099-01-01T00:00:00.000Z"),
    status: "ASSIGNED",
    archivedAt: null,
  };

  function copySubmission() {
    return {
      ...state.submission,
      totalMark: state.submission.totalMark
        ? new Prisma.Decimal(state.submission.totalMark)
        : null,
      questionMarks: state.submission.questionMarks.map((mark: any) => ({
        ...mark,
        awardedMark: new Prisma.Decimal(mark.awardedMark),
      })),
    };
  }

  const tx = {
    $queryRaw: async (query: any) => {
      const sql = query.sql ?? query.text ?? String(query);
      if (/summative_examination_candidates/.test(sql)) return [{ id: "candidate-a" }];
      if (/summative_question_configuration_items/.test(sql)) {
        return [{ id: "question-a" }, { id: "question-b" }];
      }
      if (/summative_third_examiner_mark_submissions/.test(sql)) {
        return [{ id: state.submission.id }];
      }
      if (/summative_third_examiner_question_marks/.test(sql)) {
        return state.submission.questionMarks.map((mark: any) => ({ id: mark.id }));
      }
      return [];
    },
    examinationCourse: {
      findFirst: async () => ({ lockedQuestionConfigurationId: "config-a" }),
    },
    summativeThirdExaminationReferral: { findFirst: async () => referral },
    summativeQuestionConfigurationItem: {
      findMany: async () => [
        { id: "question-a", fullMark: new Prisma.Decimal("10"), isRequired: true },
        { id: "question-b", fullMark: new Prisma.Decimal("20"), isRequired: true },
      ],
    },
    summativeThirdExaminerMarkSubmission: {
      findFirst: async () => copySubmission(),
      update: async ({ data }: any) => {
        Object.assign(state.submission, data, { updatedAt: fixedAt });
        return copySubmission();
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        if (options.failAudit) throw new Error("simulated lock audit failure");
        state.audits.push(data);
        return data;
      },
    },
  };
  const prisma = {
    summativeThirdExaminationReferral: { findMany: async () => [referral] },
    $transaction: async (operation: (transaction: any) => Promise<any>, txOptions: any) => {
      state.transactionOptions.push(txOptions);
      const beforeSubmission = copySubmission();
      const beforeAudits = [...state.audits];
      const beforeCalculations = [...state.calculations];
      try {
        return await operation(tx);
      } catch (error) {
        state.submission = beforeSubmission;
        state.audits.splice(0, state.audits.length, ...beforeAudits);
        state.calculations.splice(0, state.calculations.length, ...beforeCalculations);
        throw error;
      }
    },
  };
  const calculation = {
    ensureForLockedThird: async (_tx: unknown, calculationScope: any) => {
      state.calculationCalls.push(calculationScope);
      if (options.failCalculation || options.malformedLocked) {
        throw new Error("simulated invalid calculation source chain");
      }
      const existing = state.calculations[0];
      if (existing) return existing;
      const created = { id: "calculation-a" };
      state.calculations.push(created);
      return created;
    },
  };
  const requestContext = {
    get: () => ({
      principal: {
        isAuthenticated: true,
        actorId: "third-a",
        activeDepartmentId: "department-a",
      },
      requestId: "request-a",
      audit: { ipAddress: "127.0.0.1", userAgent: "test" },
    }),
  };
  const service = new SummativeThirdExaminerMarksService(
    prisma as never,
    requestContext as never,
    calculation as never,
  );
  return { service, state, options };
}

test("successful Third finalisation locks source, writes structural audit and ensures calculation", async () => {
  const h = harness();
  const response = await h.service.finalizeSubmission("course-a", "candidate-a");
  assert.equal(h.state.submission.status, "LOCKED");
  assert.equal(h.state.submission.totalMark.toString(), "30");
  assert.equal(h.state.calculationCalls.length, 1);
  assert.deepEqual(h.state.calculationCalls[0], {
    departmentId: "department-a",
    actorUserId: "third-a",
    examinationId: "examination-a",
    examinationCourseId: "course-a",
    candidateId: "candidate-a",
    referralId: "referral-a",
    thirdSubmissionId: "third-submission-a",
  });
  assert.equal(h.state.audits.length, 1);
  assert.equal(
    h.state.audits[0]?.action,
    "summative-examination.third-examiner-mark-submission.locked",
  );
  assert.doesNotMatch(
    JSON.stringify(h.state.audits[0]),
    /calculatedTotal|awardedMark|questionMarks|"30"/,
  );
  assert.equal(response.submission?.status, "LOCKED");
});

test("final Third response remains blind to First/Second and calculation evidence", async () => {
  const response = await harness().service.finalizeSubmission(
    "course-a",
    "candidate-a",
  );
  assert.doesNotMatch(
    JSON.stringify(response),
    /firstExaminer|secondExaminer|firstSubmission|secondSubmission|variance|difference|distance|selectedPair|selectionReason|derivedSummative|calculation/i,
  );
});

test("repeated finalisation is exact-source idempotent without duplicate lock or calculation", async () => {
  const h = harness({ locked: true });
  const first = await h.service.finalizeSubmission("course-a", "candidate-a");
  const repeated = await h.service.finalizeSubmission("course-a", "candidate-a");
  assert.equal(repeated.submission?.id, first.submission?.id);
  assert.equal(h.state.calculations.length, 1);
  assert.equal(h.state.audits.length, 0);
  assert.equal(h.state.calculationCalls.length, 2);
});

test("malformed existing LOCKED submission fails closed instead of idempotent success", async () => {
  const h = harness({ locked: true, malformedLocked: true });
  await assert.rejects(
    h.service.finalizeSubmission("course-a", "candidate-a"),
    /invalid calculation source chain/,
  );
  assert.equal(h.state.audits.length, 0);
});

test("required calculation failure rolls Third finalisation and its audit back", async () => {
  const h = harness({ failCalculation: true });
  await assert.rejects(
    h.service.finalizeSubmission("course-a", "candidate-a"),
    /invalid calculation source chain/,
  );
  assert.equal(h.state.submission.status, "DRAFT");
  assert.equal(h.state.submission.totalMark, null);
  assert.equal(h.state.audits.length, 0);
  assert.equal(h.state.calculations.length, 0);
});

test("required Third-lock audit failure rolls source mutation back before calculation", async () => {
  const h = harness({ failAudit: true });
  await assert.rejects(
    h.service.finalizeSubmission("course-a", "candidate-a"),
    /lock audit failure/,
  );
  assert.equal(h.state.submission.status, "DRAFT");
  assert.equal(h.state.calculationCalls.length, 0);
});

test("retry after removed calculation failure succeeds without partial prior state", async () => {
  const h = harness({ failCalculation: true });
  await assert.rejects(h.service.finalizeSubmission("course-a", "candidate-a"));
  h.options.failCalculation = false;
  await h.service.finalizeSubmission("course-a", "candidate-a");
  assert.equal(h.state.submission.status, "LOCKED");
  assert.equal(h.state.audits.length, 1);
  assert.equal(h.state.calculations.length, 1);
});

test("Third finalisation retains a bounded Serializable transaction", async () => {
  const h = harness();
  await h.service.finalizeSubmission("course-a", "candidate-a");
  assert.equal(h.state.transactionOptions.length, 1);
  assert.equal(
    h.state.transactionOptions[0]?.isolationLevel,
    Prisma.TransactionIsolationLevel.Serializable,
  );
  assert.equal(h.state.transactionOptions[0]?.timeout, 30_000);
});
