import assert from "node:assert/strict";
import test from "node:test";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import {
  ExaminationCourseExaminerSeat,
  Prisma,
  SummativeExaminerMarkSubmissionStatus,
  SummativeQuestionConfigurationStatus,
} from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import type { ExaminerMarkingAuthority } from "./examiner-authority.service";
import { SummativeExaminerMarksService } from "./summative-examiner-marks.service";

interface TestSubmission {
  id: string;
  departmentId: string;
  examinationId: string;
  examinationCourseId: string;
  candidateId: string;
  examinerAssignmentId: string;
  examinerSeat: ExaminationCourseExaminerSeat;
  questionConfigurationId: string;
  versionNumber: number;
  status: SummativeExaminerMarkSubmissionStatus;
  totalMark: Prisma.Decimal | null;
  submittedAt: Date | null;
  lockedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TestMark {
  id: string;
  departmentId: string;
  examinationCourseId: string;
  submissionId: string;
  questionConfigurationId: string;
  questionItemId: string;
  awardedMark: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
}

const fixedAt = new Date("2026-08-30T12:00:00.000Z");

function authority(
  seat: ExaminationCourseExaminerSeat =
    ExaminationCourseExaminerSeat.FIRST_EXAMINER,
): ExaminerMarkingAuthority {
  const suffix = seat === ExaminationCourseExaminerSeat.FIRST_EXAMINER ? "first" : "second";
  return {
    departmentId: "department-a",
    actorUserId: `examiner-${suffix}`,
    userRoleId: `teacher-user-role-${suffix}`,
    roleId: "teacher-role-a",
    examinerAssignmentId: `assignment-${suffix}`,
    examinationId: "examination-a",
    examinationCourseId: "exam-course-a",
    seat,
  };
}

function submission(
  examinerAuthority: ExaminerMarkingAuthority,
  overrides: Partial<TestSubmission> = {},
): TestSubmission {
  return {
    id: `submission-${examinerAuthority.examinerAssignmentId}`,
    departmentId: examinerAuthority.departmentId,
    examinationId: examinerAuthority.examinationId,
    examinationCourseId: examinerAuthority.examinationCourseId,
    candidateId: "candidate-a",
    examinerAssignmentId: examinerAuthority.examinerAssignmentId,
    examinerSeat: examinerAuthority.seat,
    questionConfigurationId: "config-a",
    versionNumber: 1,
    status: SummativeExaminerMarkSubmissionStatus.DRAFT,
    totalMark: null,
    submittedAt: null,
    lockedAt: null,
    createdAt: fixedAt,
    updatedAt: fixedAt,
    ...overrides,
  };
}

function mark(
  targetSubmission: TestSubmission,
  questionItemId: string,
  awardedMark: string,
): TestMark {
  return {
    id: `mark-${targetSubmission.examinerAssignmentId}-${questionItemId}`,
    departmentId: targetSubmission.departmentId,
    examinationCourseId: targetSubmission.examinationCourseId,
    submissionId: targetSubmission.id,
    questionConfigurationId: targetSubmission.questionConfigurationId,
    questionItemId,
    awardedMark: new Prisma.Decimal(awardedMark),
    createdAt: fixedAt,
    updatedAt: fixedAt,
  };
}

function sqlText(query: unknown) {
  const value = query as { sql?: string; text?: string };
  return value.sql ?? value.text ?? String(query);
}

function sqlValues(query: unknown): unknown[] {
  return (query as { values?: unknown[] }).values ?? [];
}

function copySubmission(value: TestSubmission): TestSubmission {
  return {
    ...value,
    totalMark: value.totalMark ? new Prisma.Decimal(value.totalMark) : null,
    submittedAt: value.submittedAt ? new Date(value.submittedAt) : null,
    lockedAt: value.lockedAt ? new Date(value.lockedAt) : null,
    createdAt: new Date(value.createdAt),
    updatedAt: new Date(value.updatedAt),
  };
}

function copyMark(value: TestMark): TestMark {
  return {
    ...value,
    awardedMark: new Prisma.Decimal(value.awardedMark),
    createdAt: new Date(value.createdAt),
    updatedAt: new Date(value.updatedAt),
  };
}

function knownRequestError(code: string, meta?: Record<string, unknown>) {
  return new PrismaClientKnownRequestError("transaction failure", {
    code,
    clientVersion: "6.19.3",
    meta,
  });
}

function harness(options: {
  seat?: ExaminationCourseExaminerSeat;
  submissions?: TestSubmission[];
  marks?: TestMark[];
  authorityFailure?: Error;
  configurationStatus?: SummativeQuestionConfigurationStatus;
  configurationArchived?: boolean;
  lockedConfigurationId?: string | null;
  courseFullMark?: string;
  candidateIds?: string[];
  activeItems?: Array<{
    id: string;
    fullMark: string;
    isRequired: boolean;
  }>;
  transactionErrors?: Error[];
  comparisonFailure?: Error;
} = {}) {
  const currentAuthority = authority(options.seat);
  const activeItems = (
    options.activeItems ?? [
      { id: "question-a", fullMark: "10", isRequired: true },
      { id: "question-b", fullMark: "20", isRequired: true },
    ]
  ).map((item, index) => ({
    ...item,
    fullMark: new Prisma.Decimal(item.fullMark),
    questionLabel: `Q${index + 1}`,
    subQuestionLabel: null,
    displayOrder: index + 1,
    cloId: null,
    bloomLevel: null,
  }));
  const state = {
    submissions: (options.submissions ?? []).map(copySubmission),
    marks: (options.marks ?? []).map(copyMark),
    audits: [] as Array<Record<string, unknown>>,
    auditAttempts: 0,
    failNextAudit: false,
    authorityAssertions: 0,
    rawSql: [] as string[],
    submissionQueries: [] as Array<Record<string, unknown>>,
    transactionOptions: [] as unknown[],
    transactionErrors: [...(options.transactionErrors ?? [])],
    comparisonAttempts: 0,
    comparisonScopes: [] as Array<Record<string, string>>,
  };
  const candidateIds = options.candidateIds ?? ["candidate-a", "candidate-b"];

  function withMarks(value: TestSubmission) {
    return {
      ...copySubmission(value),
      questionMarks: state.marks
        .filter((candidateMark) => candidateMark.submissionId === value.id)
        .sort((a, b) => a.questionItemId.localeCompare(b.questionItemId))
        .map(copyMark),
    };
  }

  function matchesOwnSubmission(
    candidate: TestSubmission,
    where: Record<string, unknown>,
  ) {
    return (
      (!where.id || candidate.id === where.id) &&
      candidate.departmentId === where.departmentId &&
      candidate.examinationId === where.examinationId &&
      candidate.examinationCourseId === where.examinationCourseId &&
      candidate.candidateId === where.candidateId &&
      candidate.examinerAssignmentId === where.examinerAssignmentId &&
      candidate.examinerSeat === where.examinerSeat
    );
  }

  const tx = {
    $queryRaw: async (query: unknown) => {
      const sql = sqlText(query);
      const values = sqlValues(query);
      state.rawSql.push(sql);
      if (/FROM "examinations"/.test(sql)) return [{ id: "examination-a" }];
      if (/FROM "examination_courses"/.test(sql)) return [{ id: "exam-course-a" }];
      if (/FROM "summative_question_configurations"/.test(sql)) {
        return options.configurationStatus === SummativeQuestionConfigurationStatus.DRAFT ||
          options.configurationArchived ||
          options.lockedConfigurationId === "config-foreign"
          ? []
          : [{ id: "config-a" }];
      }
      if (/FROM "summative_examination_candidates"/.test(sql)) {
        const candidateId = candidateIds.find((id) => values.includes(id));
        return candidateId ? [{ id: candidateId }] : [];
      }
      if (/FROM "summative_examiner_mark_submissions"/.test(sql)) {
        const assignmentBound = /"examiner_assignment_id" =/.test(sql);
        return state.submissions
          .filter(
            (value) =>
              (assignmentBound
                ? value.examinerAssignmentId ===
                  currentAuthority.examinerAssignmentId
                : value.examinerSeat === currentAuthority.seat) &&
              values.includes(value.candidateId),
          )
          .map((value) => ({ id: value.id }));
      }
      if (/FROM "summative_question_configuration_items"/.test(sql)) {
        if (values.includes("question-foreign") || values.includes("question-inactive")) {
          return [];
        }
        return activeItems
          .filter((item) => !values.some((value) => String(value).startsWith("question-")) || values.includes(item.id))
          .map((item) => ({ id: item.id }));
      }
      if (/FROM "summative_examiner_question_marks"/.test(sql)) {
        return state.marks.map((value) => ({ id: value.id }));
      }
      return [];
    },
    examinationCourse: {
      findFirst: async () => ({
        id: "exam-course-a",
        examinationId: "examination-a",
        summativeFullMark: new Prisma.Decimal(options.courseFullMark ?? "30"),
        markingDeadline: fixedAt,
        lockedQuestionConfigurationId:
          options.lockedConfigurationId === undefined
            ? "config-a"
            : options.lockedConfigurationId,
        lockedQuestionConfiguration: {
          id: "config-a",
          versionNumber: 3,
          status:
            options.configurationStatus ??
            SummativeQuestionConfigurationStatus.LOCKED,
          lockedAt: fixedAt,
          items: activeItems,
        },
      }),
    },
    summativeQuestionConfiguration: {
      findFirst: async () =>
        options.configurationStatus === SummativeQuestionConfigurationStatus.DRAFT ||
        options.configurationArchived ||
        options.lockedConfigurationId === null ||
        options.lockedConfigurationId === "config-foreign"
          ? null
          : {
              id: "config-a",
              versionNumber: 3,
              status: SummativeQuestionConfigurationStatus.LOCKED,
            },
    },
    summativeExaminationCandidate: {
      findFirst: async (args: { where: { id: string } }) =>
        candidateIds.includes(args.where.id) ? { id: args.where.id } : null,
      findMany: async () =>
        candidateIds.map((id) => ({ id, registeredAt: fixedAt })),
    },
    summativeExaminerMarkSubmission: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        state.submissionQueries.push(args.where);
        const found = state.submissions
          .filter((candidate) => matchesOwnSubmission(candidate, args.where))
          .sort((a, b) => b.versionNumber - a.versionNumber)[0];
        return found ? withMarks(found) : null;
      },
      findMany: async (args: { where: Record<string, unknown> }) => {
        state.submissionQueries.push(args.where);
        const candidateFilter = (args.where.candidateId as { in?: string[] } | undefined)?.in;
        return state.submissions
          .filter(
            (candidate) =>
              candidate.departmentId === args.where.departmentId &&
              candidate.examinationId === args.where.examinationId &&
              candidate.examinationCourseId === args.where.examinationCourseId &&
              candidate.examinerAssignmentId === args.where.examinerAssignmentId &&
              (!candidateFilter || candidateFilter.includes(candidate.candidateId)),
          )
          .sort((a, b) =>
            a.candidateId === b.candidateId
              ? b.versionNumber - a.versionNumber
              : a.candidateId.localeCompare(b.candidateId),
          )
          .map(withMarks);
      },
      create: async (args: { data: Omit<TestSubmission, "id" | "totalMark" | "submittedAt" | "lockedAt" | "createdAt" | "updatedAt"> }) => {
        const created: TestSubmission = {
          ...args.data,
          id: `submission-${args.data.examinerAssignmentId}`,
          totalMark: null,
          submittedAt: null,
          lockedAt: null,
          createdAt: fixedAt,
          updatedAt: fixedAt,
        };
        state.submissions.push(created);
        return withMarks(created);
      },
      updateMany: async (args: {
        where: Record<string, unknown>;
        data: {
          status: SummativeExaminerMarkSubmissionStatus;
          totalMark: Prisma.Decimal;
          submittedAt: Date;
          lockedAt: Date;
        };
      }) => {
        const target = state.submissions.find(
          (candidate) =>
            candidate.id === args.where.id &&
            candidate.status === args.where.status &&
            candidate.examinerAssignmentId === args.where.examinerAssignmentId,
        );
        if (!target) return { count: 0 };
        Object.assign(target, args.data, { updatedAt: fixedAt });
        return { count: 1 };
      },
    },
    summativeQuestionConfigurationItem: {
      findFirst: async (args: { where: { id: string } }) => {
        if (args.where.id === "question-inactive" || args.where.id === "question-foreign") {
          return null;
        }
        return activeItems.find((item) => item.id === args.where.id) ?? null;
      },
      findMany: async () => activeItems,
    },
    summativeExaminerQuestionMark: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        const found = state.marks.find(
          (candidate) =>
            candidate.submissionId === args.where.submissionId &&
            candidate.questionItemId === args.where.questionItemId,
        );
        return found ? { id: found.id } : null;
      },
      findMany: async (args: { where: { submissionId: string } }) =>
        state.marks
          .filter((candidate) => candidate.submissionId === args.where.submissionId)
          .sort((a, b) => a.questionItemId.localeCompare(b.questionItemId))
          .map((value) => ({
            questionItemId: value.questionItemId,
            awardedMark: value.awardedMark,
          })),
      create: async (args: { data: Omit<TestMark, "id" | "createdAt" | "updatedAt"> }) => {
        const created: TestMark = {
          ...args.data,
          id: `mark-${args.data.submissionId}-${args.data.questionItemId}`,
          createdAt: fixedAt,
          updatedAt: fixedAt,
        };
        state.marks.push(created);
        return created;
      },
      update: async (args: { where: { id: string }; data: { awardedMark: Prisma.Decimal } }) => {
        const target = state.marks.find((candidate) => candidate.id === args.where.id)!;
        target.awardedMark = args.data.awardedMark;
        target.updatedAt = fixedAt;
        return target;
      },
      delete: async (args: { where: { id: string } }) => {
        const index = state.marks.findIndex((candidate) => candidate.id === args.where.id);
        return state.marks.splice(index, 1)[0];
      },
    },
    auditLog: {
      create: async (args: { data: Record<string, unknown> }) => {
        state.auditAttempts += 1;
        if (state.failNextAudit) {
          state.failNextAudit = false;
          throw new Error("simulated audit failure");
        }
        state.audits.push(args.data);
        return args.data;
      },
    },
  };

  let transactionTail = Promise.resolve();
  const prisma = {
    ...tx,
    $transaction: async (
      callback: (client: typeof tx) => Promise<unknown>,
      transactionOptions: unknown,
    ) => {
      state.transactionOptions.push(transactionOptions);
      const preceding = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await preceding;
      const configuredError = state.transactionErrors.shift();
      if (configuredError) {
        release();
        throw configuredError;
      }
      const submissionsBefore = state.submissions.map(copySubmission);
      const marksBefore = state.marks.map(copyMark);
      const auditsBefore = state.audits.map((audit) => ({ ...audit }));
      try {
        return await callback(tx);
      } catch (error) {
        state.submissions.splice(0, state.submissions.length, ...submissionsBefore);
        state.marks.splice(0, state.marks.length, ...marksBefore);
        state.audits.splice(0, state.audits.length, ...auditsBefore);
        throw error;
      } finally {
        release();
      }
    },
  };
  const examinerAuthority = {
    authorizeMarking: async (examinationCourseId: string) => {
      if (examinationCourseId !== currentAuthority.examinationCourseId) {
        throw new ForbiddenException("Examiner marking access denied");
      }
      return currentAuthority;
    },
    assertCurrentMarkingAuthority: async () => {
      state.authorityAssertions += 1;
      if (options.authorityFailure) throw options.authorityFailure;
    },
  };
  const examinerComparison = {
    createIfReady: async (
      _tx: unknown,
      comparisonScope: Record<string, string>,
    ) => {
      state.comparisonAttempts += 1;
      state.comparisonScopes.push(comparisonScope);
      if (options.comparisonFailure) throw options.comparisonFailure;
      return null;
    },
  };
  const service = new SummativeExaminerMarksService(
    prisma as never,
    {
      get: () => ({
        requestId: "request-a",
        audit: { ipAddress: "127.0.0.1", userAgent: "test-agent" },
      }),
    } as never,
    examinerAuthority as never,
    examinerComparison as never,
  );
  return { state, service, authority: currentAuthority };
}

