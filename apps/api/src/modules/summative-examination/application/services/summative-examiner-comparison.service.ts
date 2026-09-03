import { Injectable, InternalServerErrorException } from "@nestjs/common";
import {
  ExaminationCourseExaminerSeat,
  Prisma,
  SummativeExaminerMarkSubmissionStatus,
} from "@prisma/client";

import { RequestContextService } from "@/common/request-context/request-context.service";

import { SUMMATIVE_EXAMINATION_AUDIT_EVENTS } from "../../domain/summative-examination.audit-events";
import { calculateSummativeExaminerComparison } from "../../domain/summative-examiner-comparison.rule";
import { SummativeCalculatedMarkService } from "./summative-calculated-mark.service";

export interface SummativeComparisonCreationScope {
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
  examinerAssignmentId: true,
  examinerSeat: true,
  versionNumber: true,
  status: true,
  totalMark: true,
  examinerAssignment: {
    select: {
      departmentId: true,
      examinationId: true,
      examinationCourseId: true,
      seat: true,
    },
  },
} as const;

type ComparisonSource = Prisma.SummativeExaminerMarkSubmissionGetPayload<{
  select: typeof sourceSelect;
}>;

@Injectable()
export class SummativeExaminerComparisonService {
  constructor(
    private readonly requestContextService: RequestContextService,
    private readonly calculatedMarkService: SummativeCalculatedMarkService,
  ) {}

  /**
   * Call inside the existing marks Serializable transaction after the exact
   * candidate has been locked. The candidate remains the serialization boundary.
   */
  async createIfReady(
    tx: Prisma.TransactionClient,
    scope: SummativeComparisonCreationScope,
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

    await tx.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "summative_examiner_mark_submissions"
      WHERE "department_id" = ${scope.departmentId}
        AND "examination_id" = ${scope.examinationId}
        AND "examination_course_id" = ${scope.examinationCourseId}
        AND "candidate_id" = ${scope.candidateId}
        AND "examiner_seat" IN ('FIRST_EXAMINER', 'SECOND_EXAMINER')
      ORDER BY "examiner_seat", "version_number", "id"
      FOR UPDATE
    `);
    const sources = await tx.summativeExaminerMarkSubmission.findMany({
      where: {
        departmentId: scope.departmentId,
        examinationId: scope.examinationId,
        examinationCourseId: scope.examinationCourseId,
        candidateId: scope.candidateId,
        examinerSeat: {
          in: [
            ExaminationCourseExaminerSeat.FIRST_EXAMINER,
            ExaminationCourseExaminerSeat.SECOND_EXAMINER,
          ],
        },
      },
      select: sourceSelect,
      orderBy: [{ examinerSeat: "asc" }, { versionNumber: "asc" }, { id: "asc" }],
    });
    const firstSources = sources.filter(
      (source) =>
        source.examinerSeat === ExaminationCourseExaminerSeat.FIRST_EXAMINER,
    );
    const secondSources = sources.filter(
      (source) =>
        source.examinerSeat === ExaminationCourseExaminerSeat.SECOND_EXAMINER,
    );
    if (firstSources.length > 1 || secondSources.length > 1) this.failClosed();
    if (firstSources.length === 0 || secondSources.length === 0) return null;

    const first = firstSources[0]!;
    const second = secondSources[0]!;
    this.assertExactSource(
      first,
      scope,
      ExaminationCourseExaminerSeat.FIRST_EXAMINER,
    );
    this.assertExactSource(
      second,
      scope,
      ExaminationCourseExaminerSeat.SECOND_EXAMINER,
    );
    if (
      first.status !== SummativeExaminerMarkSubmissionStatus.LOCKED ||
      second.status !== SummativeExaminerMarkSubmissionStatus.LOCKED
    ) {
      return null;
    }
    if (first.totalMark === null || second.totalMark === null) this.failClosed();

    const calculation = this.calculateOrFailClosed(
      first.totalMark,
      second.totalMark,
      course.summativeFullMark,
    );

    await tx.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "summative_examiner_comparisons"
      WHERE "department_id" = ${scope.departmentId}
        AND "examination_course_id" = ${scope.examinationCourseId}
        AND "candidate_id" = ${scope.candidateId}
      ORDER BY "comparison_version", "id"
      FOR UPDATE
    `);
    const existing = await tx.summativeExaminerComparison.findFirst({
      where: {
        firstSubmissionId: first.id,
        secondSubmissionId: second.id,
      },
    });
    if (existing) {
      await this.calculatedMarkService.ensureForComparison(
        tx,
        scope,
        existing.id,
      );
      return existing;
    }

