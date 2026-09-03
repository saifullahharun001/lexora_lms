import { Injectable, InternalServerErrorException } from "@nestjs/common";
import {
  ExaminationCourseExaminerSeat,
  Prisma,
  SummativeExaminerComparisonDecision,
  SummativeExaminerMarkSubmissionStatus,
  SummativeQuestionConfigurationStatus,
  SummativeThirdExaminationReferralStatus,
  SummativeThirdExaminerMarkSubmissionStatus,
} from "@prisma/client";

import { RequestContextService } from "@/common/request-context/request-context.service";

import { SUMMATIVE_EXAMINATION_AUDIT_EVENTS } from "../../domain/summative-examination.audit-events";
import {
  calculateSummativeThreeTotal,
  type SummativeThreeTotalCalculationResult,
} from "../../domain/summative-three-total-calculation.rule";
import { SummativeCalculatedMarkService } from "./summative-calculated-mark.service";

export interface SummativeThreeTotalCreationScope {
  departmentId: string;
  actorUserId: string;
  examinationId: string;
  examinationCourseId: string;
  candidateId: string;
  referralId: string;
  thirdSubmissionId: string;
}

const comparisonSourceSelect = {
  id: true,
  departmentId: true,
  examinationId: true,
  examinationCourseId: true,
  candidateId: true,
  examinerSeat: true,
  questionConfigurationId: true,
  versionNumber: true,
  status: true,
  totalMark: true,
  submittedAt: true,
  lockedAt: true,
} as const;

@Injectable()
export class SummativeThreeTotalCalculationService {
  constructor(
    private readonly requestContextService: RequestContextService,
    private readonly calculatedMarkService: SummativeCalculatedMarkService,
  ) {}