test("workspace returns only the authenticated assignment's submissions and never the other Examiner", async () => {
  const firstAuthority = authority(ExaminationCourseExaminerSeat.FIRST_EXAMINER);
  const secondAuthority = authority(ExaminationCourseExaminerSeat.SECOND_EXAMINER);
  const first = submission(firstAuthority, {
    status: SummativeExaminerMarkSubmissionStatus.LOCKED,
    totalMark: new Prisma.Decimal("17.5"),
    submittedAt: fixedAt,
    lockedAt: fixedAt,
  });
  const second = submission(secondAuthority, { id: "submission-second-secret" });
  const h = harness({
    submissions: [first, second],
    marks: [mark(first, "question-a", "7.5"), mark(first, "question-b", "10")],
  });
  const workspace = await h.service.getWorkspace("exam-course-a");
  const serialized = JSON.stringify(workspace);
  assert.match(serialized, /submission-assignment-first/);
  assert.doesNotMatch(serialized, /submission-second-secret|assignment-second|examiner-second/);
  assert.ok(
    h.state.submissionQueries.every(
      (query) => query.examinerAssignmentId === "assignment-first",
    ),
  );
});

test("workspace remains blind for every First/Second draft and locked combination", async () => {
  for (const firstStatus of [
    SummativeExaminerMarkSubmissionStatus.DRAFT,
    SummativeExaminerMarkSubmissionStatus.LOCKED,
  ]) {
    for (const secondStatus of [
      SummativeExaminerMarkSubmissionStatus.DRAFT,
      SummativeExaminerMarkSubmissionStatus.LOCKED,
    ]) {
      const first = submission(authority(), {
        status: firstStatus,
        totalMark:
          firstStatus === SummativeExaminerMarkSubmissionStatus.LOCKED
            ? new Prisma.Decimal("10")
            : null,
        submittedAt:
          firstStatus === SummativeExaminerMarkSubmissionStatus.LOCKED
            ? fixedAt
            : null,
        lockedAt:
          firstStatus === SummativeExaminerMarkSubmissionStatus.LOCKED
            ? fixedAt
            : null,
      });
      const second = submission(
        authority(ExaminationCourseExaminerSeat.SECOND_EXAMINER),
        {
          id: `second-secret-${secondStatus}`,
          status: secondStatus,
          totalMark:
            secondStatus === SummativeExaminerMarkSubmissionStatus.LOCKED
              ? new Prisma.Decimal("20")
              : null,
          submittedAt:
            secondStatus === SummativeExaminerMarkSubmissionStatus.LOCKED
              ? fixedAt
              : null,
          lockedAt:
            secondStatus === SummativeExaminerMarkSubmissionStatus.LOCKED
              ? fixedAt
              : null,
        },
      );
      const workspace = await harness({ submissions: [first, second] }).service
        .getWorkspace("exam-course-a");
      const serialized = JSON.stringify(workspace);
      assert.match(serialized, new RegExp(first.id));
      assert.doesNotMatch(
        serialized,
        /second-secret|assignment-second|SECOND_EXAMINER/,
      );

      const secondWorkspace = await harness({
        seat: ExaminationCourseExaminerSeat.SECOND_EXAMINER,
        submissions: [first, second],
      }).service.getWorkspace("exam-course-a");
      const secondSerialized = JSON.stringify(secondWorkspace);
      assert.match(secondSerialized, new RegExp(second.id));
      assert.doesNotMatch(
        secondSerialized,
        new RegExp(`${first.id}|assignment-first|FIRST_EXAMINER`),
      );
    }
  }
});

