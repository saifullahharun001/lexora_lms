import assert from "node:assert/strict";
import test from "node:test";

import {
  ExaminationCommitteeAssignmentStatus,
  ExaminationCommitteeSeat,
  Prisma,
  SummativeCalculatedMarkPath,
  SummativeCommitteeMemberReviewOutcome,
  UserStatus,
} from "@prisma/client";

import type { SummativeCommitteeWorkflowAuthority } from "./summative-committee-workflow-authorizer.service";
import { SummativeCommitteeWorkflowService } from "./summative-committee-workflow.service";

const now = new Date("2026-09-02T10:00:00.000Z");
const appointedAt = new Date("2026-09-01T00:00:00.000Z");
type InternalMemberSeat =
  | typeof ExaminationCommitteeSeat.MEMBER_1
  | typeof ExaminationCommitteeSeat.MEMBER_2;

function authority(
  seat: ExaminationCommitteeSeat,
  assignmentAssignedAt = appointedAt,
): SummativeCommitteeWorkflowAuthority {
  return {
    departmentId: "department-a",
    actorUserId: `user-${seat}`,
    userRoleId: `user-role-${seat}`,
    roleId: "teacher-role-a",
    duty:
      seat === ExaminationCommitteeSeat.CHAIRMAN
        ? "CHAIRMAN_APPROVAL"
        : "MEMBER_REVIEW",
    calculatedMarkId: "calculated-a",
    examinationId: "examination-a",
    examinationCourseId: "course-a",
    candidateId: "candidate-a",
    committeeId: "committee-a",
    committeeAssignmentId: `assignment-${seat}`,
    seat,
    assignmentAssignedAt,
  };
}

const calculated = {
  id: "calculated-a",
  calculatedMarkVersion: 1,
  derivedSummativeValue: new Prisma.Decimal("40.015"),
  summativeFullMarkSnapshot: new Prisma.Decimal("100.00"),
  calculationPath: SummativeCalculatedMarkPath.FIRST_SECOND_AVERAGE,
  ruleVersionCode: "SUMMATIVE_FIRST_SECOND_AVERAGE_V1",
};

function review(
  seat: InternalMemberSeat,
  outcome: SummativeCommitteeMemberReviewOutcome =
    SummativeCommitteeMemberReviewOutcome.VERIFIED,
  assignedAt = appointedAt,
) {
  return {
    id: `review-${seat}-${assignedAt.getTime()}`,
    departmentId: "department-a",
    examinationId: "examination-a",
    examinationCourseId: "course-a",
    candidateId: "candidate-a",
    calculatedMarkId: "calculated-a",
    calculatedMarkVersionSnapshot: 1,
    committeeId: "committee-a",
    committeeAssignmentId: `assignment-${seat}`,
    reviewerUserId: `user-${seat}`,
    reviewerSeat: seat,
    assignmentAssignedAtSnapshot: assignedAt,
    reviewVersion: 1,
    outcome,
    reviewComment: outcome === SummativeCommitteeMemberReviewOutcome.VERIFIED ? null : "Correction required",
    reviewedAt: now,
    createdAt: now,
  };
}

function formalAppointments() {
  return [
    ExaminationCommitteeSeat.CHAIRMAN,
    ExaminationCommitteeSeat.MEMBER_1,
    ExaminationCommitteeSeat.MEMBER_2,
    ExaminationCommitteeSeat.EXTERNAL_MEMBER,
  ].map((seat) => {
    const external = seat === ExaminationCommitteeSeat.EXTERNAL_MEMBER;
    return {
      id: `assignment-${seat}`,
      assignedUserId: external ? null : `user-${seat}`,
      externalMemberName: external ? "External Scholar" : null,
      externalMemberAffiliation: external ? "Another University" : null,
      seat,
      status: ExaminationCommitteeAssignmentStatus.ACTIVE,
      assignedAt: appointedAt,
      assignedUser: external
        ? null
        : {
            id: `user-${seat}`,
            departmentId: "department-a",
            status: UserStatus.ACTIVE,
            archivedAt: null,
            deletedAt: null,
          },
    };
  });
}