    const priorComparisons = await tx.summativeExaminerComparison.findMany({
      where: {
        departmentId: scope.departmentId,
        examinationCourseId: scope.examinationCourseId,
        candidateId: scope.candidateId,
      },
      select: { comparisonVersion: true },
      orderBy: { comparisonVersion: "asc" },
    });
    const comparisonVersion =
      (priorComparisons.at(-1)?.comparisonVersion ?? 0) + 1;
    const calculatedAt = new Date();
    const comparison = await tx.summativeExaminerComparison.create({
      data: {
        departmentId: scope.departmentId,
        examinationId: scope.examinationId,
        examinationCourseId: scope.examinationCourseId,
        candidateId: scope.candidateId,
        firstSubmissionId: first.id,
        secondSubmissionId: second.id,
        firstSubmissionVersion: first.versionNumber,
        secondSubmissionVersion: second.versionNumber,
        comparisonVersion,
        firstTotalSnapshot: calculation.firstTotal,
        secondTotalSnapshot: calculation.secondTotal,
        summativeFullMarkSnapshot: calculation.summativeFullMark,
        absoluteDifference: calculation.absoluteDifference,
        variancePercentage: calculation.variancePercentage,
        thresholdPercentageSnapshot: calculation.thresholdPercentage,
        ruleVersionCode: calculation.ruleVersionCode,
        decision: calculation.decision,
        calculatedAt,
      },
    });
    await this.writeAudit(tx, scope, comparison);
    await this.calculatedMarkService.ensureForComparison(
      tx,
      scope,
      comparison.id,
    );
    return comparison;
  }

  private assertExactSource(
    source: ComparisonSource,
    scope: SummativeComparisonCreationScope,
    seat: ExaminationCourseExaminerSeat,
  ) {
    if (
      source.departmentId !== scope.departmentId ||
      source.examinationId !== scope.examinationId ||
      source.examinationCourseId !== scope.examinationCourseId ||
      source.candidateId !== scope.candidateId ||
      source.examinerSeat !== seat ||
      source.versionNumber <= 0 ||
      source.examinerAssignment.departmentId !== scope.departmentId ||
      source.examinerAssignment.examinationId !== scope.examinationId ||
      source.examinerAssignment.examinationCourseId !== scope.examinationCourseId ||
      source.examinerAssignment.seat !== seat
    ) {
      this.failClosed();
    }
  }

  private calculateOrFailClosed(
    firstTotal: Prisma.Decimal,
    secondTotal: Prisma.Decimal,
    summativeFullMark: Prisma.Decimal,
  ) {
    try {
      return calculateSummativeExaminerComparison(
        firstTotal,
        secondTotal,
        summativeFullMark,
      );
    } catch {
      return this.failClosed();
    }
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    scope: SummativeComparisonCreationScope,
    comparison: {
      id: string;
      firstSubmissionId: string;
      secondSubmissionId: string;
      firstSubmissionVersion: number;
      secondSubmissionVersion: number;
      comparisonVersion: number;
      ruleVersionCode: string;
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
          SUMMATIVE_EXAMINATION_AUDIT_EVENTS.EXAMINER_COMPARISON_CREATED,
        targetType: "summative_examiner_comparison",
        targetId: comparison.id,
        outcome: "SUCCESS",
        ipAddress: requestContext?.audit.ipAddress,
        userAgent: requestContext?.audit.userAgent,
        contextJson: {
          comparisonId: comparison.id,
          examinationId: scope.examinationId,
          examinationCourseId: scope.examinationCourseId,
          candidateId: scope.candidateId,
          firstSubmissionId: comparison.firstSubmissionId,
          secondSubmissionId: comparison.secondSubmissionId,
          firstSubmissionVersion: comparison.firstSubmissionVersion,
          secondSubmissionVersion: comparison.secondSubmissionVersion,
          comparisonVersion: comparison.comparisonVersion,
          ruleVersionCode: comparison.ruleVersionCode,
        },
      },
    });
  }

  private failClosed(): never {
    throw new InternalServerErrorException(
      "Summative Examiner comparison evidence is invalid",
    );
  }
}
