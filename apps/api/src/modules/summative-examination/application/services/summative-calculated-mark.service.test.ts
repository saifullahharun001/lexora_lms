import assert from "node:assert/strict";
import test from "node:test";

import {
  ExaminationCourseExaminerSeat,
  Prisma,
  SummativeCalculatedMarkPath,
  SummativeExaminerComparisonDecision,
  SummativeExaminerMarkSubmissionStatus,
  SummativeThirdExaminerMarkSubmissionStatus,
} from "@prisma/client";

import {
  SUMMATIVE_FIRST_SECOND_AVERAGE_RULE_VERSION,
  SummativeCalculatedMarkService,
} from "./summative-calculated-mark.service";

const now = new Date("2026-09-02T10:00:00.000Z");
const scope = {
  departmentId: "department-a",
  actorUserId: "actor-a",
  examinationId: "examination-a",
  examinationCourseId: "examination-course-a",
  candidateId: "candidate-a",
};

function source(
  id: string,
  seat: ExaminationCourseExaminerSeat,
  total: string,
) {
  return {
    id,
    departmentId: scope.departmentId,
    examinationId: scope.examinationId,
    examinationCourseId: scope.examinationCourseId,
    candidateId: scope.candidateId,
    examinerSeat: seat,
    questionConfigurationId: "configuration-a",
    versionNumber: 1,
    status: SummativeExaminerMarkSubmissionStatus.LOCKED,
    totalMark: new Prisma.Decimal(total),
    submittedAt: now,
    lockedAt: now,
  };
}

function comparison(
  firstTotal = "40.01",
  secondTotal = "40.02",
  decision: SummativeExaminerComparisonDecision =
    SummativeExaminerComparisonDecision.THIRD_EXAMINATION_NOT_REQUIRED,
) {
  const first = source(
    "first-a",
    ExaminationCourseExaminerSeat.FIRST_EXAMINER,
    firstTotal,
  );
  const second = source(
    "second-a",
    ExaminationCourseExaminerSeat.SECOND_EXAMINER,
    secondTotal,
  );
  return {
    id: "comparison-a",
    departmentId: scope.departmentId,
    examinationId: scope.examinationId,
    examinationCourseId: scope.examinationCourseId,
    candidateId: scope.candidateId,
    firstSubmissionId: first.id,
    secondSubmissionId: second.id,
    firstSubmissionVersion: 1,
    secondSubmissionVersion: 1,
    comparisonVersion: 1,
    firstTotalSnapshot: first.totalMark,
    secondTotalSnapshot: second.totalMark,
    summativeFullMarkSnapshot: new Prisma.Decimal("100.00"),
    decision,
    firstSubmission: first,
    secondSubmission: second,
  };
}

function harness(options: {
  comparison?: ReturnType<typeof comparison>;
  calculation?: Record<string, unknown>;
  existing?: Record<string, unknown> | null;
  auditFailure?: boolean;
} = {}) {
  const created: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  const comparisonRow = options.comparison ?? comparison();
  const tx = {
    $queryRaw: async () => [{ id: scope.candidateId }],
    examinationCourse: {
      findFirst: async () => ({ summativeFullMark: new Prisma.Decimal("100.00") }),
    },
    summativeQuestionConfiguration: {
      findFirst: async () => ({ id: "configuration-a" }),
    },
    summativeExaminerComparison: {
      findFirst: async () => comparisonRow,
    },
    summativeThreeTotalCalculation: {
      findFirst: async () => options.calculation ?? null,
    },
    summativeCalculatedMark: {
      findUnique: async () => options.existing ?? null,
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: "calculated-a",
          ...data,
          createdAt: now,
        };
        created.push(row);
        return row;
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (options.auditFailure) throw new Error("audit unavailable");
        audits.push(data);
        return data;
      },
    },
  };
  return {
    tx,
    created,
    audits,
    service: new SummativeCalculatedMarkService({
      get: () => ({ requestId: "request-a", audit: {} }),
    } as never),
  };
}

test("no-Third convergence derives the exact odd-decimal First/Second average", async () => {
  const h = harness();
  const result = await h.service.ensureForComparison(
    h.tx as never,
    scope,
    "comparison-a",
  );
  assert.equal(result?.calculationPath, SummativeCalculatedMarkPath.FIRST_SECOND_AVERAGE);
  assert.equal(result?.derivedSummativeValue.toString(), "40.015");
  assert.equal(result?.ruleVersionCode, SUMMATIVE_FIRST_SECOND_AVERAGE_RULE_VERSION);
  assert.equal(result?.threeTotalCalculationId, null);
  assert.equal(result?.thirdSubmissionId, null);
  assert.equal(h.created.length, 1);
  assert.equal(h.audits.length, 1);
});