function mutationHarness(options: {
  seat: ExaminationCommitteeSeat;
  existingReview?: ReturnType<typeof review> | null;
  reviews?: Array<ReturnType<typeof review>>;
  existingApproval?: Record<string, unknown> | null;
  appointments?: ReturnType<typeof formalAppointments>;
  auditFailure?: boolean;
  authorityAssignedAt?: Date;
}) {
  const resolvedAuthority = authority(
    options.seat,
    options.authorityAssignedAt,
  );
  const audits: Array<Record<string, unknown>> = [];
  const createdReviews: Array<Record<string, unknown>> = [];
  const createdApprovals: Array<Record<string, unknown>> = [];
  const tx = {
    $queryRaw: async () => [{ id: "locked" }],
    summativeCommitteeMemberReview: {
      findFirst: async (query: { where: Record<string, unknown> }) => {
        if ("assignmentAssignedAtSnapshot" in query.where) {
          const existing = options.existingReview ?? null;
          return existing &&
            existing.committeeAssignmentId ===
              query.where.committeeAssignmentId &&
            existing.assignmentAssignedAtSnapshot.getTime() ===
              (query.where.assignmentAssignedAtSnapshot as Date).getTime()
            ? existing
            : null;
        }
        return [...(options.reviews ?? [])]
          .filter(
            (candidate) =>
              candidate.reviewerSeat === query.where.reviewerSeat,
          )
          .sort((left, right) => right.reviewVersion - left.reviewVersion)[0] ??
          null;
      },
      findMany: async () => options.reviews ?? [],
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: "review-created", ...data, createdAt: now };
        createdReviews.push(row);
        return row;
      },
    },
    examinationCommitteeAssignment: {
      findMany: async () => options.appointments ?? formalAppointments(),
    },
    summativeChairmanApproval: {
      findUnique: async () => options.existingApproval ?? null,
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: "approval-created", ...data, createdAt: now };
        createdApprovals.push(row);
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
  const authorizer = {
    authorizeMemberReview: async () => resolvedAuthority,
    authorizeChairmanApproval: async () => resolvedAuthority,
    assertCurrentAuthority: async () => undefined,
  };
  const prisma = {
    ...tx,
    $transaction: async (operation: (client: typeof tx) => unknown) =>
      operation(tx),
  };
  return {
    audits,
    createdReviews,
    createdApprovals,
    service: new SummativeCommitteeWorkflowService(
      prisma as never,
      { get: () => ({ requestId: "request-a", audit: {} }) } as never,
      authorizer as never,
      { validateExisting: async () => calculated } as never,
    ),
  };
}

test("both internal Member seats can create immutable VERIFIED evidence", async () => {
  for (const seat of [
    ExaminationCommitteeSeat.MEMBER_1,
    ExaminationCommitteeSeat.MEMBER_2,
  ]) {
    const h = mutationHarness({ seat });
    const result = await h.service.submitMemberReview("calculated-a", {
      outcome: SummativeCommitteeMemberReviewOutcome.VERIFIED,
    });
    assert.equal(result.reviewerSeat, seat);
    assert.equal(result.outcome, SummativeCommitteeMemberReviewOutcome.VERIFIED);
    assert.equal(h.createdReviews.length, 1);
    assert.equal(h.audits.length, 1);
    assert.equal(
      JSON.stringify(h.audits[0]).includes("reviewComment"),
      false,
    );
  }
});

test("CORRECTION_REQUIRED is durable but requires a meaningful reason", async () => {
  const missing = mutationHarness({ seat: ExaminationCommitteeSeat.MEMBER_1 });
  await assert.rejects(
    missing.service.submitMemberReview("calculated-a", {
      outcome: SummativeCommitteeMemberReviewOutcome.CORRECTION_REQUIRED,
    }),
    /meaningful review comment/i,
  );
  const h = mutationHarness({ seat: ExaminationCommitteeSeat.MEMBER_1 });
  const result = await h.service.submitMemberReview("calculated-a", {
    outcome: SummativeCommitteeMemberReviewOutcome.CORRECTION_REQUIRED,
    reviewComment: "  Recheck the source comparison.  ",
  });
  assert.equal(result.reviewComment, "Recheck the source comparison.");
  assert.equal(h.audits.length, 1);
  assert.equal(JSON.stringify(h.audits[0]).includes("Recheck"), false);
});

test("an exact appointment retry is idempotent and an attempted change conflicts", async () => {
  const existing = review(ExaminationCommitteeSeat.MEMBER_1);
  const exact = mutationHarness({
    seat: ExaminationCommitteeSeat.MEMBER_1,
    existingReview: existing,
  });
  const result = await exact.service.submitMemberReview("calculated-a", {
    outcome: SummativeCommitteeMemberReviewOutcome.VERIFIED,
  });
  assert.equal(result.id, existing.id);
  assert.equal(exact.createdReviews.length, 0);
  assert.equal(exact.audits.length, 0);

  const changed = mutationHarness({
    seat: ExaminationCommitteeSeat.MEMBER_1,
    existingReview: existing,
  });
  await assert.rejects(
    changed.service.submitMemberReview("calculated-a", {
      outcome: SummativeCommitteeMemberReviewOutcome.CORRECTION_REQUIRED,
      reviewComment: "Changed outcome",
    }),
    /immutable/i,
  );
});