test("own submission reads are assignment-bound and direct foreign candidates are safe not-found", async () => {
  const first = submission(authority());
  const h = harness({ submissions: [first], candidateIds: ["candidate-a"] });
  const own = await h.service.getOwnSubmission("exam-course-a", "candidate-a");
  assert.equal(own.submission?.id, first.id);
  assert.equal(
    h.state.submissionQueries.at(-1)?.examinerAssignmentId,
    "assignment-first",
  );
  await assert.rejects(
    h.service.getOwnSubmission("exam-course-a", "candidate-foreign"),
    NotFoundException,
  );
});

test("first exact draft mark creates one versioned own submission and preserves zero", async () => {
  const h = harness();
  const result = await h.service.saveQuestionMark(
    "exam-course-a",
    "candidate-a",
    "question-a",
    { awardedMark: "0.00" },
  );
  assert.equal(h.state.submissions.length, 1);
  assert.equal(h.state.submissions[0]?.versionNumber, 1);
  assert.equal(h.state.submissions[0]?.status, "DRAFT");
  assert.equal(h.state.marks[0]?.awardedMark.toString(), "0");
  assert.equal(result.submission?.questionMarks[0]?.awardedMark, "0");
  assert.equal(result.submission?.calculatedTotal, "0");
  assert.deepEqual(
    h.state.audits.map((audit) => audit.action),
    [
      "summative-examination.examiner-mark-submission.draft-created",
      "summative-examination.examiner-question-mark.saved",
    ],
  );
});