  /**
   * Internal-only operation. Its caller must already be in the protected
   * Serializable finalisation transaction. Candidate locking is intentionally
   * the sole serialization boundary; immutable source rows are verified but are
   * not relocked in a conflicting order.
   */
  async ensureForLockedThird(
    tx: Prisma.TransactionClient,
    scope: SummativeThreeTotalCreationScope,
  ) {
    const candidateRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "summative_examination_candidates"
      WHERE "id" = ${scope.candidateId}
        AND "department_id" = ${scope.departmentId}
        AND "examination_id" = ${scope.examinationId}
        AND "examination_course_id" = ${scope.examinationCourseId}
      FOR UPDATE
    `);
    if (candidateRows.length !== 1) this.failClosed();

    const course = await tx.examinationCourse.findFirst({
      where: {
        id: scope.examinationCourseId,
        departmentId: scope.departmentId,
        examinationId: scope.examinationId,
        archivedAt: null,
      },
      select: { summativeFullMark: true },
    });
    if (!course || course.summativeFullMark.lte(0)) this.failClosed();

    const referral = await tx.summativeThirdExaminationReferral.findFirst({
      where: {
        id: scope.referralId,
        departmentId: scope.departmentId,
        examinationId: scope.examinationId,
        examinationCourseId: scope.examinationCourseId,
        candidateId: scope.candidateId,
        status: SummativeThirdExaminationReferralStatus.ASSIGNED,
        archivedAt: null,
      },
      select: {
        id: true,
        departmentId: true,
        examinationId: true,
        examinationCourseId: true,
        candidateId: true,
        comparisonId: true,
        thirdExaminerUserId: true,
        questionConfigurationId: true,
        comparisonVersionSnapshot: true,
        ruleVersionCode: true,
        assignmentVersion: true,
        status: true,
        archivedAt: true,
        comparison: {
          select: {
            id: true,
            departmentId: true,
            examinationId: true,
            examinationCourseId: true,
            candidateId: true,
            firstSubmissionId: true,
            secondSubmissionId: true,
            firstSubmissionVersion: true,
            secondSubmissionVersion: true,
            comparisonVersion: true,
            ruleVersionCode: true,
            firstTotalSnapshot: true,
            secondTotalSnapshot: true,
            summativeFullMarkSnapshot: true,
            decision: true,
            firstSubmission: { select: comparisonSourceSelect },
            secondSubmission: { select: comparisonSourceSelect },
          },
        },
      },
    });
    if (!referral) this.failClosed();

    const third = await tx.summativeThirdExaminerMarkSubmission.findFirst({
      where: {
        id: scope.thirdSubmissionId,
        departmentId: scope.departmentId,
        examinationId: scope.examinationId,
        examinationCourseId: scope.examinationCourseId,
        candidateId: scope.candidateId,
        referralId: scope.referralId,
        questionConfigurationId: referral.questionConfigurationId,
      },
      select: {
        id: true,
        departmentId: true,
        examinationId: true,
        examinationCourseId: true,
        candidateId: true,
        referralId: true,
        thirdExaminerUserId: true,
        questionConfigurationId: true,
        versionNumber: true,
        status: true,
        totalMark: true,
        submittedAt: true,
        lockedAt: true,
        questionMarks: {
          select: {
            questionItemId: true,
            questionConfigurationId: true,
            awardedMark: true,
          },
          orderBy: { questionItemId: "asc" },
        },
      },
    });
    if (!third) this.failClosed();

    const configuration = await tx.summativeQuestionConfiguration.findFirst({
      where: {
        id: referral.questionConfigurationId,
        departmentId: scope.departmentId,
        examinationId: scope.examinationId,
        examinationCourseId: scope.examinationCourseId,
        status: SummativeQuestionConfigurationStatus.LOCKED,
        archivedAt: null,
      },
      select: {
        id: true,
        items: {
          where: { isActive: true },
          select: { id: true, fullMark: true, isRequired: true },
          orderBy: { id: "asc" },
        },
      },
    });
    if (!configuration || configuration.items.length === 0) this.failClosed();

    const comparison = referral.comparison;
    const first = comparison.firstSubmission;
    const second = comparison.secondSubmission;
    if (
      comparison.decision !==
        SummativeExaminerComparisonDecision.THIRD_EXAMINATION_REQUIRED ||
      referral.departmentId !== scope.departmentId ||
      referral.examinationId !== scope.examinationId ||
      referral.examinationCourseId !== scope.examinationCourseId ||
      referral.candidateId !== scope.candidateId ||
      scope.actorUserId !== referral.thirdExaminerUserId ||
      comparison.departmentId !== scope.departmentId ||
      comparison.examinationId !== scope.examinationId ||
      comparison.examinationCourseId !== scope.examinationCourseId ||
      comparison.candidateId !== scope.candidateId ||
      comparison.id !== referral.comparisonId ||
      comparison.comparisonVersion !== referral.comparisonVersionSnapshot ||
      referral.ruleVersionCode !== comparison.ruleVersionCode ||
      comparison.firstSubmissionId !== first.id ||
      comparison.secondSubmissionId !== second.id ||
      first.departmentId !== scope.departmentId ||
      first.examinationId !== scope.examinationId ||
      first.examinationCourseId !== scope.examinationCourseId ||
      first.candidateId !== scope.candidateId ||
      second.departmentId !== scope.departmentId ||
      second.examinationId !== scope.examinationId ||
      second.examinationCourseId !== scope.examinationCourseId ||
      second.candidateId !== scope.candidateId ||
      first.examinerSeat !== ExaminationCourseExaminerSeat.FIRST_EXAMINER ||
      second.examinerSeat !== ExaminationCourseExaminerSeat.SECOND_EXAMINER ||
      first.status !== SummativeExaminerMarkSubmissionStatus.LOCKED ||
      second.status !== SummativeExaminerMarkSubmissionStatus.LOCKED ||
      first.totalMark === null ||
      second.totalMark === null ||
      first.submittedAt === null ||
      second.submittedAt === null ||
      first.lockedAt === null ||
      second.lockedAt === null ||
      first.versionNumber <= 0 ||
      second.versionNumber <= 0 ||
      comparison.firstSubmissionVersion !== first.versionNumber ||
      comparison.secondSubmissionVersion !== second.versionNumber ||
      !comparison.firstTotalSnapshot.eq(first.totalMark) ||
      !comparison.secondTotalSnapshot.eq(second.totalMark) ||
      !comparison.summativeFullMarkSnapshot.eq(course.summativeFullMark) ||
      first.questionConfigurationId !== configuration.id ||
      second.questionConfigurationId !== configuration.id ||
      third.id !== scope.thirdSubmissionId ||
      third.departmentId !== scope.departmentId ||
      third.examinationId !== scope.examinationId ||
      third.examinationCourseId !== scope.examinationCourseId ||
      third.candidateId !== scope.candidateId ||
      third.questionConfigurationId !== configuration.id ||
      third.status !== SummativeThirdExaminerMarkSubmissionStatus.LOCKED ||
      third.totalMark === null ||
      third.submittedAt === null ||
      third.lockedAt === null ||
      third.versionNumber <= 0 ||
      third.referralId !== referral.id ||
      third.thirdExaminerUserId !== referral.thirdExaminerUserId ||
      referral.assignmentVersion <= 0
    ) {
      this.failClosed();
    }

    const itemById = new Map(
      configuration.items.map((item) => [item.id, item]),
    );
    const markByItemId = new Map(
      third.questionMarks.map((mark) => [mark.questionItemId, mark]),
    );
    if (
      configuration.items.some(
        (item) => item.isRequired && !markByItemId.has(item.id),
      ) ||
      third.questionMarks.some((mark) => {
        const item = itemById.get(mark.questionItemId);
        return (
          !item ||
          mark.questionConfigurationId !== configuration.id ||
          mark.awardedMark.lt(0) ||
          mark.awardedMark.gt(item.fullMark)
        );
      })
    ) {
      this.failClosed();
    }
    const thirdTotalFromMarks = third.questionMarks.reduce(
      (sum, mark) => sum.add(mark.awardedMark),
      new Prisma.Decimal(0),
    );
    if (!thirdTotalFromMarks.eq(third.totalMark)) this.failClosed();

    const result = this.calculateOrFailClosed(
      first.totalMark,
      second.totalMark,
      third.totalMark,
      course.summativeFullMark,
    );
    const existing = await tx.summativeThreeTotalCalculation.findFirst({
      where: {
        firstSubmissionId: first.id,
        secondSubmissionId: second.id,
        thirdSubmissionId: third.id,
      },
    });
    if (existing) {
      this.assertExistingEvidence(
        existing,
        scope,
        referral,
        comparison,
        third.versionNumber,
        result,
      );
      await this.calculatedMarkService.ensureForThreeTotal(
        tx,
        scope,
        existing.id,
      );
      return existing;
    }

    const latest = await tx.summativeThreeTotalCalculation.findFirst({
      where: {
        departmentId: scope.departmentId,
        examinationCourseId: scope.examinationCourseId,
        candidateId: scope.candidateId,
      },
      select: { calculationVersion: true },
      orderBy: { calculationVersion: "desc" },
    });
    const calculationVersion = (latest?.calculationVersion ?? 0) + 1;
    const calculation = await tx.summativeThreeTotalCalculation.create({
      data: {
        departmentId: scope.departmentId,
        examinationId: scope.examinationId,
        examinationCourseId: scope.examinationCourseId,
        candidateId: scope.candidateId,
        comparisonId: comparison.id,
        thirdReferralId: referral.id,
        firstSubmissionId: first.id,
        secondSubmissionId: second.id,
        thirdSubmissionId: third.id,
        firstSubmissionVersion: first.versionNumber,
        secondSubmissionVersion: second.versionNumber,
        thirdSubmissionVersion: third.versionNumber,
        comparisonVersionSnapshot: comparison.comparisonVersion,
        thirdReferralAssignmentVersionSnapshot: referral.assignmentVersion,
        questionConfigurationId: configuration.id,
        calculationVersion,
        firstTotalSnapshot: result.firstTotal,
        secondTotalSnapshot: result.secondTotal,
        thirdTotalSnapshot: result.thirdTotal,
        summativeFullMarkSnapshot: result.summativeFullMark,
        firstSecondDistance: result.firstSecondDistance,
        firstThirdDistance: result.firstThirdDistance,
        secondThirdDistance: result.secondThirdDistance,
        selectedPair: result.selectedPair,
        selectionReason: result.selectionReason,
        ruleVersionCode: result.ruleVersionCode,
        derivedSummativeValue: result.derivedSummativeValue,
        calculatedAt: new Date(),
      },
    });
    await this.writeAudit(tx, scope, calculation);
    await this.calculatedMarkService.ensureForThreeTotal(
      tx,
      scope,
      calculation.id,
    );
    return calculation;
  }

  private assertExistingEvidence(
    existing: {
      departmentId: string;
      examinationId: string;
      examinationCourseId: string;
      candidateId: string;
      comparisonId: string;
      thirdReferralId: string;
      firstSubmissionVersion: number;
      secondSubmissionVersion: number;
      thirdSubmissionVersion: number;
      comparisonVersionSnapshot: number;
      thirdReferralAssignmentVersionSnapshot: number;
      questionConfigurationId: string;
      calculationVersion: number;
      firstTotalSnapshot: Prisma.Decimal;
      secondTotalSnapshot: Prisma.Decimal;
      thirdTotalSnapshot: Prisma.Decimal;
      summativeFullMarkSnapshot: Prisma.Decimal;
      firstSecondDistance: Prisma.Decimal;
      firstThirdDistance: Prisma.Decimal;
      secondThirdDistance: Prisma.Decimal;
      selectedPair: string;
      selectionReason: string;
      ruleVersionCode: string;
      derivedSummativeValue: Prisma.Decimal;
    },
    scope: SummativeThreeTotalCreationScope,
    referral: {
      id: string;
      assignmentVersion: number;
      questionConfigurationId: string;
    },
    comparison: {
      id: string;
      firstSubmissionVersion: number;
      secondSubmissionVersion: number;
      comparisonVersion: number;
    },
    thirdSubmissionVersion: number,
    result: SummativeThreeTotalCalculationResult,
  ) {
    if (
      existing.departmentId !== scope.departmentId ||
      existing.examinationId !== scope.examinationId ||
      existing.examinationCourseId !== scope.examinationCourseId ||
      existing.candidateId !== scope.candidateId ||
      existing.comparisonId !== comparison.id ||
      existing.thirdReferralId !== referral.id ||
      existing.firstSubmissionVersion !== comparison.firstSubmissionVersion ||
      existing.secondSubmissionVersion !== comparison.secondSubmissionVersion ||
      existing.thirdSubmissionVersion !== thirdSubmissionVersion ||
      existing.comparisonVersionSnapshot !== comparison.comparisonVersion ||
      existing.thirdReferralAssignmentVersionSnapshot !==
        referral.assignmentVersion ||
      existing.questionConfigurationId !== referral.questionConfigurationId ||
      existing.calculationVersion <= 0 ||
      !existing.firstTotalSnapshot.eq(result.firstTotal) ||
      !existing.secondTotalSnapshot.eq(result.secondTotal) ||
      !existing.thirdTotalSnapshot.eq(result.thirdTotal) ||
      !existing.summativeFullMarkSnapshot.eq(result.summativeFullMark) ||
      !existing.firstSecondDistance.eq(result.firstSecondDistance) ||
      !existing.firstThirdDistance.eq(result.firstThirdDistance) ||
      !existing.secondThirdDistance.eq(result.secondThirdDistance) ||
      existing.selectedPair !== result.selectedPair ||
      existing.selectionReason !== result.selectionReason ||
      existing.ruleVersionCode !== result.ruleVersionCode ||
      !existing.derivedSummativeValue.eq(result.derivedSummativeValue)
    ) {
      this.failClosed();
    }
  }

  private calculateOrFailClosed(
    first: Prisma.Decimal,
    second: Prisma.Decimal,
    third: Prisma.Decimal,
    fullMark: Prisma.Decimal,
  ) {
    try {
      return calculateSummativeThreeTotal(first, second, third, fullMark);
    } catch {
      return this.failClosed();
    }
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    scope: SummativeThreeTotalCreationScope,
    calculation: {
      id: string;
      comparisonId: string;
      thirdReferralId: string;
      thirdSubmissionId: string;
      calculationVersion: number;
      ruleVersionCode: string;
      selectedPair: string;
      selectionReason: string;
    },
  ) {
    const requestContext = this.requestContextService.get();
    await tx.auditLog.create({
      data: {
        requestId: requestContext?.requestId,
        actorUserId: scope.actorUserId,
        actorType: "USER",
        departmentId: scope.departmentId,
        action:
          SUMMATIVE_EXAMINATION_AUDIT_EVENTS.THREE_TOTAL_CALCULATION_CREATED,
        targetType: "summative_three_total_calculation",
        targetId: calculation.id,
        outcome: "SUCCESS",
        ipAddress: requestContext?.audit.ipAddress,
        userAgent: requestContext?.audit.userAgent,
        contextJson: {
          calculationId: calculation.id,
          examinationId: scope.examinationId,
          examinationCourseId: scope.examinationCourseId,
          candidateId: scope.candidateId,
          comparisonId: calculation.comparisonId,
          thirdReferralId: calculation.thirdReferralId,
          thirdSubmissionId: calculation.thirdSubmissionId,
          calculationVersion: calculation.calculationVersion,
          ruleVersionCode: calculation.ruleVersionCode,
          selectedPair: calculation.selectedPair,
          selectionReason: calculation.selectionReason,
        },
      },
    });
  }

  private failClosed(): never {
    throw new InternalServerErrorException(
      "Summative three-total calculation evidence is invalid",
    );
  }
}