test("a replacement appointment creates the next immutable review version", async () => {
  const prior = review(ExaminationCommitteeSeat.MEMBER_1);
  const replacementAssignedAt = new Date("2026-09-02T08:00:00.000Z");
  const h = mutationHarness({
    seat: ExaminationCommitteeSeat.MEMBER_1,
    existingReview: prior,
    reviews: [prior],
    authorityAssignedAt: replacementAssignedAt,
  });
  const result = await h.service.submitMemberReview("calculated-a", {
    outcome: SummativeCommitteeMemberReviewOutcome.VERIFIED,
  });
  assert.equal(result.reviewVersion, 2);
  assert.equal(h.createdReviews.length, 1);
  assert.equal(
    h.createdReviews[0]!.assignmentAssignedAtSnapshot,
    replacementAssignedAt,
  );
});

test("Chairman approval requires two current VERIFIED reviews and derives the value", async () => {
  const h = mutationHarness({
    seat: ExaminationCommitteeSeat.CHAIRMAN,
    reviews: [
      review(ExaminationCommitteeSeat.MEMBER_1),
      review(ExaminationCommitteeSeat.MEMBER_2),
    ],
  });
  const result = await h.service.approveAndFinalLock("calculated-a");
  assert.equal(result.approvedSummativeValue, "40.015");
  assert.equal(result.approvedAt, result.lockedAt);
  assert.equal(h.createdApprovals.length, 1);
  assert.equal(
    h.createdApprovals[0]!.approvedSummativeValueSnapshot,
    calculated.derivedSummativeValue,
  );
  assert.equal(h.audits.length, 1);
});

test("Member and External seats cannot perform Chairman approval", async () => {
  for (const seat of [
    ExaminationCommitteeSeat.MEMBER_1,
    ExaminationCommitteeSeat.MEMBER_2,
    ExaminationCommitteeSeat.EXTERNAL_MEMBER,
  ]) {
    const h = mutationHarness({ seat });
    await assert.rejects(
      h.service.approveAndFinalLock("calculated-a"),
      /exact Chairman seat/i,
    );
    assert.equal(h.createdApprovals.length, 0);
  }
});

test("Chairman approval requires usable External Member metadata", async () => {
  const appointments = formalAppointments();
  const external = appointments.find(
    (appointment) =>
      appointment.seat === ExaminationCommitteeSeat.EXTERNAL_MEMBER,
  )!;
  external.externalMemberAffiliation = "   ";
  const h = mutationHarness({
    seat: ExaminationCommitteeSeat.CHAIRMAN,
    reviews: [
      review(ExaminationCommitteeSeat.MEMBER_1),
      review(ExaminationCommitteeSeat.MEMBER_2),
    ],
    appointments,
  });
  await assert.rejects(
    h.service.approveAndFinalLock("calculated-a"),
    /formally complete/i,
  );
  assert.equal(h.createdApprovals.length, 0);
});

test("Chairman is blocked by a missing, correction-required or stale current review", async () => {
  const cases = [
    [review(ExaminationCommitteeSeat.MEMBER_1)],
    [
      review(ExaminationCommitteeSeat.MEMBER_1),
      review(
        ExaminationCommitteeSeat.MEMBER_2,
        SummativeCommitteeMemberReviewOutcome.CORRECTION_REQUIRED,
      ),
    ],
    [
      review(
        ExaminationCommitteeSeat.MEMBER_1,
        SummativeCommitteeMemberReviewOutcome.VERIFIED,
        new Date("2026-08-01T00:00:00.000Z"),
      ),
      review(ExaminationCommitteeSeat.MEMBER_2),
    ],
  ];
  for (const reviews of cases) {
    const h = mutationHarness({
      seat: ExaminationCommitteeSeat.CHAIRMAN,
      reviews,
    });
    await assert.rejects(
      h.service.approveAndFinalLock("calculated-a"),
      /VERIFIED review is required|requires correction/i,
    );
    assert.equal(h.createdApprovals.length, 0);
  }
});

test("duplicate Chairman approval conflicts and required audit failure aborts success", async () => {
  const duplicate = mutationHarness({
    seat: ExaminationCommitteeSeat.CHAIRMAN,
    existingApproval: { id: "approval-existing" },
  });
  await assert.rejects(
    duplicate.service.approveAndFinalLock("calculated-a"),
    /already Chairman-approved/i,
  );
  assert.equal(duplicate.createdApprovals.length, 0);

  const auditFailure = mutationHarness({
    seat: ExaminationCommitteeSeat.CHAIRMAN,
    reviews: [
      review(ExaminationCommitteeSeat.MEMBER_1),
      review(ExaminationCommitteeSeat.MEMBER_2),
    ],
    auditFailure: true,
  });
  await assert.rejects(
    auditFailure.service.approveAndFinalLock("calculated-a"),
    /audit unavailable/,
  );
});

