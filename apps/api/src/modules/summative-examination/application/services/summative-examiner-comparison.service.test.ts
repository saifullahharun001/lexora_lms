import assert from "node:assert/strict";
import test from "node:test";

import { InternalServerErrorException } from "@nestjs/common";
import {
  ExaminationCourseExaminerSeat,
  Prisma,
  SummativeExaminerComparisonDecision,
  SummativeExaminerMarkSubmissionStatus,
} from "@prisma/client";

import { SummativeExaminerComparisonService } from "./summative-examiner-comparison.service";

const fixedAt = new Date("2026-09-01T12:00:00.000Z");
const scope = {
  departmentId: "department-a",
  actorUserId: "examiner-second",
  examinationId: "examination-a",
  examinationCourseId: "exam-course-a",
  candidateId: "candidate-a",
};

type SourceOverrides = Partial<ReturnType<typeof source>>;

function source(
  seat: ExaminationCourseExaminerSeat,
  totalMark: string | null,
  status: SummativeExaminerMarkSubmissionStatus =
    SummativeExaminerMarkSubmissionStatus.LOCKED,
) {
  const suffix =
    seat === ExaminationCourseExaminerSeat.FIRST_EXAMINER ? "first" : "second";
  return {
    id: `submission-${suffix}`,
    departmentId: scope.departmentId,
    examinationId: scope.examinationId,
    examinationCourseId: scope.examinationCourseId,
    candidateId: scope.candidateId,
    examinerAssignmentId: `assignment-${suffix}`,
    examinerSeat: seat,
    versionNumber: 1,
    status,
    totalMark: totalMark === null ? null : new Prisma.Decimal(totalMark),
    examinerAssignment: {
      departmentId: scope.departmentId,
      examinationId: scope.examinationId,
      examinationCourseId: scope.examinationCourseId,
      seat,
    },
  };
}

function withOverrides(
  value: ReturnType<typeof source>,
  overrides: SourceOverrides,
) {
  return { ...value, ...overrides };
}

function harness(options: {
  sources?: Array<ReturnType<typeof source>>;
  fullMark?: string;
  courseMissing?: boolean;
  candidateMissing?: boolean;
  existingComparisons?: Array<Record<string, unknown>>;
  failAudit?: boolean;
} = {}) {
  const state = {
    sources:
      options.sources ??
      [
        source(ExaminationCourseExaminerSeat.FIRST_EXAMINER, "51"),
        source(ExaminationCourseExaminerSeat.SECOND_EXAMINER, "49"),
      ],
    comparisons: [...(options.existingComparisons ?? [])],
    audits: [] as Array<Record<string, unknown>>,
    rawSql: [] as string[],
  };
  const tx = {
    $queryRaw: async (query: { sql?: string; text?: string }) => {
      const sql = query.sql ?? query.text ?? String(query);
      state.rawSql.push(sql);
      if (/FROM "summative_examination_candidates"/.test(sql)) {
        return options.candidateMissing ? [] : [{ id: scope.candidateId }];
      }
      return [];
    },
    examinationCourse: {
      findFirst: async () =>
        options.courseMissing
          ? null
          : { summativeFullMark: new Prisma.Decimal(options.fullMark ?? "60") },
    },
    summativeExaminerMarkSubmission: {
      findMany: async () => state.sources,
    },
    summativeExaminerComparison: {
      findFirst: async (args: {
        where: { firstSubmissionId: string; secondSubmissionId: string };
      }) =>
        state.comparisons.find(
          (comparison) =>
            comparison.firstSubmissionId === args.where.firstSubmissionId &&
            comparison.secondSubmissionId === args.where.secondSubmissionId,
        ) ?? null,
      findMany: async () =>
        state.comparisons.map((comparison) => ({
          comparisonVersion: comparison.comparisonVersion as number,
        })),
      create: async (args: { data: Record<string, unknown> }) => {
        const comparison = {
          id: `comparison-${state.comparisons.length + 1}`,
          createdAt: fixedAt,
          updatedAt: fixedAt,
          ...args.data,
        };
        state.comparisons.push(comparison);
        return comparison;
      },
    },
    auditLog: {
      create: async (args: { data: Record<string, unknown> }) => {
        if (options.failAudit) throw new Error("simulated audit failure");
        state.audits.push(args.data);
        return args.data;
      },
    },
  };
  const service = new SummativeExaminerComparisonService({
    get: () => ({
      requestId: "request-a",
      audit: { ipAddress: "127.0.0.1", userAgent: "test-agent" },
    }),
  } as never);
  let transactionTail = Promise.resolve();
  async function execute() {
    const preceding = transactionTail;
    let release!: () => void;
    transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await preceding;
    const comparisonsBefore = [...state.comparisons];
    const auditsBefore = [...state.audits];
    try {
      return await service.createIfReady(tx as never, scope);
    } catch (error) {
      state.comparisons.splice(0, state.comparisons.length, ...comparisonsBefore);
      state.audits.splice(0, state.audits.length, ...auditsBefore);
      throw error;
    } finally {
      release();
    }
  }
  return { execute, service, state, tx };
}