test("partial draft updates own existing mark without duplicate rows", async () => {
  const own = submission(authority());
  const h = harness({ submissions: [own], marks: [mark(own, "question-a", "5")] });
  await h.service.saveQuestionMark(
    "exam-course-a",
    "candidate-a",
    "question-a",
    { awardedMark: "7.50" },
  );
  assert.equal(h.state.submissions.length, 1);
  assert.equal(h.state.marks.length, 1);
  assert.equal(h.state.marks[0]?.awardedMark.toString(), "7.5");
  const auditContext = h.state.audits[0]?.contextJson as Record<string, unknown>;
  assert.equal(auditContext.mutation, "UPDATE");
  assert.equal(Object.hasOwn(auditContext, "awardedMark"), false);
});

test("explicit null clears only a draft mark, while omission changes nothing", async () => {
  const own = submission(authority());
  const h = harness({ submissions: [own], marks: [mark(own, "question-a", "5")] });
  const omitted = await h.service.saveQuestionMark(
    "exam-course-a",
    "candidate-a",
    "question-a",
    {},
  );
  assert.equal(h.state.marks.length, 1);
  assert.equal(h.state.audits.length, 0);
  assert.equal(omitted.submission?.questionMarks.length, 1);
  await h.service.saveQuestionMark(
    "exam-course-a",
    "candidate-a",
    "question-a",
    { awardedMark: null },
  );
  assert.equal(h.state.marks.length, 0);
  assert.equal(
    h.state.audits[0]?.action,
    "summative-examination.examiner-question-mark.cleared",
  );
});

