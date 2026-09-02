import assert from "node:assert/strict";
import test from "node:test";

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import {
  type ExaminationCourseExaminerAssignment,
  ExaminationCourseExaminerAssignmentStatus,
  ExaminationCourseExaminerSeat,
  SummativeExaminerComparisonDecision,
  SummativeThirdExaminationReferralStatus,
} from "@prisma/client";

import { SummativeThirdExaminationReferralsService } from "./summative-third-examination-referrals.service";

const authority = {
  actorUserId: "manager-a",
  departmentId: "department-a",
  userRoleId: "role-assignment-a",
  roleId: "role-a",
};

function harness(options: {
  missingComparison?: boolean;
  decision?: SummativeExaminerComparisonDecision;
  mismatchedConfiguration?: boolean;
  thirdExaminerUserId?: string;
  existingActive?: boolean;
  ineligibleTeacher?: boolean;
  failAudit?: boolean;
} = {}) {
  const assignment = (
    id: string,
    assignedUserId: string,
    seat: ExaminationCourseExaminerSeat,
  ): ExaminationCourseExaminerAssignment => ({
    id,
    departmentId: "department-a",
    examinationId: "examination-a",
    examinationCourseId: "course-a",
    assignedUserId,
    assignedByUserId: "manager-a",
    seat,
    status: ExaminationCourseExaminerAssignmentStatus.ACTIVE,
    assignedAt: new Date("2098-01-01T00:00:00.000Z"),
    expiresAt: null,
    unassignedAt: null,
    archivedAt: null,
    createdAt: new Date("2098-01-01T00:00:00.000Z"),
    updatedAt: new Date("2098-01-01T00:00:00.000Z"),
  });
  const firstSubmission = {
    id: "first-a",
    questionConfigurationId: "config-a",
    examinerAssignment: assignment(
      "first-assignment-a",
      "first-examiner-a",
      ExaminationCourseExaminerSeat.FIRST_EXAMINER,
    ),
  };
  const secondSubmission = {
    id: "second-a",
    questionConfigurationId: options.mismatchedConfiguration
      ? "config-b"
      : "config-a",
    examinerAssignment: assignment(
      "second-assignment-a",
      "second-examiner-a",
      ExaminationCourseExaminerSeat.SECOND_EXAMINER,
    ),
  };
  const comparison = {
    id: "comparison-a",
    departmentId: "department-a",
    examinationId: "examination-a",
    examinationCourseId: "course-a",
    candidateId: "candidate-a",
    comparisonVersion: 1,
    ruleVersionCode: "SUMMATIVE_FS_VARIANCE_15_PERCENT_V1",
    decision:
      options.decision ??
      SummativeExaminerComparisonDecision.THIRD_EXAMINATION_REQUIRED,
    firstSubmission,
    secondSubmission,
  };
  const state = {
    referrals: [] as any[],
    audits: [] as any[],
    rawSql: [] as string[],
  };
  const tx = {
    $queryRaw: async (query: any) => {
      const sql = query.sql ?? query.text ?? String(query);
      state.rawSql.push(sql);
      if (/FROM "summative_examiner_comparisons"/.test(sql)) {
        return options.missingComparison ? [] : [{ id: comparison.id }];
      }
      if (/FROM "users"/.test(sql)) {
        return options.ineligibleTeacher ? [] : [{ id: "third-examiner-a" }];
      }
      return [{ id: "scope-a" }];
    },
    summativeExaminerComparison: {
      findFirst: async () =>
        options.missingComparison
          ? null
          : {
              examinationId: comparison.examinationId,
              examinationCourseId: comparison.examinationCourseId,
              candidateId: comparison.candidateId,
            },
      findUnique: async () => (options.missingComparison ? null : comparison),
    },
    summativeThirdExaminationReferral: {
      findFirst: async () =>
        options.existingActive
          ? { assignmentVersion: 1, status: SummativeThirdExaminationReferralStatus.ASSIGNED }
          : state.referrals.at(-1) ?? null,
      create: async ({ data }: any) => {
        const referral = {
          id: `referral-${state.referrals.length + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.referrals.push(referral);
        return referral;
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        if (options.failAudit) throw new Error("simulated referral audit failure");
        state.audits.push(data);
        return data;
      },
    },
  };
  const prisma = {
    $transaction: async (operation: (transaction: any) => Promise<any>) => {
      const beforeReferrals = [...state.referrals];
      const beforeAudits = [...state.audits];
      try {
        return await operation(tx);
      } catch (error) {
        state.referrals.splice(0, state.referrals.length, ...beforeReferrals);
        state.audits.splice(0, state.audits.length, ...beforeAudits);
        throw error;
      }
    },
  };
  const service = new SummativeThirdExaminationReferralsService(
    prisma as never,
    {
      get: () => ({ audit: { ipAddress: "127.0.0.1", userAgent: "test" } }),
    } as never,
    { authorize: async () => authority } as never,
  );
  const dto = {
    comparisonId: comparison.id,
    thirdExaminerUserId:
      options.thirdExaminerUserId ?? "third-examiner-a",
    deadline: new Date("2099-01-01T00:00:00.000Z"),
  };
  return { service, state, dto, comparison };
}

test("distinct active eligible Teacher receives exact candidate-scoped referral snapshots", async () => {
  const h = harness();
  const result = await h.service.assignThirdExaminer(h.dto);
  assert.equal(result.id, "referral-1");
  assert.equal(h.state.referrals.length, 1);
  const referral = h.state.referrals[0]!;
  assert.equal(referral.departmentId, "department-a");
  assert.equal(referral.examinationId, "examination-a");
  assert.equal(referral.examinationCourseId, "course-a");
  assert.equal(referral.candidateId, "candidate-a");
  assert.equal(referral.comparisonId, "comparison-a");
  assert.equal(referral.questionConfigurationId, "config-a");
  assert.equal(referral.comparisonVersionSnapshot, 1);
  assert.equal(referral.assignmentVersion, 1);
  assert.equal(referral.status, SummativeThirdExaminationReferralStatus.ASSIGNED);
  assert.equal(referral.thirdExaminerUserId, "third-examiner-a");
  assert.notEqual(
    referral.thirdExaminerUserId,
    h.comparison.firstSubmission.examinerAssignment.assignedUserId,
  );
  assert.notEqual(
    referral.thirdExaminerUserId,
    h.comparison.secondSubmission.examinerAssignment.assignedUserId,
  );
});

test("missing comparison is rejected", async () => {
  const missing = harness({ missingComparison: true });
  await assert.rejects(
    missing.service.assignThirdExaminer(missing.dto),
    NotFoundException,
  );
});

test("non-qualifying comparison is rejected", async () => {
  const h = harness({
    decision:
      SummativeExaminerComparisonDecision.THIRD_EXAMINATION_NOT_REQUIRED,
  });
  await assert.rejects(
    h.service.assignThirdExaminer(h.dto),
    BadRequestException,
  );
});

test("ambiguous First/Second question configuration is rejected", async () => {
  const h = harness({ mismatchedConfiguration: true });
  await assert.rejects(
    h.service.assignThirdExaminer(h.dto),
    BadRequestException,
  );
});

test("actual First Examiner assignedUserId cannot receive Third referral", async () => {
  const h = harness({ thirdExaminerUserId: "first-examiner-a" });
  await assert.rejects(
    h.service.assignThirdExaminer(h.dto),
    /Third Examiner cannot be the First or Second Examiner/,
  );
  assert.equal(h.state.referrals.length, 0);
});

test("actual Second Examiner assignedUserId cannot receive Third referral", async () => {
  const h = harness({ thirdExaminerUserId: "second-examiner-a" });
  await assert.rejects(
    h.service.assignThirdExaminer(h.dto),
    /Third Examiner cannot be the First or Second Examiner/,
  );
  assert.equal(h.state.referrals.length, 0);
});

test("ineligible Teacher cannot receive Third referral", async () => {
  const ineligible = harness({ ineligibleTeacher: true });
  await assert.rejects(
    ineligible.service.assignThirdExaminer(ineligible.dto),
    BadRequestException,
  );
});

test("past deadline is rejected before referral creation", async () => {
  const h = harness();
  h.dto.deadline = new Date("2000-01-01T00:00:00.000Z");
  await assert.rejects(
    h.service.assignThirdExaminer(h.dto),
    /Deadline must be in the future/,
  );
  assert.equal(h.state.referrals.length, 0);
});

test("active overlapping candidate referral is rejected", async () => {
  const h = harness({ existingActive: true });
  await assert.rejects(
    h.service.assignThirdExaminer(h.dto),
    ConflictException,
  );
});

test("referral assignment preserves examination-course-candidate-comparison lock order", async () => {
  const h = harness();
  await h.service.assignThirdExaminer(h.dto);
  assert.deepEqual(
    h.state.rawSql.slice(0, 4).map((sql) => {
      if (/FROM "examinations"/.test(sql)) return "examination";
      if (/FROM "examination_courses"/.test(sql)) return "course";
      if (/FROM "summative_examination_candidates"/.test(sql)) return "candidate";
      if (/FROM "summative_examiner_comparisons"/.test(sql)) return "comparison";
      return "other";
    }),
    ["examination", "course", "candidate", "comparison"],
  );
});

test("referral audit is structural-only and required audit failure rolls back", async () => {
  const h = harness();
  await h.service.assignThirdExaminer(h.dto);
  assert.equal(
    h.state.audits[0]?.action,
    "summative-examination.third-referral.assigned",
  );
  assert.doesNotMatch(
    JSON.stringify(h.state.audits[0]),
    /firstTotal|secondTotal|absoluteDifference|variancePercentage|questionMarks|awardedMark/,
  );

  const failing = harness({ failAudit: true });
  await assert.rejects(
    failing.service.assignThirdExaminer(failing.dto),
    /referral audit failure/,
  );
  assert.equal(failing.state.referrals.length, 0);
});