test("Third convergence copies the immutable nearest-pair result without competing recalculation", async () => {
  const comparisonRow = comparison(
    "20.00",
    "80.00",
    SummativeExaminerComparisonDecision.THIRD_EXAMINATION_REQUIRED,
  );
  const third = {
    id: "third-a",
    departmentId: scope.departmentId,
    examinationId: scope.examinationId,
    examinationCourseId: scope.examinationCourseId,
    candidateId: scope.candidateId,
    questionConfigurationId: "configuration-a",
    versionNumber: 1,
    status: SummativeThirdExaminerMarkSubmissionStatus.LOCKED,
    totalMark: new Prisma.Decimal("52.00"),
    submittedAt: now,
    lockedAt: now,
  };
  const calculation = {
    id: "three-calculation-a",
    departmentId: scope.departmentId,
    examinationId: scope.examinationId,
    examinationCourseId: scope.examinationCourseId,
    candidateId: scope.candidateId,
    comparisonId: comparisonRow.id,
    firstSubmissionId: "first-a",
    secondSubmissionId: "second-a",
    thirdSubmissionId: third.id,
    firstSubmissionVersion: 1,
    secondSubmissionVersion: 1,
    thirdSubmissionVersion: 1,
    comparisonVersionSnapshot: 1,
    questionConfigurationId: "configuration-a",
    calculationVersion: 1,
    firstTotalSnapshot: new Prisma.Decimal("20.00"),
    secondTotalSnapshot: new Prisma.Decimal("80.00"),
    thirdTotalSnapshot: third.totalMark,
    summativeFullMarkSnapshot: new Prisma.Decimal("100.00"),
    ruleVersionCode: "SUMMATIVE_THREE_TOTAL_NEAREST_PAIR_V1",
    derivedSummativeValue: new Prisma.Decimal("36.000"),
    comparison: comparisonRow,
    thirdSubmission: third,
  };
  const h = harness({ comparison: comparisonRow, calculation });
  const result = await h.service.ensureForThreeTotal(
    h.tx as never,
    scope,
    calculation.id,
  );
  assert.equal(result.derivedSummativeValue.toString(), "36");
  assert.equal(result.threeTotalCalculationId, calculation.id);
  assert.equal(result.calculationPath, SummativeCalculatedMarkPath.THREE_TOTAL_NEAREST_PAIR);
});

test("wrong comparison decision and malformed exact source chain fail closed", async () => {
  const required = harness({
    comparison: comparison(
      "20.00",
      "80.00",
      SummativeExaminerComparisonDecision.THIRD_EXAMINATION_REQUIRED,
    ),
  });
  assert.equal(
    await required.service.ensureForComparison(
      required.tx as never,
      scope,
      "comparison-a",
    ),
    null,
  );
  const malformedRow = comparison();
  malformedRow.firstSubmission.versionNumber = 2;
  const malformed = harness({ comparison: malformedRow });
  await assert.rejects(
    malformed.service.ensureForComparison(
      malformed.tx as never,
      scope,
      "comparison-a",
    ),
    /Summative calculated-mark evidence is invalid/i,
  );
});

test("exact existing evidence is idempotent but a mutated row fails closed", async () => {
  const first = harness();
  const created = await first.service.ensureForComparison(
    first.tx as never,
    scope,
    "comparison-a",
  );
  const exact = harness({ existing: created as never });
  const reused = await exact.service.ensureForComparison(
    exact.tx as never,
    scope,
    "comparison-a",
  );
  assert.equal(reused?.id, created?.id);
  assert.equal(exact.created.length, 0);
  assert.equal(exact.audits.length, 0);

  const malformed = harness({
    existing: {
      ...created,
      derivedSummativeValue: new Prisma.Decimal("99.999"),
    },
  });
  await assert.rejects(
    malformed.service.ensureForComparison(
      malformed.tx as never,
      scope,
      "comparison-a",
    ),
    /Summative calculated-mark evidence is invalid/i,
  );
});

test("required calculated-evidence audit failure aborts creation", async () => {
  const h = harness({ auditFailure: true });
  await assert.rejects(
    h.service.ensureForComparison(h.tx as never, scope, "comparison-a"),
    /audit unavailable/,
  );
  assert.equal(h.created.length, 1);
  assert.equal(h.audits.length, 0);
});