function workspaceCalculated() {
  return {
    id: "calculated-a",
    examinationId: "examination-a",
    examinationCourseId: "course-a",
    candidateId: "candidate-a",
    calculatedMarkVersion: 1,
    calculationPath: SummativeCalculatedMarkPath.FIRST_SECOND_AVERAGE,
    ruleVersionCode: "SUMMATIVE_FIRST_SECOND_AVERAGE_V1",
    summativeFullMarkSnapshot: new Prisma.Decimal("100.00"),
    derivedSummativeValue: new Prisma.Decimal("40.015"),
    calculatedAt: now,
    candidate: {
      enrollmentId: "enrollment-a",
      studentUserId: "student-a",
      studentUser: { displayName: "Candidate A" },
    },
    comparison: {
      firstTotalSnapshot: new Prisma.Decimal("40.01"),
      secondTotalSnapshot: new Prisma.Decimal("40.02"),
      absoluteDifference: new Prisma.Decimal("0.01"),
      variancePercentage: new Prisma.Decimal("0.01"),
      decision: "THIRD_EXAMINATION_NOT_REQUIRED",
      comparisonVersion: 1,
    },
    threeTotalCalculation: null,
    memberReviews: [
      { ...review(ExaminationCommitteeSeat.MEMBER_1), reviewComment: "Private one" },
      { ...review(ExaminationCommitteeSeat.MEMBER_2), reviewComment: "Private two" },
    ],
    chairmanApproval: null,
  };
}

function workspaceService(
  seat: ExaminationCommitteeSeat,
  currentAssignments = formalAppointments().filter(
    (row) =>
      row.seat === ExaminationCommitteeSeat.MEMBER_1 ||
      row.seat === ExaminationCommitteeSeat.MEMBER_2,
  ),
) {
  const resolved = authority(seat);
  const assignmentQueries: Array<{ where: Record<string, unknown> }> = [];
  const prisma = {
    summativeCalculatedMark: { findFirst: async () => workspaceCalculated() },
    examinationCommitteeAssignment: {
      findMany: async (query: { where: Record<string, unknown> }) => {
        assignmentQueries.push(query);
        return currentAssignments;
      },
    },
  };
  return {
    assignmentQueries,
    service: new SummativeCommitteeWorkflowService(
      prisma as never,
      { get: () => undefined } as never,
      {
        authorizeMemberReview: async () => resolved,
        authorizeChairmanApproval: async () => resolved,
      } as never,
      {} as never,
    ),
  };
}

test("Member workspace hides the other Member comment while Chairman sees both", async () => {
  const member = await workspaceService(
    ExaminationCommitteeSeat.MEMBER_1,
  ).service.getMemberWorkspace("calculated-a");
  assert.equal(member.memberReviews[0]!.reviewComment, "Private one");
  assert.equal("reviewComment" in member.memberReviews[1]!, false);
  const chairman = await workspaceService(
    ExaminationCommitteeSeat.CHAIRMAN,
  ).service.getChairmanWorkspace("calculated-a");
  assert.deepEqual(
    chairman.memberReviews.map((item) => item.reviewComment),
    ["Private one", "Private two"],
  );
  assert.equal("questionMarks" in chairman.sourceSummary, false);
  assert.equal("examinerUserId" in chairman.sourceSummary, false);
});

test("Chairman workspace excludes historical reviews for structurally invalid current Members", async () => {
  const h = workspaceService(ExaminationCommitteeSeat.CHAIRMAN, []);
  const chairman = await h.service.getChairmanWorkspace("calculated-a");
  assert.deepEqual(
    chairman.memberReviews.map((item) => ({
      seat: item.seat,
      completed: item.completed,
      outcome: item.outcome,
      reviewId: item.reviewId,
      reviewComment: item.reviewComment,
    })),
    [
      {
        seat: ExaminationCommitteeSeat.MEMBER_1,
        completed: false,
        outcome: null,
        reviewId: null,
        reviewComment: null,
      },
      {
        seat: ExaminationCommitteeSeat.MEMBER_2,
        completed: false,
        outcome: null,
        reviewId: null,
        reviewComment: null,
      },
    ],
  );
  const where = h.assignmentQueries[0]!.where;
  assert.deepEqual(where.assignedUserId, { not: null });
  assert.equal(where.externalMemberName, null);
  assert.equal(where.externalMemberAffiliation, null);
  assert.deepEqual(where.assignedUser, {
    is: {
      departmentId: "department-a",
      status: UserStatus.ACTIVE,
      archivedAt: null,
      deletedAt: null,
    },
  });
});
