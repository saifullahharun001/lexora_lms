import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ExaminationCommitteeAssignmentStatus,
  ExaminationCommitteeSeat,
  Prisma,
  SummativeCommitteeMemberReviewOutcome,
  UserStatus,
} from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";

import { SUMMATIVE_EXAMINATION_AUDIT_EVENTS } from "../../domain/summative-examination.audit-events";
import type { SubmitSummativeMemberReviewDto } from "../../presentation/http/dto/summative-committee-workflow.dto";
import { SummativeCalculatedMarkService } from "./summative-calculated-mark.service";
import {
  SummativeCommitteeWorkflowAuthorizerService,
  type SummativeCommitteeWorkflowAuthority,
} from "./summative-committee-workflow-authorizer.service";

const MEMBER_SEATS = [
  ExaminationCommitteeSeat.MEMBER_1,
  ExaminationCommitteeSeat.MEMBER_2,
] as const;

type MemberSeat = (typeof MEMBER_SEATS)[number];

const LIVE_ASSIGNMENT_WHERE = (evaluatedAt: Date) => ({
  status: ExaminationCommitteeAssignmentStatus.ACTIVE,
  assignedAt: { lte: evaluatedAt },
  OR: [{ expiresAt: null }, { expiresAt: { gt: evaluatedAt } }],
  unassignedAt: null,
  archivedAt: null,
});

