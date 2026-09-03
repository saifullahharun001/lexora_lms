import { Injectable, InternalServerErrorException } from "@nestjs/common";
import {
  ExaminationCourseExaminerSeat,
  Prisma,
  SummativeCalculatedMarkPath,
  SummativeExaminerComparisonDecision,
  SummativeExaminerMarkSubmissionStatus,
  SummativeQuestionConfigurationStatus,
  SummativeThirdExaminerMarkSubmissionStatus,
} from "@prisma/client";

import { RequestContextService } from "@/common/request-context/request-context.service";

import { SUMMATIVE_EXAMINATION_AUDIT_EVENTS } from "../../domain/summative-examination.audit-events";

export const SUMMATIVE_FIRST_SECOND_AVERAGE_RULE_VERSION =
  "SUMMATIVE_FIRST_SECOND_AVERAGE_V1";

export interface SummativeCalculatedMarkScope {
  departmentId: string;
  actorUserId: string;
  examinationId: string;
  examinationCourseId: string;
  candidateId: string;
}

const sourceSelect = {
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

const calculatedMarkSelect = {
  id: true,
  departmentId: true,
  examinationId: true,
  examinationCourseId: true,
  candidateId: true,
  comparisonId: true,
  comparisonVersionSnapshot: true,
  threeTotalCalculationId: true,
  threeTotalCalculationVersionSnapshot: true,
  questionConfigurationId: true,
  firstSubmissionId: true,
  secondSubmissionId: true,
  thirdSubmissionId: true,
  firstSubmissionVersion: true,
  secondSubmissionVersion: true,
  thirdSubmissionVersion: true,
  summativeFullMarkSnapshot: true,
  calculationPath: true,
  calculatedMarkVersion: true,
  ruleVersionCode: true,
  derivedSummativeValue: true,
  calculatedAt: true,
  createdAt: true,
} satisfies Prisma.SummativeCalculatedMarkSelect;

type CalculatedMarkRecord = Prisma.SummativeCalculatedMarkGetPayload<{
  select: typeof calculatedMarkSelect;
}>;

@Injectable()
export class SummativeCalculatedMarkService {
  constructor(private readonly requestContextService: RequestContextService) {}

  async validateExisting(
    tx: Prisma.TransactionClient,
    scope: SummativeCalculatedMarkScope,
    calculatedMarkId: string,
  ) {
    const anchor = await tx.summativeCalculatedMark.findFirst({
      where: {
        id: calculatedMarkId,
        departmentId: scope.departmentId,
        examinationId: scope.examinationId,
        examinationCourseId: scope.examinationCourseId,
        candidateId: scope.candidateId,
      },
      select: {
        id: true,
        comparisonId: true,
        calculationPath: true,
        threeTotalCalculationId: true,
      },
    });
    if (!anchor) this.failClosed();
    const validated =
      anchor.calculationPath ===
      SummativeCalculatedMarkPath.FIRST_SECOND_AVERAGE
        ? await this.ensureForComparison(tx, scope, anchor.comparisonId)
        : anchor.calculationPath ===
              SummativeCalculatedMarkPath.THREE_TOTAL_NEAREST_PAIR &&
            anchor.threeTotalCalculationId
          ? await this.ensureForThreeTotal(
              tx,
              scope,
              anchor.threeTotalCalculationId,
            )
          : this.failClosed();
    if (!validated || validated.id !== calculatedMarkId) this.failClosed();
    return validated;
  }

  async ensureForComparison(
    tx: Prisma.TransactionClient,
    scope: SummativeCalculatedMarkScope,
    comparisonId: string,
  ) {
    await this.lockCandidate(tx, scope);
    const course = await this.loadCourse(tx, scope);
    const comparison = await tx.summativeExaminerComparison.findFirst({
      where: {
        id: comparisonId,
        departmentId: scope.departmentId,
        examinationId: scope.examinationId,
        examinationCourseId: scope.examinationCourseId,
        candidateId: scope.candidateId,
      },
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
        firstTotalSnapshot: true,
        secondTotalSnapshot: true,
        summativeFullMarkSnapshot: true,
        decision: true,
        firstSubmission: { select: sourceSelect },
        secondSubmission: { select: sourceSelect },
      },
    });
    if (!comparison) this.failClosed();
    if (
      comparison.decision ===
      SummativeExaminerComparisonDecision.THIRD_EXAMINATION_REQUIRED
    ) {
      return null;
    }
    if (
      comparison.decision !==
      SummativeExaminerComparisonDecision.THIRD_EXAMINATION_NOT_REQUIRED
    ) {
      this.failClosed();
    }

    const first = comparison.firstSubmission;
    const second = comparison.secondSubmission;
    this.assertCommonSourceChain(
      scope,
      course.summativeFullMark,
      comparison,
      first,
      second,
    );
    const configuration = await this.loadConfiguration(
      tx,
      scope,
      first.questionConfigurationId,
    );
    if (second.questionConfigurationId !== configuration.id) this.failClosed();

    const derivedSummativeValue = comparison.firstTotalSnapshot
      .add(comparison.secondTotalSnapshot)
      .div(2);
    const evidence = {
      comparisonId: comparison.id,
      comparisonVersionSnapshot: comparison.comparisonVersion,
      threeTotalCalculationId: null,
      threeTotalCalculationVersionSnapshot: null,
      questionConfigurationId: configuration.id,
      firstSubmissionId: first.id,
      secondSubmissionId: second.id,
      thirdSubmissionId: null,
      firstSubmissionVersion: first.versionNumber,
      secondSubmissionVersion: second.versionNumber,
      thirdSubmissionVersion: null,
      summativeFullMarkSnapshot: course.summativeFullMark,
      calculationPath: SummativeCalculatedMarkPath.FIRST_SECOND_AVERAGE,
      ruleVersionCode: SUMMATIVE_FIRST_SECOND_AVERAGE_RULE_VERSION,
      derivedSummativeValue,
    } as const;

    return this.findValidateOrCreate(tx, scope, evidence);
  }

  async ensureForThreeTotal(
    tx: Prisma.TransactionClient,
    scope: SummativeCalculatedMarkScope,
    calculationId: string,
  ) {
    await this.lockCandidate(tx, scope);
    const course = await this.loadCourse(tx, scope);
    const calculation = await tx.summativeThreeTotalCalculation.findFirst({
      where: {
        id: calculationId,
        departmentId: scope.departmentId,
        examinationId: scope.examinationId,
        examinationCourseId: scope.examinationCourseId,
        candidateId: scope.candidateId,
      },
      select: {
        id: true,
        departmentId: true,
        examinationId: true,
        examinationCourseId: true,
        candidateId: true,
        comparisonId: true,
        firstSubmissionId: true,
        secondSubmissionId: true,
        thirdSubmissionId: true,
        firstSubmissionVersion: true,
        secondSubmissionVersion: true,
        thirdSubmissionVersion: true,
        comparisonVersionSnapshot: true,
        questionConfigurationId: true,
        calculationVersion: true,
        firstTotalSnapshot: true,
        secondTotalSnapshot: true,
        thirdTotalSnapshot: true,
        summativeFullMarkSnapshot: true,
        ruleVersionCode: true,
        derivedSummativeValue: true,
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
            firstTotalSnapshot: true,
            secondTotalSnapshot: true,
            summativeFullMarkSnapshot: true,
            decision: true,
            firstSubmission: { select: sourceSelect },
            secondSubmission: { select: sourceSelect },
          },
        },
        thirdSubmission: {
          select: {
            id: true,
            departmentId: true,
            examinationId: true,
            examinationCourseId: true,
            candidateId: true,
            questionConfigurationId: true,
            versionNumber: true,
            status: true,
            totalMark: true,
            submittedAt: true,
            lockedAt: true,
          },
        },
      },
    });
    if (!calculation) this.failClosed();
    const comparison = calculation.comparison;
    const first = comparison.firstSubmission;
    const second = comparison.secondSubmission;
    const third = calculation.thirdSubmission;
    this.assertCommonSourceChain(
      scope,
      course.summativeFullMark,
      comparison,
      first,
      second,
    );
    if (
      comparison.decision !==
        SummativeExaminerComparisonDecision.THIRD_EXAMINATION_REQUIRED ||
      calculation.comparisonId !== comparison.id ||
      calculation.comparisonVersionSnapshot !== comparison.comparisonVersion ||
      calculation.firstSubmissionId !== first.id ||
      calculation.secondSubmissionId !== second.id ||
      calculation.firstSubmissionVersion !== first.versionNumber ||
      calculation.secondSubmissionVersion !== second.versionNumber ||
      !calculation.firstTotalSnapshot.eq(first.totalMark!) ||
      !calculation.secondTotalSnapshot.eq(second.totalMark!) ||
      !calculation.summativeFullMarkSnapshot.eq(course.summativeFullMark) ||
      calculation.calculationVersion <= 0 ||
      calculation.ruleVersionCode !== "SUMMATIVE_THREE_TOTAL_NEAREST_PAIR_V1" ||
      third.id !== calculation.thirdSubmissionId ||
      third.departmentId !== scope.departmentId ||
      third.examinationId !== scope.examinationId ||
      third.examinationCourseId !== scope.examinationCourseId ||
      third.candidateId !== scope.candidateId ||
      third.status !== SummativeThirdExaminerMarkSubmissionStatus.LOCKED ||
      third.totalMark === null ||
      third.submittedAt === null ||
      third.lockedAt === null ||
      third.versionNumber !== calculation.thirdSubmissionVersion ||
      !third.totalMark.eq(calculation.thirdTotalSnapshot) ||
      third.questionConfigurationId !== calculation.questionConfigurationId
    ) {
      this.failClosed();
    }
    const configuration = await this.loadConfiguration(
      tx,
      scope,
      calculation.questionConfigurationId,
    );
    if (
      first.questionConfigurationId !== configuration.id ||
      second.questionConfigurationId !== configuration.id
    ) {
      this.failClosed();
    }

    const evidence = {
      comparisonId: comparison.id,
      comparisonVersionSnapshot: comparison.comparisonVersion,
      threeTotalCalculationId: calculation.id,
      threeTotalCalculationVersionSnapshot: calculation.calculationVersion,
      questionConfigurationId: configuration.id,
      firstSubmissionId: first.id,
      secondSubmissionId: second.id,
      thirdSubmissionId: third.id,
      firstSubmissionVersion: first.versionNumber,
      secondSubmissionVersion: second.versionNumber,
      thirdSubmissionVersion: third.versionNumber,
      summativeFullMarkSnapshot: course.summativeFullMark,
      calculationPath: SummativeCalculatedMarkPath.THREE_TOTAL_NEAREST_PAIR,
      ruleVersionCode: calculation.ruleVersionCode,
      derivedSummativeValue: calculation.derivedSummativeValue,
    } as const;

    return this.findValidateOrCreate(tx, scope, evidence);
  }

  private async findValidateOrCreate(
    tx: Prisma.TransactionClient,
    scope: SummativeCalculatedMarkScope,
    evidence: Omit<
      CalculatedMarkRecord,
      | "id"
      | "departmentId"
      | "examinationId"
      | "examinationCourseId"
      | "candidateId"
      | "calculatedMarkVersion"
      | "calculatedAt"
      | "createdAt"
    >,
  ) {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "summative_calculated_marks"
      WHERE "department_id" = ${scope.departmentId}
        AND "examination_course_id" = ${scope.examinationCourseId}
        AND "candidate_id" = ${scope.candidateId}
      ORDER BY "calculated_mark_version", "id"
      FOR UPDATE
    `);
    const existing = await tx.summativeCalculatedMark.findUnique({
      where: { comparisonId: evidence.comparisonId },
      select: calculatedMarkSelect,
    });
    if (existing) {
      this.assertExisting(existing, scope, evidence);
      return existing;
    }
    const latest = await tx.summativeCalculatedMark.findFirst({
      where: {
        departmentId: scope.departmentId,
        examinationCourseId: scope.examinationCourseId,
        candidateId: scope.candidateId,
      },
      select: { calculatedMarkVersion: true },
      orderBy: { calculatedMarkVersion: "desc" },
    });
    const calculatedMarkVersion = (latest?.calculatedMarkVersion ?? 0) + 1;
    const calculatedMark = await tx.summativeCalculatedMark.create({
      data: {
        departmentId: scope.departmentId,
        examinationId: scope.examinationId,
        examinationCourseId: scope.examinationCourseId,
        candidateId: scope.candidateId,
        ...evidence,
        calculatedMarkVersion,
        calculatedAt: new Date(),
      },
      select: calculatedMarkSelect,
    });
    await this.writeAudit(tx, scope, calculatedMark);
    return calculatedMark;
  }

  private assertExisting(
    existing: CalculatedMarkRecord,
    scope: SummativeCalculatedMarkScope,
    evidence: Omit<
      CalculatedMarkRecord,
      | "id"
      | "departmentId"
      | "examinationId"
      | "examinationCourseId"
      | "candidateId"
      | "calculatedMarkVersion"
      | "calculatedAt"
      | "createdAt"
    >,
  ) {
    if (
      existing.departmentId !== scope.departmentId ||
      existing.examinationId !== scope.examinationId ||
      existing.examinationCourseId !== scope.examinationCourseId ||
      existing.candidateId !== scope.candidateId ||
      existing.calculatedMarkVersion <= 0 ||
      existing.comparisonId !== evidence.comparisonId ||
      existing.comparisonVersionSnapshot !==
        evidence.comparisonVersionSnapshot ||
      existing.threeTotalCalculationId !== evidence.threeTotalCalculationId ||
      existing.threeTotalCalculationVersionSnapshot !==
        evidence.threeTotalCalculationVersionSnapshot ||
      existing.questionConfigurationId !== evidence.questionConfigurationId ||
      existing.firstSubmissionId !== evidence.firstSubmissionId ||
      existing.secondSubmissionId !== evidence.secondSubmissionId ||
      existing.thirdSubmissionId !== evidence.thirdSubmissionId ||
      existing.firstSubmissionVersion !== evidence.firstSubmissionVersion ||
      existing.secondSubmissionVersion !== evidence.secondSubmissionVersion ||
      existing.thirdSubmissionVersion !== evidence.thirdSubmissionVersion ||
      !existing.summativeFullMarkSnapshot.eq(
        evidence.summativeFullMarkSnapshot,
      ) ||
      existing.calculationPath !== evidence.calculationPath ||
      existing.ruleVersionCode !== evidence.ruleVersionCode ||
      !existing.derivedSummativeValue.eq(evidence.derivedSummativeValue)
    ) {
      this.failClosed();
    }
  }

  private assertCommonSourceChain(
    scope: SummativeCalculatedMarkScope,
    fullMark: Prisma.Decimal,
    comparison: {
      id: string;
      departmentId: string;
      examinationId: string;
      examinationCourseId: string;
      candidateId: string;
      firstSubmissionId: string;
      secondSubmissionId: string;
      firstSubmissionVersion: number;
      secondSubmissionVersion: number;
      comparisonVersion: number;
      firstTotalSnapshot: Prisma.Decimal;
      secondTotalSnapshot: Prisma.Decimal;
      summativeFullMarkSnapshot: Prisma.Decimal;
    },
    first: Prisma.SummativeExaminerMarkSubmissionGetPayload<{
      select: typeof sourceSelect;
    }>,
    second: Prisma.SummativeExaminerMarkSubmissionGetPayload<{
      select: typeof sourceSelect;
    }>,
  ) {
    if (
      comparison.departmentId !== scope.departmentId ||
      comparison.examinationId !== scope.examinationId ||
      comparison.examinationCourseId !== scope.examinationCourseId ||
      comparison.candidateId !== scope.candidateId ||
      comparison.comparisonVersion <= 0 ||
      comparison.firstSubmissionId !== first.id ||
      comparison.secondSubmissionId !== second.id ||
      comparison.firstSubmissionVersion !== first.versionNumber ||
      comparison.secondSubmissionVersion !== second.versionNumber ||
      first.totalMark === null ||
      second.totalMark === null ||
      !comparison.firstTotalSnapshot.eq(first.totalMark!) ||
      !comparison.secondTotalSnapshot.eq(second.totalMark!) ||
      !comparison.summativeFullMarkSnapshot.eq(fullMark) ||
      first.departmentId !== scope.departmentId ||
      second.departmentId !== scope.departmentId ||
      first.examinationId !== scope.examinationId ||
      second.examinationId !== scope.examinationId ||
      first.examinationCourseId !== scope.examinationCourseId ||
      second.examinationCourseId !== scope.examinationCourseId ||
      first.candidateId !== scope.candidateId ||
      second.candidateId !== scope.candidateId ||
      first.examinerSeat !== ExaminationCourseExaminerSeat.FIRST_EXAMINER ||
      second.examinerSeat !== ExaminationCourseExaminerSeat.SECOND_EXAMINER ||
      first.status !== SummativeExaminerMarkSubmissionStatus.LOCKED ||
      second.status !== SummativeExaminerMarkSubmissionStatus.LOCKED ||
      first.submittedAt === null ||
      second.submittedAt === null ||
      first.lockedAt === null ||
      second.lockedAt === null ||
      first.versionNumber <= 0 ||
      second.versionNumber <= 0 ||
      first.totalMark.lt(0) ||
      second.totalMark.lt(0) ||
      first.totalMark.gt(fullMark) ||
      second.totalMark.gt(fullMark)
    ) {
      this.failClosed();
    }
  }

  private async loadCourse(
    tx: Prisma.TransactionClient,
    scope: SummativeCalculatedMarkScope,
  ) {
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
    return course;
  }

  private async loadConfiguration(
    tx: Prisma.TransactionClient,
    scope: SummativeCalculatedMarkScope,
    configurationId: string,
  ) {
    const configuration = await tx.summativeQuestionConfiguration.findFirst({
      where: {
        id: configurationId,
        departmentId: scope.departmentId,
        examinationId: scope.examinationId,
        examinationCourseId: scope.examinationCourseId,
        status: SummativeQuestionConfigurationStatus.LOCKED,
        archivedAt: null,
      },
      select: { id: true },
    });
    if (!configuration) this.failClosed();
    return configuration;
  }

  private async lockCandidate(
    tx: Prisma.TransactionClient,
    scope: SummativeCalculatedMarkScope,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "summative_examination_candidates"
      WHERE "id" = ${scope.candidateId}
        AND "department_id" = ${scope.departmentId}
        AND "examination_id" = ${scope.examinationId}
        AND "examination_course_id" = ${scope.examinationCourseId}
      FOR UPDATE
    `);
    if (rows.length !== 1) this.failClosed();
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    scope: SummativeCalculatedMarkScope,
    calculatedMark: CalculatedMarkRecord,
  ) {
    const requestContext = this.requestContextService.get();
    await tx.auditLog.create({
      data: {
        requestId: requestContext?.requestId,
        actorUserId: scope.actorUserId,
        actorType: "USER",
        departmentId: scope.departmentId,
        action:
          SUMMATIVE_EXAMINATION_AUDIT_EVENTS.CALCULATED_MARK_EVIDENCE_CREATED,
        targetType: "summative_calculated_mark",
        targetId: calculatedMark.id,
        outcome: "SUCCESS",
        ipAddress: requestContext?.audit.ipAddress,
        userAgent: requestContext?.audit.userAgent,
        contextJson: {
          calculatedMarkId: calculatedMark.id,
          calculatedMarkVersion: calculatedMark.calculatedMarkVersion,
          examinationId: scope.examinationId,
          examinationCourseId: scope.examinationCourseId,
          candidateId: scope.candidateId,
          comparisonId: calculatedMark.comparisonId,
          threeTotalCalculationId:
            calculatedMark.threeTotalCalculationId ?? undefined,
          calculationPath: calculatedMark.calculationPath,
          ruleVersionCode: calculatedMark.ruleVersionCode,
        },
      },
    });
  }

  private failClosed(): never {
    throw new InternalServerErrorException(
      "Summative calculated-mark evidence is invalid",
    );
  }
}