test("above-full, negative, malformed, excessive-scale, exponent and numeric values fail", async () => {
  const own = submission(authority());
  for (const awardedMark of ["10.01", "-1", "1.001", "1e1", "NaN", 7]) {
    const h = harness({ submissions: [own] });
    await assert.rejects(
      h.service.saveQuestionMark(
        "exam-course-a",
        "candidate-a",
        "question-a",
        { awardedMark } as never,
      ),
      BadRequestException,
    );
    assert.equal(h.state.marks.length, 0);
  }
});

test("inactive, foreign and different-configuration question IDs fail safely", async () => {
  const own = submission(authority());
  for (const questionItemId of ["question-inactive", "question-foreign"]) {
    const h = harness({ submissions: [own] });
    await assert.rejects(
      h.service.saveQuestionMark(
        "exam-course-a",
        "candidate-a",
        questionItemId,
        { awardedMark: "1" },
      ),
      NotFoundException,
    );
  }
});

test("draft, archived, absent and different authoritative configurations are rejected", async () => {
  for (const options of [
    { configurationStatus: SummativeQuestionConfigurationStatus.DRAFT },
    { configurationArchived: true },
    { lockedConfigurationId: null },
    { lockedConfigurationId: "config-foreign" },
  ]) {
    const h = harness(options);
    await assert.rejects(
      h.service.saveQuestionMark(
        "exam-course-a",
        "candidate-a",
        "question-a",
        { awardedMark: "1" },
      ),
      NotFoundException,
    );
  }
});