test("two exact LOCKED sources create one immutable-evidence payload and structural audit", async () => {
  const h = harness();
  const comparison = await h.execute();
  assert.equal(comparison?.firstSubmissionId, "submission-first");
  assert.equal(comparison?.secondSubmissionId, "submission-second");
  assert.equal(comparison?.firstSubmissionVersion, 1);
  assert.equal(comparison?.secondSubmissionVersion, 1);
  assert.equal(comparison?.comparisonVersion, 1);
  assert.equal(comparison?.firstTotalSnapshot.toString(), "51");
  assert.equal(comparison?.secondTotalSnapshot.toString(), "49");
  assert.equal(comparison?.summativeFullMarkSnapshot.toString(), "60");
  assert.equal(comparison?.absoluteDifference.toString(), "2");
  assert.equal(comparison?.variancePercentage.toFixed(6), "3.333333");
  assert.equal(comparison?.thresholdPercentageSnapshot.toFixed(2), "15.00");
  assert.equal(
    comparison?.decision,
    SummativeExaminerComparisonDecision.THIRD_EXAMINATION_NOT_REQUIRED,
  );
  assert.equal(h.state.audits.length, 1);
  assert.equal(
    h.state.audits[0]?.action,
    "summative-examination.examiner-comparison.created",
  );
  const audit = JSON.stringify(h.state.audits[0]);
  assert.doesNotMatch(
    audit,
    /firstTotal|secondTotal|absoluteDifference|variancePercentage|questionMarks|awardedMark/,
  );
});

test("missing or DRAFT First/Second source produces no comparison", async () => {
  const firstLocked = source(ExaminationCourseExaminerSeat.FIRST_EXAMINER, "51");
  const secondLocked = source(ExaminationCourseExaminerSeat.SECOND_EXAMINER, "49");
  const cases = [
    [secondLocked],
    [firstLocked],
    [
      source(
        ExaminationCourseExaminerSeat.FIRST_EXAMINER,
        null,
        SummativeExaminerMarkSubmissionStatus.DRAFT,
      ),
      secondLocked,
    ],
    [
      firstLocked,
      source(
        ExaminationCourseExaminerSeat.SECOND_EXAMINER,
        null,
        SummativeExaminerMarkSubmissionStatus.DRAFT,
      ),
    ],
  ];
  for (const sources of cases) {
    const h = harness({ sources });
    assert.equal(await h.execute(), null);
    assert.equal(h.state.comparisons.length, 0);
    assert.equal(h.state.audits.length, 0);
  }
});

