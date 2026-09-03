import assert from "node:assert/strict";
import test from "node:test";

import { InternalServerErrorException } from "@nestjs/common";
import {
  ExaminationCourseExaminerSeat,
  Prisma,
  SummativeExaminerComparisonDecision,
  SummativeExaminerMarkSubmissionStatus,
  SummativeQuestionConfigurationStatus,
  SummativeThirdExaminationReferralStatus,
  SummativeThirdExaminerMarkSubmissionStatus,
} from "@prisma/client";

import { SummativeThreeTotalCalculationService } from "./summative-three-total-calculation.service";

const fixedAt = new Date("2026-09-01T12:00:00.000Z");
const scope = {
  departmentId: "department-a",
  actorUserId: "third-examiner-a",
  examinationId: "examination-a",
  examinationCourseId: "course-a",
  candidateId: "candidate-a",
  referralId: "referral-a",
  thirdSubmissionId: "third-a",
};

function decimal(value: string) {
  return new Prisma.Decimal(value);
}

function source(seat: ExaminationCourseExaminerSeat, total: string) {
  const first = seat === ExaminationCourseExaminerSeat.FIRST_EXAMINER;
  return {
    id: first ? "first-a" : "second-a",
    departmentId: scope.departmentId,
    examinationId: scope.examinationId,
    examinationCourseId: scope.examinationCourseId,
    candidateId: scope.candidateId,
    examinerSeat: seat,
    questionConfigurationId: "config-a",
    versionNumber: 1,
    status: SummativeExaminerMarkSubmissionStatus.LOCKED,
    totalMark: decimal(total),
    submittedAt: fixedAt,
    lockedAt: fixedAt,
  };
}

function harness(
  mutate?: (fixture: {
    referral: any;
    comparison: any;
    first: any;
    second: any;
    third: any;
    configuration: any;
    course: any;
  }) => void,
) {
  const first = source(ExaminationCourseExaminerSeat.FIRST_EXAMINER, "40");
  const second = source(ExaminationCourseExaminerSeat.SECOND_EXAMINER, "60");
  const comparison = {
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
    ruleVersionCode: "SUMMATIVE_FS_VARIANCE_15_PERCENT_V1",
    firstTotalSnapshot: decimal("40"),
    secondTotalSnapshot: decimal("60"),
    summativeFullMarkSnapshot: decimal("100"),
    decision: SummativeExaminerComparisonDecision.THIRD_EXAMINATION_REQUIRED,
    firstSubmission: first,
    secondSubmission: second,
  };
  const referral = {
    id: scope.referralId,
    departmentId: scope.departmentId,
    examinationId: scope.examinationId,
    examinationCourseId: scope.examinationCourseId,
    candidateId: scope.candidateId,
    comparisonId: comparison.id,
    thirdExaminerUserId: scope.actorUserId,
    questionConfigurationId: "config-a",
    comparisonVersionSnapshot: 1,
    ruleVersionCode: "SUMMATIVE_FS_VARIANCE_15_PERCENT_V1",
    assignmentVersion: 1,
    status: SummativeThirdExaminationReferralStatus.ASSIGNED,
    archivedAt: null,
    comparison,
  };
  const third = {
    id: scope.thirdSubmissionId,
    departmentId: scope.departmentId,
    examinationId: scope.examinationId,
    examinationCourseId: scope.examinationCourseId,
    candidateId: scope.candidateId,
    referralId: referral.id,
    thirdExaminerUserId: scope.actorUserId,
    questionConfigurationId: "config-a",
    versionNumber: 1,
    status: SummativeThirdExaminerMarkSubmissionStatus.LOCKED,
    totalMark: decimal("51"),
    submittedAt: fixedAt,
    lockedAt: fixedAt,
    questionMarks: [
      {
        questionItemId: "question-a",
        questionConfigurationId: "config-a",
        awardedMark: decimal("20"),
      },
      {
        questionItemId: "question-b",
        questionConfigurationId: "config-a",
        awardedMark: decimal("31"),
      },
    ],
  };
  const configuration = {
    id: "config-a",
    status: SummativeQuestionConfigurationStatus.LOCKED,
    archivedAt: null,
    items: [
      { id: "question-a", fullMark: decimal("40"), isRequired: true },
      { id: "question-b", fullMark: decimal("60"), isRequired: true },
    ],
  };
  const course = { summativeFullMark: decimal("100") };
  const fixture = {
    referral,
    comparison,
    first,
    second,
    third,
    configuration,
    course,
  };
  mutate?.(fixture);

  const state = {
    calculations: [] as any[],
    audits: [] as any[],
    rawSql: [] as string[],
    failAudit: false,
    fixture,
  };
  const tx = {
    $queryRaw: async (query: { sql?: string; text?: string }) => {
      state.rawSql.push(query.sql ?? query.text ?? String(query));
      return fixture.referral.candidateId === scope.candidateId
        ? [{ id: scope.candidateId }]
        : [];
    },
    examinationCourse: { findFirst: async () => fixture.course },
    summativeThirdExaminationReferral: {
      findFirst: async () => fixture.referral,
    },
    summativeThirdExaminerMarkSubmission: {
      findFirst: async () => fixture.third,
    },
    summativeQuestionConfiguration: {
      findFirst: async () => fixture.configuration,
    },
    summativeThreeTotalCalculation: {
      findFirst: async (args: any) => {
        if (args.where.firstSubmissionId) {
          return (
            state.calculations.find(
              (value) =>
                value.firstSubmissionId === args.where.firstSubmissionId &&
                value.secondSubmissionId === args.where.secondSubmissionId &&
                value.thirdSubmissionId === args.where.thirdSubmissionId,
            ) ?? null
          );
        }
        return (
          [...state.calculations].sort(
            (a, b) => b.calculationVersion - a.calculationVersion,
          )[0] ?? null
        );
      },
      create: async ({ data }: any) => {
        const value = {
          id: `calculation-${state.calculations.length + 1}`,
          createdAt: fixedAt,
          ...data,
        };
        state.calculations.push(value);
        return value;
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        if (state.failAudit)
          throw new Error("simulated calculation audit failure");
        state.audits.push(data);
        return data;
      },
    },
  };
  const service = new SummativeThreeTotalCalculationService({
    get: () => ({
      requestId: "request-a",
      audit: { ipAddress: "127.0.0.1", userAgent: "test" },
    }),
  } as never, {
    ensureForThreeTotal: async () => null,
  } as never);
  let tail = Promise.resolve();
  async function execute(overrides: Partial<typeof scope> = {}) {
    const preceding = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => (release = resolve));
    await preceding;
    const calculationsBefore = [...state.calculations];
    const auditsBefore = [...state.audits];
    try {
      return await service.ensureForLockedThird(tx as never, {
        ...scope,
        ...overrides,
      });
    } catch (error) {
      state.calculations.splice(
        0,
        state.calculations.length,
        ...calculationsBefore,
      );
      state.audits.splice(0, state.audits.length, ...auditsBefore);
      throw error;
    } finally {
      release();
    }
  }
  return { execute, state };
}