test("transactional authority loss aborts the protected write before mutation", async () => {
  const h = harness({ authorityFailure: new ForbiddenException("revoked") });
  await assert.rejects(
    h.service.saveQuestionMark(
      "exam-course-a",
      "candidate-a",
      "question-a",
      { awardedMark: "1" },
    ),
    ForbiddenException,
  );
  assert.equal(h.state.submissions.length, 0);
  assert.equal(h.state.marks.length, 0);
});

test("concurrent first-draft saves serialize into one submission and one question row", async () => {
  const h = harness();
  await Promise.all([
    h.service.saveQuestionMark(
      "exam-course-a",
      "candidate-a",
      "question-a",
      { awardedMark: "5" },
    ),
    h.service.saveQuestionMark(
      "exam-course-a",
      "candidate-a",
      "question-a",
      { awardedMark: "7" },
    ),
  ]);
  assert.equal(h.state.submissions.length, 1);
  assert.equal(h.state.marks.length, 1);
  assert.equal(h.state.marks[0]?.awardedMark.toString(), "7");
});

test("a replacement assignment cannot create another version one for the same Examiner seat", async () => {
  const prior = submission(authority(), {
    id: "submission-prior-first",
    examinerAssignmentId: "assignment-prior-first",
    status: SummativeExaminerMarkSubmissionStatus.LOCKED,
    totalMark: new Prisma.Decimal("20"),
    submittedAt: fixedAt,
    lockedAt: fixedAt,
  });
  const h = harness({ submissions: [prior] });
  await assert.rejects(
    h.service.saveQuestionMark(
      "exam-course-a",
      "candidate-a",
      "question-a",
      { awardedMark: "5" },
    ),
    ConflictException,
  );
  assert.equal(h.state.submissions.length, 1);
  assert.equal(h.state.marks.length, 0);
  assert.equal(h.state.audits.length, 0);
});

test("missing required mark blocks finalization but actual zero counts as present", async () => {
  const own = submission(authority());
  const h = harness({ submissions: [own], marks: [mark(own, "question-a", "0")] });
  await assert.rejects(
    h.service.finalizeSubmission("exam-course-a", "candidate-a"),
    BadRequestException,
  );
  h.state.marks.push(mark(own, "question-b", "20"));
  const locked = await h.service.finalizeSubmission("exam-course-a", "candidate-a");
  assert.equal(locked.submission?.status, "LOCKED");
  assert.equal(locked.submission?.totalMark, "20");
});

test("an optional active item may be omitted or marked without becoming required", async () => {
  const own = submission(authority());
  const items = [
    { id: "question-a", fullMark: "10", isRequired: true },
    { id: "question-optional", fullMark: "20", isRequired: false },
  ];
  const omitted = harness({
    submissions: [own],
    marks: [mark(own, "question-a", "10")],
    activeItems: items,
  });
  const omittedResult = await omitted.service.finalizeSubmission(
    "exam-course-a",
    "candidate-a",
  );
  assert.equal(omittedResult.submission?.totalMark, "10");

  const ownWithOptional = submission(authority());
  const included = harness({
    submissions: [ownWithOptional],
    marks: [
      mark(ownWithOptional, "question-a", "10"),
      mark(ownWithOptional, "question-optional", "20"),
    ],
    activeItems: items,
  });
  const includedResult = await included.service.finalizeSubmission(
    "exam-course-a",
    "candidate-a",
  );
  assert.equal(includedResult.submission?.totalMark, "30");
});