@Injectable()
export class SummativeCommitteeWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
    private readonly authorizer: SummativeCommitteeWorkflowAuthorizerService,
    private readonly calculatedMarkService: SummativeCalculatedMarkService,
  ) {}

  async getMemberWorkspace(calculatedMarkId: string) {
    const authority =
      await this.authorizer.authorizeMemberReview(calculatedMarkId);
    return this.loadWorkspace(authority, false);
  }

  async getChairmanWorkspace(calculatedMarkId: string) {
    const authority =
      await this.authorizer.authorizeChairmanApproval(calculatedMarkId);
    return this.loadWorkspace(authority, true);
  }

  async submitMemberReview(
    calculatedMarkId: string,
    input: SubmitSummativeMemberReviewDto,
  ) {
    const authority =
      await this.authorizer.authorizeMemberReview(calculatedMarkId);
    if (!this.isMemberSeat(authority.seat)) {
      throw new ConflictException("A Member seat is required for review");
    }
    const reviewComment = this.normalizeReviewComment(input);
    const transitionAt = new Date();

    return this.serializable(async (tx) => {
      await this.lockWorkflowParents(tx, authority);
      await this.authorizer.assertCurrentAuthority(
        tx,
        authority,
        transitionAt,
      );
      const calculatedMark = await this.calculatedMarkService.validateExisting(
        tx,
        authority,
        calculatedMarkId,
      );
      await this.lockCommitteeAssignments(tx, authority);
      await this.lockReviews(tx, authority);

      const existing = await tx.summativeCommitteeMemberReview.findFirst({
        where: {
          calculatedMarkId,
          committeeAssignmentId: authority.committeeAssignmentId,
          assignmentAssignedAtSnapshot: authority.assignmentAssignedAt,
        },
      });
      if (existing) {
        const existingComment = existing.reviewComment?.trim() || null;
        if (
          existing.outcome === input.outcome &&
          existingComment === reviewComment
        ) {
          return this.serializeReview(existing);
        }
        throw new ConflictException(
          "Completed Committee Member review is immutable",
        );
      }

      const latest = await tx.summativeCommitteeMemberReview.findFirst({
        where: {
          departmentId: authority.departmentId,
          calculatedMarkId,
          reviewerSeat: authority.seat,
        },
        select: { reviewVersion: true },
        orderBy: { reviewVersion: "desc" },
      });
      const review = await tx.summativeCommitteeMemberReview.create({
        data: {
          departmentId: authority.departmentId,
          examinationId: authority.examinationId,
          examinationCourseId: authority.examinationCourseId,
          candidateId: authority.candidateId,
          calculatedMarkId,
          calculatedMarkVersionSnapshot:
            calculatedMark.calculatedMarkVersion,
          committeeId: authority.committeeId,
          committeeAssignmentId: authority.committeeAssignmentId,
          reviewerUserId: authority.actorUserId,
          reviewerSeat: authority.seat,
          assignmentAssignedAtSnapshot: authority.assignmentAssignedAt,
          reviewVersion: (latest?.reviewVersion ?? 0) + 1,
          outcome: input.outcome,
          reviewComment,
          reviewedAt: transitionAt,
        },
      });
      await this.writeReviewAudit(tx, authority, review);
      return this.serializeReview(review);
    });
  }

  async approveAndFinalLock(calculatedMarkId: string) {
    const authority =
      await this.authorizer.authorizeChairmanApproval(calculatedMarkId);
    if (authority.seat !== ExaminationCommitteeSeat.CHAIRMAN) {
      throw new ConflictException("The exact Chairman seat is required");
    }
    const transitionAt = new Date();

    return this.serializable(async (tx) => {
      await this.lockWorkflowParents(tx, authority);
      await this.authorizer.assertCurrentAuthority(
        tx,
        authority,
        transitionAt,
      );
      const calculatedMark = await this.calculatedMarkService.validateExisting(
        tx,
        authority,
        calculatedMarkId,
      );
      await this.lockCommitteeAssignments(tx, authority);
      await this.lockReviews(tx, authority);
      await tx.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "summative_chairman_approvals"
        WHERE "department_id" = ${authority.departmentId}
          AND "examination_course_id" = ${authority.examinationCourseId}
          AND "candidate_id" = ${authority.candidateId}
        ORDER BY "approval_version", "id"
        FOR UPDATE
      `);

      const existing = await tx.summativeChairmanApproval.findUnique({
        where: { calculatedMarkId },
      });
      if (existing) {
        throw new ConflictException(
          "Calculated Summative mark is already Chairman-approved and final-locked",
        );
      }

      const appointments = await this.loadCurrentFormalAppointments(
        tx,
        authority,
        transitionAt,
      );
      const chairman = appointments.get(ExaminationCommitteeSeat.CHAIRMAN)!;
      if (
        chairman.id !== authority.committeeAssignmentId ||
        chairman.assignedUserId !== authority.actorUserId ||
        chairman.assignedAt.getTime() !==
          authority.assignmentAssignedAt.getTime()
      ) {
        throw new ConflictException("Current Chairman appointment has changed");
      }

      const reviews = await tx.summativeCommitteeMemberReview.findMany({
        where: {
          departmentId: authority.departmentId,
          examinationId: authority.examinationId,
          examinationCourseId: authority.examinationCourseId,
          candidateId: authority.candidateId,
          calculatedMarkId,
          calculatedMarkVersionSnapshot:
            calculatedMark.calculatedMarkVersion,
          committeeId: authority.committeeId,
          reviewerSeat: { in: [...MEMBER_SEATS] },
        },
        orderBy: [
          { reviewerSeat: "asc" },
          { reviewVersion: "desc" },
          { id: "asc" },
        ],
      });
      const member1Review = this.usableVerifiedReview(
        reviews,
        appointments.get(ExaminationCommitteeSeat.MEMBER_1)!,
        ExaminationCommitteeSeat.MEMBER_1,
      );
      const member2Review = this.usableVerifiedReview(
        reviews,
        appointments.get(ExaminationCommitteeSeat.MEMBER_2)!,
        ExaminationCommitteeSeat.MEMBER_2,
      );

      const latest = await tx.summativeChairmanApproval.findFirst({
        where: {
          departmentId: authority.departmentId,
          examinationCourseId: authority.examinationCourseId,
          candidateId: authority.candidateId,
        },
        select: { approvalVersion: true },
        orderBy: { approvalVersion: "desc" },
      });
      const approval = await tx.summativeChairmanApproval.create({
        data: {
          departmentId: authority.departmentId,
          examinationId: authority.examinationId,
          examinationCourseId: authority.examinationCourseId,
          candidateId: authority.candidateId,
          calculatedMarkId,
          calculatedMarkVersionSnapshot:
            calculatedMark.calculatedMarkVersion,
          committeeId: authority.committeeId,
          chairmanAssignmentId: authority.committeeAssignmentId,
          chairmanUserId: authority.actorUserId,
          chairmanAssignedAtSnapshot: authority.assignmentAssignedAt,
          member1ReviewId: member1Review.id,
          member2ReviewId: member2Review.id,
          approvedSummativeValueSnapshot:
            calculatedMark.derivedSummativeValue,
          summativeFullMarkSnapshot:
            calculatedMark.summativeFullMarkSnapshot,
          approvalVersion: (latest?.approvalVersion ?? 0) + 1,
          approvedAt: transitionAt,
          lockedAt: transitionAt,
        },
      });
      await this.writeApprovalAudit(tx, authority, calculatedMark, approval);
      return this.serializeApproval(approval);
    });
  }

  private async loadWorkspace(
    authority: SummativeCommitteeWorkflowAuthority,
    includeAllComments: boolean,
  ) {
    const calculatedMark = await this.prisma.summativeCalculatedMark.findFirst({
      where: {
        id: authority.calculatedMarkId,
        departmentId: authority.departmentId,
        examinationId: authority.examinationId,
        examinationCourseId: authority.examinationCourseId,
        candidateId: authority.candidateId,
      },
      select: {
        id: true,
        examinationId: true,
        examinationCourseId: true,
        candidateId: true,
        calculatedMarkVersion: true,
        calculationPath: true,
        ruleVersionCode: true,
        summativeFullMarkSnapshot: true,
        derivedSummativeValue: true,
        calculatedAt: true,
        candidate: {
          select: {
            enrollmentId: true,
            studentUserId: true,
            studentUser: { select: { displayName: true } },
          },
        },
        comparison: {
          select: {
            firstTotalSnapshot: true,
            secondTotalSnapshot: true,
            absoluteDifference: true,
            variancePercentage: true,
            decision: true,
            comparisonVersion: true,
          },
        },
        threeTotalCalculation: {
          select: {
            thirdTotalSnapshot: true,
            selectedPair: true,
            selectionReason: true,
            calculationVersion: true,
          },
        },
        memberReviews: {
          select: {
            id: true,
            reviewerSeat: true,
            reviewerUserId: true,
            committeeAssignmentId: true,
            assignmentAssignedAtSnapshot: true,
            reviewVersion: true,
            outcome: true,
            reviewComment: true,
            reviewedAt: true,
          },
          orderBy: [
            { reviewerSeat: "asc" },
            { reviewVersion: "desc" },
            { id: "asc" },
          ],
        },
        chairmanApproval: {
          select: {
            id: true,
            approvalVersion: true,
            approvedAt: true,
            lockedAt: true,
          },
        },
      },
    });
    if (!calculatedMark) {
      throw new NotFoundException("Summative calculated mark not found");
    }
    const evaluatedAt = new Date();
    const currentAssignments =
      await this.prisma.examinationCommitteeAssignment.findMany({
        where: {
          departmentId: authority.departmentId,
          examinationId: authority.examinationId,
          committeeId: authority.committeeId,
          seat: { in: [...MEMBER_SEATS] },
          assignedUserId: { not: null },
          externalMemberName: null,
          externalMemberAffiliation: null,
          assignedUser: {
            is: {
              departmentId: authority.departmentId,
              status: UserStatus.ACTIVE,
              archivedAt: null,
              deletedAt: null,
            },
          },
          ...LIVE_ASSIGNMENT_WHERE(evaluatedAt),
        },
        select: {
          id: true,
          assignedUserId: true,
          seat: true,
          assignedAt: true,
        },
      });
    const currentReviewBySeat = new Map<
      ExaminationCommitteeSeat,
      (typeof calculatedMark.memberReviews)[number]
    >();
    for (const assignment of currentAssignments) {
      const review = calculatedMark.memberReviews.find(
        (candidate) =>
          candidate.reviewerSeat === assignment.seat &&
          candidate.reviewerUserId === assignment.assignedUserId &&
          candidate.committeeAssignmentId === assignment.id &&
          candidate.assignmentAssignedAtSnapshot.getTime() ===
            assignment.assignedAt.getTime(),
      );
      if (review) currentReviewBySeat.set(assignment.seat, review);
    }

    return {
      calculatedMark: {
        id: calculatedMark.id,
        version: calculatedMark.calculatedMarkVersion,
        calculationPath: calculatedMark.calculationPath,
        ruleVersionCode: calculatedMark.ruleVersionCode,
        summativeFullMark: calculatedMark.summativeFullMarkSnapshot.toString(),
        derivedSummativeValue:
          calculatedMark.derivedSummativeValue.toString(),
        calculatedAt: calculatedMark.calculatedAt,
      },
      candidate: {
        id: calculatedMark.candidateId,
        enrollmentId: calculatedMark.candidate.enrollmentId,
        studentUserId: calculatedMark.candidate.studentUserId,
        displayName: calculatedMark.candidate.studentUser.displayName,
      },
      examination: { id: calculatedMark.examinationId },
      examinationCourse: { id: calculatedMark.examinationCourseId },
      sourceSummary: {
        firstTotal: calculatedMark.comparison.firstTotalSnapshot.toString(),
        secondTotal: calculatedMark.comparison.secondTotalSnapshot.toString(),
        absoluteDifference:
          calculatedMark.comparison.absoluteDifference.toString(),
        variancePercentage:
          calculatedMark.comparison.variancePercentage.toString(),
        decision: calculatedMark.comparison.decision,
        comparisonVersion: calculatedMark.comparison.comparisonVersion,
        thirdTotal:
          calculatedMark.threeTotalCalculation?.thirdTotalSnapshot.toString() ??
          null,
        selectedPair:
          calculatedMark.threeTotalCalculation?.selectedPair ?? null,
        selectionReason:
          calculatedMark.threeTotalCalculation?.selectionReason ?? null,
        threeTotalCalculationVersion:
          calculatedMark.threeTotalCalculation?.calculationVersion ?? null,
      },
      memberReviews: MEMBER_SEATS.map((seat) => {
        const review = currentReviewBySeat.get(seat);
        const maySeeComment = includeAllComments || seat === authority.seat;
        return {
          seat,
          completed: Boolean(review),
          outcome: review?.outcome ?? null,
          reviewVersion: review?.reviewVersion ?? null,
          reviewedAt: review?.reviewedAt ?? null,
          ...(maySeeComment
            ? {
                reviewId: review?.id ?? null,
                reviewComment: review?.reviewComment ?? null,
              }
            : {}),
        };
      }),
      finalLock: calculatedMark.chairmanApproval,
    };
  }

  private async loadCurrentFormalAppointments(
    tx: Prisma.TransactionClient,
    authority: SummativeCommitteeWorkflowAuthority,
    evaluatedAt: Date,
  ) {
    const assignments = await tx.examinationCommitteeAssignment.findMany({
      where: {
        departmentId: authority.departmentId,
        examinationId: authority.examinationId,
        committeeId: authority.committeeId,
        ...LIVE_ASSIGNMENT_WHERE(evaluatedAt),
      },
      select: {
        id: true,
        assignedUserId: true,
        externalMemberName: true,
        externalMemberAffiliation: true,
        seat: true,
        assignedAt: true,
        assignedUser: {
          select: {
            id: true,
            departmentId: true,
            status: true,
            archivedAt: true,
            deletedAt: true,
          },
        },
      },
      orderBy: [{ seat: "asc" }, { id: "asc" }],
    });
    const bySeat = new Map<
      ExaminationCommitteeSeat,
      (typeof assignments)[number]
    >();
    for (const assignment of assignments) {
      if (bySeat.has(assignment.seat)) {
        throw new ConflictException(
          "Examination Committee is not formally complete",
        );
      }
      const isExternal =
        assignment.seat === ExaminationCommitteeSeat.EXTERNAL_MEMBER;
      const usable = isExternal
        ? assignment.assignedUserId === null &&
          Boolean(assignment.externalMemberName?.trim()) &&
          Boolean(assignment.externalMemberAffiliation?.trim())
        : assignment.assignedUserId !== null &&
          assignment.externalMemberName === null &&
          assignment.externalMemberAffiliation === null &&
          assignment.assignedUser?.id === assignment.assignedUserId &&
          assignment.assignedUser.departmentId === authority.departmentId &&
          assignment.assignedUser.status === UserStatus.ACTIVE &&
          assignment.assignedUser.archivedAt === null &&
          assignment.assignedUser.deletedAt === null;
      if (usable) bySeat.set(assignment.seat, assignment);
    }
    for (const seat of [
      ExaminationCommitteeSeat.CHAIRMAN,
      ExaminationCommitteeSeat.MEMBER_1,
      ExaminationCommitteeSeat.MEMBER_2,
      ExaminationCommitteeSeat.EXTERNAL_MEMBER,
    ]) {
      if (!bySeat.has(seat)) {
        throw new ConflictException(
          "Examination Committee is not formally complete",
        );
      }
    }
    if (bySeat.size !== 4) {
      throw new ConflictException(
        "Examination Committee is not formally complete",
      );
    }
    return bySeat;
  }

  private usableVerifiedReview(
    reviews: Array<{
      id: string;
      committeeAssignmentId: string;
      reviewerUserId: string;
      reviewerSeat: ExaminationCommitteeSeat;
      assignmentAssignedAtSnapshot: Date;
      outcome: SummativeCommitteeMemberReviewOutcome;
    }>,
    appointment: {
      id: string;
      assignedUserId: string | null;
      assignedAt: Date;
    },
    seat: MemberSeat,
  ) {
    const current = reviews.filter(
      (review) =>
        review.reviewerSeat === seat &&
        review.committeeAssignmentId === appointment.id &&
        review.reviewerUserId === appointment.assignedUserId &&
        review.assignmentAssignedAtSnapshot.getTime() ===
          appointment.assignedAt.getTime(),
    );
    if (current.length !== 1) {
      throw new ConflictException(
        `Current ${seat} VERIFIED review is required`,
      );
    }
    if (
      current[0]!.outcome !==
      SummativeCommitteeMemberReviewOutcome.VERIFIED
    ) {
      throw new ConflictException(
        `Current ${seat} review requires correction`,
      );
    }
    return current[0]!;
  }

  private normalizeReviewComment(input: SubmitSummativeMemberReviewDto) {
    const comment = input.reviewComment?.trim() || null;
    if (
      input.outcome ===
        SummativeCommitteeMemberReviewOutcome.CORRECTION_REQUIRED &&
      !comment
    ) {
      throw new BadRequestException(
        "A meaningful review comment is required when correction is required",
      );
    }
    return comment;
  }

  private isMemberSeat(seat: ExaminationCommitteeSeat): seat is MemberSeat {
    return MEMBER_SEATS.some((candidate) => candidate === seat);
  }

  private async lockWorkflowParents(
    tx: Prisma.TransactionClient,
    authority: SummativeCommitteeWorkflowAuthority,
  ) {
    for (const [table, id] of [
      ["examinations", authority.examinationId],
      ["examination_courses", authority.examinationCourseId],
      ["summative_examination_candidates", authority.candidateId],
      ["summative_calculated_marks", authority.calculatedMarkId],
      ["examination_committees", authority.committeeId],
    ] as const) {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM ${Prisma.raw(`"${table}"`)}
        WHERE "id" = ${id} AND "department_id" = ${authority.departmentId}
        FOR UPDATE
      `);
      if (rows.length !== 1) {
        throw new NotFoundException(
          "Summative Committee workflow object not found",
        );
      }
    }
  }

  private async lockCommitteeAssignments(
    tx: Prisma.TransactionClient,
    authority: SummativeCommitteeWorkflowAuthority,
  ) {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "examination_committee_assignments"
      WHERE "department_id" = ${authority.departmentId}
        AND "examination_id" = ${authority.examinationId}
        AND "committee_id" = ${authority.committeeId}
      ORDER BY "seat", "id"
      FOR UPDATE
    `);
  }

  private async lockReviews(
    tx: Prisma.TransactionClient,
    authority: SummativeCommitteeWorkflowAuthority,
  ) {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "summative_committee_member_reviews"
      WHERE "department_id" = ${authority.departmentId}
        AND "calculated_mark_id" = ${authority.calculatedMarkId}
      ORDER BY "reviewer_seat", "review_version", "id"
      FOR UPDATE
    `);
  }

  private serializeReview(review: {
    id: string;
    calculatedMarkId: string;
    calculatedMarkVersionSnapshot: number;
    reviewerSeat: ExaminationCommitteeSeat;
    reviewVersion: number;
    outcome: SummativeCommitteeMemberReviewOutcome;
    reviewComment: string | null;
    reviewedAt: Date;
    createdAt: Date;
  }) {
    return {
      id: review.id,
      calculatedMarkId: review.calculatedMarkId,
      calculatedMarkVersion: review.calculatedMarkVersionSnapshot,
      reviewerSeat: review.reviewerSeat,
      reviewVersion: review.reviewVersion,
      outcome: review.outcome,
      reviewComment: review.reviewComment,
      reviewedAt: review.reviewedAt,
      createdAt: review.createdAt,
    };
  }

  private serializeApproval(approval: {
    id: string;
    calculatedMarkId: string;
    calculatedMarkVersionSnapshot: number;
    approvedSummativeValueSnapshot: Prisma.Decimal;
    summativeFullMarkSnapshot: Prisma.Decimal;
    approvalVersion: number;
    approvedAt: Date;
    lockedAt: Date;
    createdAt: Date;
  }) {
    return {
      id: approval.id,
      calculatedMarkId: approval.calculatedMarkId,
      calculatedMarkVersion: approval.calculatedMarkVersionSnapshot,
      approvedSummativeValue:
        approval.approvedSummativeValueSnapshot.toString(),
      summativeFullMark: approval.summativeFullMarkSnapshot.toString(),
      approvalVersion: approval.approvalVersion,
      approvedAt: approval.approvedAt,
      lockedAt: approval.lockedAt,
      createdAt: approval.createdAt,
    };
  }

  private async writeReviewAudit(
    tx: Prisma.TransactionClient,
    authority: SummativeCommitteeWorkflowAuthority,
    review: {
      id: string;
      calculatedMarkVersionSnapshot: number;
      reviewVersion: number;
      outcome: SummativeCommitteeMemberReviewOutcome;
    },
  ) {
    const requestContext = this.requestContextService.get();
    await tx.auditLog.create({
      data: {
        requestId: requestContext?.requestId,
        actorUserId: authority.actorUserId,
        actorType: "USER",
        departmentId: authority.departmentId,
        action: SUMMATIVE_EXAMINATION_AUDIT_EVENTS.MEMBER_REVIEW_COMPLETED,
        targetType: "summative_committee_member_review",
        targetId: review.id,
        outcome: "SUCCESS",
        ipAddress: requestContext?.audit.ipAddress,
        userAgent: requestContext?.audit.userAgent,
        contextJson: {
          examinationId: authority.examinationId,
          examinationCourseId: authority.examinationCourseId,
          candidateId: authority.candidateId,
          calculatedMarkId: authority.calculatedMarkId,
          calculatedMarkVersion: review.calculatedMarkVersionSnapshot,
          committeeId: authority.committeeId,
          committeeAssignmentId: authority.committeeAssignmentId,
          reviewerSeat: authority.seat,
          reviewVersion: review.reviewVersion,
          reviewOutcome: review.outcome,
          reviewId: review.id,
        },
      },
    });
  }

  private async writeApprovalAudit(
    tx: Prisma.TransactionClient,
    authority: SummativeCommitteeWorkflowAuthority,
    calculatedMark: {
      calculatedMarkVersion: number;
      calculationPath: string;
      ruleVersionCode: string;
      derivedSummativeValue: Prisma.Decimal;
    },
    approval: {
      id: string;
      member1ReviewId: string;
      member2ReviewId: string;
      approvalVersion: number;
    },
  ) {
    const requestContext = this.requestContextService.get();
    await tx.auditLog.create({
      data: {
        requestId: requestContext?.requestId,
        actorUserId: authority.actorUserId,
        actorType: "USER",
        departmentId: authority.departmentId,
        action: SUMMATIVE_EXAMINATION_AUDIT_EVENTS.CHAIRMAN_FINAL_LOCK_COMPLETED,
        targetType: "summative_chairman_approval",
        targetId: approval.id,
        outcome: "SUCCESS",
        ipAddress: requestContext?.audit.ipAddress,
        userAgent: requestContext?.audit.userAgent,
        contextJson: {
          examinationId: authority.examinationId,
          examinationCourseId: authority.examinationCourseId,
          candidateId: authority.candidateId,
          calculatedMarkId: authority.calculatedMarkId,
          calculatedMarkVersion: calculatedMark.calculatedMarkVersion,
          calculationPath: calculatedMark.calculationPath,
          calculationRuleVersionCode: calculatedMark.ruleVersionCode,
          committeeId: authority.committeeId,
          chairmanAssignmentId: authority.committeeAssignmentId,
          member1ReviewId: approval.member1ReviewId,
          member2ReviewId: approval.member2ReviewId,
          approvalId: approval.id,
          approvalVersion: approval.approvalVersion,
          approvedValueSnapshot:
            calculatedMark.derivedSummativeValue.toString(),
        },
      },
    });
  }

  private isRetryableTransactionConflict(error: unknown) {
    if (!(error instanceof PrismaClientKnownRequestError)) return false;
    return (
      error.code === "P2034" ||
      (error.code === "P2010" &&
        (error.meta?.code === "40001" || error.meta?.code === "40P01"))
    );
  }

  private async serializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        });
      } catch (error) {
        if (attempt >= 2 || !this.isRetryableTransactionConflict(error)) {
          throw error;
        }
      }
    }
  }
}