test("qualifying exact comparison, referral and LOCKED Third source create complete evidence", async () => {
  const h = harness();
  const calculation = await h.execute();
  assert.equal(calculation.firstSubmissionId, "first-a");
  assert.equal(calculation.secondSubmissionId, "second-a");
  assert.equal(calculation.thirdSubmissionId, "third-a");
  assert.equal(calculation.firstSecondDistance.toString(), "20");
  assert.equal(calculation.firstThirdDistance.toString(), "11");
  assert.equal(calculation.secondThirdDistance.toString(), "9");
  assert.equal(calculation.selectedPair, "SECOND_THIRD");
  assert.equal(calculation.derivedSummativeValue.toFixed(3), "55.500");
  assert.equal(h.state.audits.length, 1);
});

test("non-qualifying comparison fails closed", async () => {
  const h = harness(({ comparison }) => {
    comparison.decision =
      SummativeExaminerComparisonDecision.THIRD_EXAMINATION_NOT_REQUIRED;
  });
  await assert.rejects(h.execute(), InternalServerErrorException);
});

test("missing, DRAFT or null-total Third source fails closed", async () => {
  for (const mutation of [
    ({ third }: any) => Object.assign(third, { id: undefined }),
    ({ third }: any) => Object.assign(third, { status: "DRAFT" }),
    ({ third }: any) => Object.assign(third, { totalMark: null }),
  ]) {
    const h = harness(mutation);
    await assert.rejects(h.execute(), InternalServerErrorException);
  }
});

test("wrong candidate, department or ExaminationCourse source scope fails closed", async () => {
  for (const field of [
    "candidateId",
    "departmentId",
    "examinationCourseId",
  ] as const) {
    const h = harness(({ third }) => {
      third[field] = `wrong-${field}`;
    });
    await assert.rejects(h.execute(), InternalServerErrorException);
  }
});