test("final submission calculates an exact Decimal total on a non-60 course and locks atomically", async () => {
  const own = submission(authority());
  const h = harness({
    submissions: [own],
    marks: [mark(own, "question-a", "7.50"), mark(own, "question-b", "20")],
    courseFullMark: "30",
  });
  const result = await h.service.finalizeSubmission(
    "exam-course-a",
    "candidate-a",
  );
  assert.equal(result.submission?.calculatedTotal, "27.5");
  assert.equal(result.submission?.totalMark, "27.5");
  assert.equal(result.submission?.status, "LOCKED");
  assert.equal(result.submission?.questionConfigurationId, "config-a");
  assert.equal(result.submission?.versionNumber, 1);
  assert.ok(result.submission?.submittedAt);
  assert.ok(result.submission?.lockedAt);
  assert.equal(h.state.authorityAssertions, 1);
  const audit = h.state.audits[0]!;
  assert.equal(
    audit.action,
    "summative-examination.examiner-mark-submission.locked",
  );
  assert.doesNotMatch(JSON.stringify(audit), /27\.5|awardedMark|questionMarks/);
});

test("finalization rejects an authoritative course cap below the persisted Decimal sum", async () => {
  const own = submission(authority());
  const h = harness({
    submissions: [own],
    marks: [mark(own, "question-a", "10"), mark(own, "question-b", "20")],
    courseFullMark: "25",
  });
  await assert.rejects(
    h.service.finalizeSubmission("exam-course-a", "candidate-a"),
    BadRequestException,
  );
  assert.equal(h.state.submissions[0]?.status, "DRAFT");
});

test("locked submissions reject edit and clear; repeat submit is idempotent without a second audit", async () => {
  const own = submission(authority(), {
    status: SummativeExaminerMarkSubmissionStatus.LOCKED,
    totalMark: new Prisma.Decimal("20"),
    submittedAt: fixedAt,
    lockedAt: fixedAt,
  });
  const h = harness({
    submissions: [own],
    marks: [mark(own, "question-a", "0"), mark(own, "question-b", "20")],
  });
  for (const awardedMark of ["1", null]) {
    await assert.rejects(
      h.service.saveQuestionMark(
        "exam-course-a",
        "candidate-a",
        "question-a",
        { awardedMark },
      ),
      ConflictException,
    );
  }
  const repeated = await h.service.finalizeSubmission(
    "exam-course-a",
    "candidate-a",
  );
  assert.equal(repeated.submission?.id, own.id);
  assert.equal(h.state.submissions.length, 1);
  assert.equal(h.state.audits.length, 0);
});

test("audit failure rolls initial draft plus mark creation back in the fake transaction", async () => {
  const h = harness();
  h.state.failNextAudit = true;
  await assert.rejects(
    h.service.saveQuestionMark(
      "exam-course-a",
      "candidate-a",
      "question-a",
      { awardedMark: "5" },
    ),
    /simulated audit failure/,
  );
  assert.equal(h.state.submissions.length, 0);
  assert.equal(h.state.marks.length, 0);
  assert.equal(h.state.audits.length, 0);
});

test("audit failure rolls mark update back in the fake transaction", async () => {
  const own = submission(authority());
  const h = harness({ submissions: [own], marks: [mark(own, "question-a", "5")] });
  h.state.failNextAudit = true;
  await assert.rejects(
    h.service.saveQuestionMark(
      "exam-course-a",
      "candidate-a",
      "question-a",
      { awardedMark: "7" },
    ),
    /simulated audit failure/,
  );
  assert.equal(h.state.marks[0]?.awardedMark.toString(), "5");
});

test("audit failure rolls explicit draft clear back in the fake transaction", async () => {
  const own = submission(authority());
  const h = harness({ submissions: [own], marks: [mark(own, "question-a", "5")] });
  h.state.failNextAudit = true;
  await assert.rejects(
    h.service.saveQuestionMark(
      "exam-course-a",
      "candidate-a",
      "question-a",
      { awardedMark: null },
    ),
    /simulated audit failure/,
  );
  assert.equal(h.state.marks.length, 1);
});

test("audit failure rolls final lock and calculated total back in the fake transaction", async () => {
  const own = submission(authority());
  const h = harness({
    submissions: [own],
    marks: [mark(own, "question-a", "10"), mark(own, "question-b", "20")],
  });
  h.state.failNextAudit = true;
  await assert.rejects(
    h.service.finalizeSubmission("exam-course-a", "candidate-a"),
    /simulated audit failure/,
  );
  assert.equal(h.state.submissions[0]?.status, "DRAFT");
  assert.equal(h.state.submissions[0]?.totalMark, null);
  assert.equal(h.state.submissions[0]?.submittedAt, null);
  assert.equal(h.state.submissions[0]?.lockedAt, null);
});