test("exact source-pair creation is idempotent with one comparison and one audit", async () => {
  const h = harness();
  const first = await h.execute();
  const second = await h.execute();
  assert.equal(second?.id, first?.id);
  assert.equal(h.state.comparisons.length, 1);
  assert.equal(h.state.audits.length, 1);
});

test("simultaneous ready checks serialize at candidate scope and retain one comparison", async () => {
  const h = harness();
  const [first, second] = await Promise.all([h.execute(), h.execute()]);
  assert.equal(first?.id, second?.id);
  assert.equal(h.state.comparisons.length, 1);
  assert.equal(h.state.audits.length, 1);
  assert.match(h.state.rawSql[0] ?? "", /summative_examination_candidates/);
});

test("comparison preserves candidate-before-sources-before-comparison lock ordering", async () => {
  const h = harness();
  await h.execute();
  assert.deepEqual(
    h.state.rawSql.map((sql) => {
      if (/summative_examination_candidates/.test(sql)) return "candidate";
      if (/summative_examiner_mark_submissions/.test(sql)) return "sources";
      if (/summative_examiner_comparisons/.test(sql)) return "comparisons";
      return "other";
    }),
    ["candidate", "sources", "comparisons"],
  );
});

test("wrong seat, candidate, course or assignment binding fails closed", async () => {
  const validFirst = source(ExaminationCourseExaminerSeat.FIRST_EXAMINER, "51");
  const validSecond = source(ExaminationCourseExaminerSeat.SECOND_EXAMINER, "49");
  const invalidCases = [
    [
      withOverrides(validFirst, {
        examinerSeat: ExaminationCourseExaminerSeat.SECOND_EXAMINER,
      }),
      validSecond,
    ],
    [withOverrides(validFirst, { candidateId: "candidate-other" }), validSecond],
    [
      validFirst,
      withOverrides(validSecond, { examinationCourseId: "exam-course-other" }),
    ],
    [
      validFirst,
      withOverrides(validSecond, {
        examinerAssignment: {
          ...validSecond.examinerAssignment,
          seat: ExaminationCourseExaminerSeat.FIRST_EXAMINER,
        },
      }),
    ],
  ];
  for (const sources of invalidCases) {
    const h = harness({ sources });
    await assert.rejects(h.execute(), InternalServerErrorException);
    assert.equal(h.state.comparisons.length, 0);
  }
});

test("LOCKED source with null total fails closed", async () => {
  const h = harness({
    sources: [
      source(ExaminationCourseExaminerSeat.FIRST_EXAMINER, null),
      source(ExaminationCourseExaminerSeat.SECOND_EXAMINER, "49"),
    ],
  });
  await assert.rejects(h.execute(), InternalServerErrorException);
});

test("missing or nonpositive authoritative full mark fails closed", async () => {
  for (const options of [{ courseMissing: true }, { fullMark: "0" }, { fullMark: "-1" }]) {
    const h = harness(options);
    await assert.rejects(h.execute(), InternalServerErrorException);
  }
});

test("ambiguous source versions fail closed until a correction policy exists", async () => {
  const first = source(ExaminationCourseExaminerSeat.FIRST_EXAMINER, "51");
  const h = harness({
    sources: [
      first,
      withOverrides(first, { id: "submission-first-v2", versionNumber: 2 }),
      source(ExaminationCourseExaminerSeat.SECOND_EXAMINER, "49"),
    ],
  });
  await assert.rejects(h.execute(), InternalServerErrorException);
  assert.equal(h.state.comparisons.length, 0);
});

test("candidate scope corruption fails closed", async () => {
  const h = harness({ candidateMissing: true });
  await assert.rejects(h.execute(), InternalServerErrorException);
});

test("required comparison audit failure rolls comparison creation back", async () => {
  const h = harness({ failAudit: true });
  await assert.rejects(h.execute(), /simulated audit failure/);
  assert.equal(h.state.comparisons.length, 0);
  assert.equal(h.state.audits.length, 0);
});