test("wrong comparison/referral binding and question configuration fail closed", async () => {
  const cases = [
    ({ referral }: any) => (referral.comparisonId = "comparison-other"),
    ({ third }: any) => (third.referralId = "referral-other"),
    ({ third }: any) => (third.questionConfigurationId = "config-other"),
    ({ first }: any) => (first.questionConfigurationId = "config-other"),
  ];
  for (const mutation of cases) {
    await assert.rejects(
      harness(mutation).execute(),
      InternalServerErrorException,
    );
  }
});

test("mismatched source versions or stored comparison snapshots fail closed", async () => {
  const cases = [
    ({ comparison }: any) => (comparison.firstSubmissionVersion = 2),
    ({ referral }: any) => (referral.comparisonVersionSnapshot = 2),
    ({ comparison }: any) => (comparison.firstTotalSnapshot = decimal("40.01")),
    ({ comparison }: any) =>
      (comparison.summativeFullMarkSnapshot = decimal("99")),
  ];
  for (const mutation of cases) {
    await assert.rejects(
      harness(mutation).execute(),
      InternalServerErrorException,
    );
  }
});

test("mismatched referral rule snapshot or exact Third actor fails closed", async () => {
  const ruleMismatch = harness(({ referral }) => {
    referral.ruleVersionCode = "SUMMATIVE_FS_VARIANCE_OTHER";
  });
  await assert.rejects(ruleMismatch.execute(), InternalServerErrorException);

  const actorMismatch = harness();
  await assert.rejects(
    actorMismatch.execute({ actorUserId: "different-third-examiner" }),
    InternalServerErrorException,
  );
});

test("malformed Third question-mark chain fails closed", async () => {
  const cases = [
    ({ third }: any) => third.questionMarks.pop(),
    ({ third }: any) => (third.questionMarks[0].awardedMark = decimal("41")),
    ({ third }: any) =>
      (third.questionMarks[0].questionConfigurationId = "other"),
    ({ third }: any) => (third.questionMarks[0].questionItemId = "other"),
  ];
  for (const mutation of cases) {
    await assert.rejects(
      harness(mutation).execute(),
      InternalServerErrorException,
    );
  }
});

test("same exact source triplet is idempotent with one row and one success audit", async () => {
  const h = harness();
  const first = await h.execute();
  const repeated = await h.execute();
  assert.equal(repeated.id, first.id);
  assert.equal(h.state.calculations.length, 1);
  assert.equal(h.state.audits.length, 1);
});

test("serialized duplicate attempts converge at the candidate boundary; real PostgreSQL concurrency remains runtime-pending", async () => {
  const h = harness();
  const [first, second] = await Promise.all([h.execute(), h.execute()]);
  assert.equal(first.id, second.id);
  assert.equal(h.state.calculations.length, 1);
  assert.equal(h.state.audits.length, 1);
  assert.match(h.state.rawSql[0] ?? "", /summative_examination_candidates/);
});

test("a later different Third source receives a later version without overwriting history", async () => {
  const h = harness();
  await h.execute();
  h.state.fixture.third.id = "third-b";
  h.state.fixture.third.versionNumber = 2;
  const later = await h.execute({ thirdSubmissionId: "third-b" });
  assert.equal(later.calculationVersion, 2);
  assert.equal(h.state.calculations.length, 2);
  assert.equal(h.state.calculations[0]?.thirdSubmissionId, "third-a");
});

test("calculation audit failure rolls the evidence insert back and retry succeeds", async () => {
  const h = harness();
  h.state.failAudit = true;
  await assert.rejects(h.execute(), /simulated calculation audit failure/);
  assert.equal(h.state.calculations.length, 0);
  h.state.failAudit = false;
  await h.execute();
  assert.equal(h.state.calculations.length, 1);
});

test("calculation audit is structural and contains no marks, distances or derived value", async () => {
  const h = harness();
  await h.execute();
  const audit = JSON.stringify(h.state.audits[0]);
  assert.equal(
    h.state.audits[0]?.action,
    "summative-examination.three-total-calculation.created",
  );
  assert.doesNotMatch(
    audit,
    /firstTotal|secondTotal|thirdTotal|Distance|derivedSummative|questionMarks|awardedMark|40|51|60|55\.5/,
  );
});