test("finalization invokes internal comparison creation without widening the blind response", async () => {
  const own = submission(authority());
  const h = harness({
    submissions: [own],
    marks: [mark(own, "question-a", "10"), mark(own, "question-b", "20")],
  });
  const result = await h.service.finalizeSubmission(
    "exam-course-a",
    "candidate-a",
  );
  assert.equal(h.state.comparisonAttempts, 1);
  assert.deepEqual(h.state.comparisonScopes[0], {
    departmentId: "department-a",
    actorUserId: "examiner-first",
    examinationId: "examination-a",
    examinationCourseId: "exam-course-a",
    candidateId: "candidate-a",
  });
  assert.doesNotMatch(
    JSON.stringify(result),
    /comparison|variance|absoluteDifference|threshold|third/i,
  );
});

test("repeat finalization rechecks the exact source pair idempotently and emits no lock audit", async () => {
  const own = submission(authority(), {
    status: SummativeExaminerMarkSubmissionStatus.LOCKED,
    totalMark: new Prisma.Decimal("20"),
    submittedAt: fixedAt,
    lockedAt: fixedAt,
  });
  const h = harness({
    submissions: [own],
    marks: [mark(own, "question-a", "0"), mark(own, "question-b", "20")],
  });
  await h.service.finalizeSubmission("exam-course-a", "candidate-a");
  assert.equal(h.state.comparisonAttempts, 1);
  assert.equal(h.state.audits.length, 0);
});

test("required comparison or comparison-audit failure rolls the later final lock back", async () => {
  const own = submission(authority());
  const h = harness({
    submissions: [own],
    marks: [mark(own, "question-a", "10"), mark(own, "question-b", "20")],
    comparisonFailure: new Error("simulated comparison audit failure"),
  });
  await assert.rejects(
    h.service.finalizeSubmission("exam-course-a", "candidate-a"),
    /simulated comparison audit failure/,
  );
  assert.equal(h.state.submissions[0]?.status, "DRAFT");
  assert.equal(h.state.submissions[0]?.totalMark, null);
  assert.equal(h.state.audits.length, 0);
});

test("only recognized Serializable conflicts retry and attempts are bounded", async () => {
  const retry = harness({
    transactionErrors: [knownRequestError("P2034"), knownRequestError("P2034")],
  });
  await retry.service.saveQuestionMark(
    "exam-course-a",
    "candidate-a",
    "question-a",
    { awardedMark: "1" },
  );
  assert.equal(retry.state.transactionOptions.length, 3);
  assert.ok(
    retry.state.transactionOptions.every(
      (options) =>
        (options as { isolationLevel: string }).isolationLevel ===
        Prisma.TransactionIsolationLevel.Serializable,
    ),
  );

  const arbitrary = harness({ transactionErrors: [new Error("do not retry")] });
  await assert.rejects(
    arbitrary.service.saveQuestionMark(
      "exam-course-a",
      "candidate-a",
      "question-a",
      { awardedMark: "1" },
    ),
    /do not retry/,
  );
  assert.equal(arbitrary.state.transactionOptions.length, 1);

  const exhausted = harness({
    transactionErrors: [
      knownRequestError("P2034"),
      knownRequestError("P2034"),
      knownRequestError("P2034"),
    ],
  });
  await assert.rejects(
    exhausted.service.saveQuestionMark(
      "exam-course-a",
      "candidate-a",
      "question-a",
      { awardedMark: "1" },
    ),
  );
  assert.equal(exhausted.state.transactionOptions.length, 3);
});

test("write lock order is Examination, ExaminationCourse, authority, config, candidate, submission, mark rows", async () => {
  const own = submission(authority());
  const h = harness({ submissions: [own] });
  await h.service.saveQuestionMark(
    "exam-course-a",
    "candidate-a",
    "question-a",
    { awardedMark: "1" },
  );
  const order = h.state.rawSql.map((sql) => {
    if (/FROM "examinations"/.test(sql)) return "examination";
    if (/FROM "examination_courses"/.test(sql)) return "course";
    if (/FROM "summative_question_configurations"/.test(sql)) return "config";
    if (/FROM "summative_examination_candidates"/.test(sql)) return "candidate";
    if (/FROM "summative_examiner_mark_submissions"/.test(sql)) return "submission";
    if (/FROM "summative_question_configuration_items"/.test(sql)) return "item";
    if (/FROM "summative_examiner_question_marks"/.test(sql)) return "marks";
    return "other";
  });
  assert.deepEqual(order, [
    "examination",
    "course",
    "config",
    "candidate",
    "submission",
    "item",
    "marks",
  ]);
  assert.equal(h.state.authorityAssertions, 1);
});
