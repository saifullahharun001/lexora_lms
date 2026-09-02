import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";

import { SUMMATIVE_EXAMINATION_AUDIT_EVENTS } from "../../domain/summative-examination.audit-events";
import type { SaveExaminerQuestionMarkDto } from "../../presentation/http/dto/examiner-marks.dto";
import { SummativeThreeTotalCalculationService } from "./summative-three-total-calculation.service";

const AWARDED_DECIMAL_6_2_PATTERN = /^\d{1,4}(?:\.\d{1,2})?$/;

type SubmissionRecord = Prisma.SummativeThirdExaminerMarkSubmissionGetPayload<{
  select: typeof submissionSelect;
}>;

const submissionSelect = {
  id: true,
  candidateId: true,
  examinationCourseId: true,
  referralId: true,
  questionConfigurationId: true,
  versionNumber: true,
  status: true,
  totalMark: true,
  submittedAt: true,
  lockedAt: true,
  createdAt: true,
  updatedAt: true,
  questionMarks: {
    select: {
      id: true,
      questionItemId: true,
      awardedMark: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { questionItemId: "asc" },
  },
} satisfies Prisma.SummativeThirdExaminerMarkSubmissionSelect;

export interface ThirdExaminerMarkingAuthority {
  actorUserId: string;
  departmentId: string;
  examinationId: string;
  examinationCourseId: string;
  candidateId: string;
  referralId: string;
  questionConfigurationId: string;
}

interface LockedMarkingScope {
  examinationId: string;
  examinationCourseId: string;
  questionConfigurationId: string;
}

@Injectable()
export class SummativeThirdExaminerMarksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
    private readonly threeTotalCalculation: SummativeThreeTotalCalculationService,
  ) {}

  private async getReferralAuthority(examinationCourseId: string, candidateId?: string): Promise<ThirdExaminerMarkingAuthority[]> {
    const principal = this.requestContextService.get()?.principal;
    if (!principal?.isAuthenticated || !principal.actorId || !principal.activeDepartmentId) {
      throw new BadRequestException("Missing request context");
    }

    const actorUserId = principal.actorId;
    const departmentId = principal.activeDepartmentId;
    const evaluatedAt = new Date();

    const referrals = await this.prisma.summativeThirdExaminationReferral.findMany({
      where: {
        departmentId,
        examinationCourseId,
        thirdExaminerUserId: actorUserId,
        status: "ASSIGNED",
        archivedAt: null,
        deadline: { gt: evaluatedAt },
        ...(candidateId ? { candidateId } : {})
      },
    });

    return referrals.map(ref => ({
      actorUserId,
      departmentId,
      examinationId: ref.examinationId,
      examinationCourseId: ref.examinationCourseId,
      candidateId: ref.candidateId,
      referralId: ref.id,
      questionConfigurationId: ref.questionConfigurationId,
    }));
  }

  async getWorkspace(examinationCourseId: string) {
    const authorities = await this.getReferralAuthority(examinationCourseId);

    if (authorities.length === 0) {
      return {
        candidates: []
      };
    }
    const authority = authorities[0]!;

    const course = await this.prisma.examinationCourse.findFirst({
      where: {
        id: authority.examinationCourseId,
        departmentId: authority.departmentId,
        archivedAt: null,
      },
      select: {
        id: true,
        examinationId: true,
        summativeFullMark: true,
        lockedQuestionConfigurationId: true,
      },
    });

    if (!course) {
      throw new NotFoundException("Examination course not found");
    }

    const candidateIds = authorities.map(a => a.candidateId);

    const activeCandidates = await this.prisma.summativeExaminationCandidate.findMany({
      where: {
        departmentId: authority.departmentId,
        examinationCourseId: authority.examinationCourseId,
        id: { in: candidateIds }
      },
      select: {
        id: true,
        registeredAt: true,
      },
      orderBy: { id: "asc" },
    });

    const submissions = await this.prisma.summativeThirdExaminerMarkSubmission.findMany({
      where: {
        departmentId: authority.departmentId,
        examinationCourseId: authority.examinationCourseId,
        candidateId: { in: candidateIds },
        referralId: { in: authorities.map(a => a.referralId) },
      },
      select: {
        candidateId: true,
        versionNumber: true,
        status: true,
        submittedAt: true,
        lockedAt: true,
      },
    });

    return {
      examinationCourse: {
        id: course.id,
        examinationId: course.examinationId,
        summativeFullMark: course.summativeFullMark.toString(),
      },
      candidates: activeCandidates.map((candidate) => {
        const candidateSubmissions = submissions
          .filter((sub) => sub.candidateId === candidate.id)
          .sort((a, b) => b.versionNumber - a.versionNumber);
        const latestSubmission = candidateSubmissions[0];

        const auth = authorities.find(a => a.candidateId === candidate.id)!;

        return {
          id: candidate.id,
          registeredAt: candidate.registeredAt,
          questionConfigurationId: auth.questionConfigurationId,
          submission: latestSubmission
            ? {
                versionNumber: latestSubmission.versionNumber,
                status: latestSubmission.status,
                submittedAt: latestSubmission.submittedAt,
                lockedAt: latestSubmission.lockedAt,
              }
            : null,
        };
      }),
    };
  }

  async getOwnSubmission(examinationCourseId: string, candidateId: string) {
    const auths = await this.getReferralAuthority(examinationCourseId, candidateId);
    if (auths.length === 0) throw new NotFoundException("Third Examination Referral not found or inactive");
    const authority = auths[0]!;

    await this.assertCandidateReadScope(authority, candidateId);
    const submission = await this.findLatestOwnSubmission(authority, candidateId);
    return { candidateId, submission: this.serializeSubmission(submission) };
  }

  async saveQuestionMark(
    examinationCourseId: string,
    candidateId: string,
    questionItemId: string,
    input: SaveExaminerQuestionMarkDto,
  ) {
    const auths = await this.getReferralAuthority(examinationCourseId, candidateId);
    if (auths.length === 0) throw new NotFoundException("Third Examination Referral not found or inactive");
    const authority = auths[0]!;

    const transitionAt = new Date();
    const awardedMark = this.parseAwardedMark(input.awardedMark);

    return this.serializable(async (tx) => {
      const scope = await this.lockMarkingScope(tx, authority, transitionAt);
      const item = await this.lockActiveQuestionItem(
        tx,
        authority,
        authority.questionConfigurationId,
        questionItemId,
      );
      await this.assertCandidateLockScope(tx, authority, candidateId);

      let submission = await this.lockLatestOwnSubmission(tx, authority, candidateId);
      if (submission?.status === "LOCKED") {
        throw new ConflictException("Cannot save question marks to a LOCKED submission");
      }

      if (!submission) {
        await this.assertSeatHasNoExistingSubmission(tx, authority, candidateId);
        const submissionId = this.prisma.summativeThirdExaminerMarkSubmission.fields.id.name
          ? undefined
          : undefined; // Rely on cuid default
        submission = await tx.summativeThirdExaminerMarkSubmission.create({
          data: {
            departmentId: authority.departmentId,
            examinationId: authority.examinationId,
            examinationCourseId: authority.examinationCourseId,
            candidateId,
            referralId: authority.referralId,
            thirdExaminerUserId: authority.actorUserId,
            questionConfigurationId: authority.questionConfigurationId,
            versionNumber: 1,
            status: "DRAFT",
          },
          select: submissionSelect,
        });
        await this.writeAudit(
          tx,
          authority,
          submission,
          "summative-examination.third-examiner-mark-submission.draft-created",
          {},
        );
      }

      this.assertSubmissionUsesScope(submission, scope);

      const existingMark = submission.questionMarks.find(
        (mark) => mark.questionItemId === questionItemId,
      );

      if (awardedMark !== null) {
        if (awardedMark.greaterThan(item.fullMark)) {
          throw new BadRequestException("Awarded mark exceeds question item full mark");
        }
        if (existingMark) {
          if (!existingMark.awardedMark.equals(awardedMark)) {
            await tx.summativeThirdExaminerQuestionMark.update({
              where: {
                submissionId_questionItemId: {
                  submissionId: submission.id,
                  questionItemId,
                },
                departmentId: authority.departmentId,
                examinationCourseId: authority.examinationCourseId,
              },
              data: { awardedMark },
            });
          }
        } else {
          await tx.summativeThirdExaminerQuestionMark.create({
            data: {
              departmentId: authority.departmentId,
              examinationCourseId: authority.examinationCourseId,
              submissionId: submission.id,
              questionConfigurationId: authority.questionConfigurationId,
              questionItemId,
              awardedMark,
            },
          });
        }
      } else if (existingMark) {
        await tx.summativeThirdExaminerQuestionMark.delete({
          where: {
            submissionId_questionItemId: {
              submissionId: submission.id,
              questionItemId,
            },
            departmentId: authority.departmentId,
            examinationCourseId: authority.examinationCourseId,
          },
        });
      }

      const reloaded = await tx.summativeThirdExaminerMarkSubmission.findUniqueOrThrow({
        where: { id: submission.id },
        select: submissionSelect,
      });
      return { candidateId, submission: this.serializeSubmission(reloaded) };
    });
  }

  async finalizeSubmission(examinationCourseId: string, candidateId: string) {
    const auths = await this.getReferralAuthority(examinationCourseId, candidateId);
    if (auths.length === 0) throw new NotFoundException("Third Examination Referral not found or inactive");
    const authority = auths[0]!;

    const transitionAt = new Date();

    return this.serializable(async (tx) => {
      const scope = await this.lockMarkingScope(tx, authority, transitionAt);
      const items = await this.lockActiveQuestionItems(
        tx,
        authority,
        authority.questionConfigurationId,
      );
      await this.assertCandidateLockScope(tx, authority, candidateId);

      const submission = await this.lockLatestOwnSubmission(tx, authority, candidateId);
      if (!submission) {
        throw new ConflictException("Cannot finalize when no draft submission exists");
      }
      this.assertSubmissionUsesScope(submission, scope);
      if (submission.status === "LOCKED") {
        await this.threeTotalCalculation.ensureForLockedThird(tx, {
          departmentId: authority.departmentId,
          actorUserId: authority.actorUserId,
          examinationId: authority.examinationId,
          examinationCourseId: authority.examinationCourseId,
          candidateId,
          referralId: authority.referralId,
          thirdSubmissionId: submission.id,
        });
        return { candidateId, submission: this.serializeSubmission(submission) };
      }

      await this.lockQuestionMarks(tx, authority, submission.id);

      const persistedMarksMap = new Map(
        submission.questionMarks.map((m) => [m.questionItemId, m.awardedMark]),
      );
      const requiredItemsMissing = items.filter(
        (item) => item.isRequired && !persistedMarksMap.has(item.id),
      );
      if (requiredItemsMissing.length > 0) {
        throw new ConflictException("Cannot finalize submission while required question marks are missing");
      }

      const calculatedTotal = submission.questionMarks.reduce(
        (sum, mark) => sum.add(mark.awardedMark),
        new Prisma.Decimal(0),
      );

      const finalized = await tx.summativeThirdExaminerMarkSubmission.update({
        where: {
          id: submission.id,
          departmentId: authority.departmentId,
          examinationCourseId: authority.examinationCourseId,
          candidateId,
          status: "DRAFT",
        },
        data: {
          status: "LOCKED",
          totalMark: calculatedTotal,
          submittedAt: transitionAt,
          lockedAt: transitionAt,
        },
        select: submissionSelect,
      });

      await this.writeAudit(
        tx,
        authority,
        finalized,
        SUMMATIVE_EXAMINATION_AUDIT_EVENTS.THIRD_EXAMINER_MARK_SUBMISSION_LOCKED,
        {
          statusTransition: "DRAFT_TO_LOCKED",
          persistedQuestionMarkCount: submission.questionMarks.length,
        },
      );

      await this.threeTotalCalculation.ensureForLockedThird(tx, {
        departmentId: authority.departmentId,
        actorUserId: authority.actorUserId,
        examinationId: authority.examinationId,
        examinationCourseId: authority.examinationCourseId,
        candidateId,
        referralId: authority.referralId,
        thirdSubmissionId: finalized.id,
      });

      return { candidateId, submission: this.serializeSubmission(finalized) };
    });
  }

  private async lockMarkingScope(
    tx: Prisma.TransactionClient,
    authority: ThirdExaminerMarkingAuthority,
    evaluatedAt: Date,
  ): Promise<LockedMarkingScope> {
    const course = await tx.examinationCourse.findFirst({
      where: {
        id: authority.examinationCourseId,
        departmentId: authority.departmentId,
        examinationId: authority.examinationId,
        archivedAt: null,
      },
      select: {
        lockedQuestionConfigurationId: true,
      },
    });

    if (!course) {
      throw new NotFoundException("Examination course not found");
    }

    const referral = await tx.summativeThirdExaminationReferral.findFirst({
      where: {
        id: authority.referralId,
        departmentId: authority.departmentId,
        examinationId: authority.examinationId,
        examinationCourseId: authority.examinationCourseId,
        candidateId: authority.candidateId,
        thirdExaminerUserId: authority.actorUserId,
        questionConfigurationId: authority.questionConfigurationId,
        status: "ASSIGNED",
        archivedAt: null,
      },
    });

    if (!referral) {
      throw new NotFoundException("Third Examination Referral not found or inactive");
    }

    if (referral.deadline <= evaluatedAt) {
      throw new ConflictException("Marking deadline has passed");
    }

    return {
      examinationId: authority.examinationId,
      examinationCourseId: authority.examinationCourseId,
      questionConfigurationId: authority.questionConfigurationId,
    };
  }

  private async assertCandidateReadScope(
    authority: ThirdExaminerMarkingAuthority,
    candidateId: string,
  ) {
    const candidate = await this.prisma.summativeExaminationCandidate.findFirst({
      where: {
        id: candidateId,
        departmentId: authority.departmentId,
        examinationId: authority.examinationId,
        examinationCourseId: authority.examinationCourseId,
      },
      select: { id: true },
    });
    if (!candidate) {
      throw new NotFoundException("Examination candidate not found");
    }
  }

  private async assertCandidateLockScope(
    tx: Prisma.TransactionClient,
    authority: ThirdExaminerMarkingAuthority,
    candidateId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "summative_examination_candidates"
      WHERE "id" = ${candidateId}
        AND "department_id" = ${authority.departmentId}
        AND "examination_id" = ${authority.examinationId}
        AND "examination_course_id" = ${authority.examinationCourseId}
      FOR UPDATE
    `;
    if (rows.length !== 1) {
      throw new NotFoundException("Examination candidate not found");
    }
  }

  private async lockLatestOwnSubmission(
    tx: Prisma.TransactionClient,
    authority: ThirdExaminerMarkingAuthority,
    candidateId: string,
  ): Promise<SubmissionRecord | null> {
    await tx.$queryRaw`
      SELECT "id"
      FROM "summative_third_examiner_mark_submissions"
      WHERE "department_id" = ${authority.departmentId}
        AND "examination_id" = ${authority.examinationId}
        AND "examination_course_id" = ${authority.examinationCourseId}
        AND "candidate_id" = ${candidateId}
        AND "referral_id" = ${authority.referralId}
      ORDER BY "version_number", "id"
      FOR UPDATE
    `;
    return tx.summativeThirdExaminerMarkSubmission.findFirst({
      where: this.ownSubmissionWhere(authority, candidateId),
      select: submissionSelect,
      orderBy: { versionNumber: "desc" },
    });
  }

  private async findLatestOwnSubmission(
    authority: ThirdExaminerMarkingAuthority,
    candidateId: string,
  ): Promise<SubmissionRecord | null> {
    return this.prisma.summativeThirdExaminerMarkSubmission.findFirst({
      where: this.ownSubmissionWhere(authority, candidateId),
      select: submissionSelect,
      orderBy: { versionNumber: "desc" },
    });
  }

  private async assertSeatHasNoExistingSubmission(
    tx: Prisma.TransactionClient,
    authority: ThirdExaminerMarkingAuthority,
    candidateId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "summative_third_examiner_mark_submissions"
      WHERE "department_id" = ${authority.departmentId}
        AND "examination_id" = ${authority.examinationId}
        AND "examination_course_id" = ${authority.examinationCourseId}
        AND "candidate_id" = ${candidateId}
        AND "referral_id" = ${authority.referralId}
      ORDER BY "version_number", "id"
      FOR UPDATE
    `;
    if (rows.length !== 0) {
      throw new ConflictException(
        "Existing Examiner seat submission requires an authorised correction workflow",
      );
    }
  }

  private async lockActiveQuestionItem(
    tx: Prisma.TransactionClient,
    authority: ThirdExaminerMarkingAuthority,
    configurationId: string,
    questionItemId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "summative_question_configuration_items"
      WHERE "id" = ${questionItemId}
        AND "department_id" = ${authority.departmentId}
        AND "configuration_id" = ${configurationId}
        AND "examination_course_id" = ${authority.examinationCourseId}
        AND "is_active" = TRUE
      FOR UPDATE
    `;
    if (rows.length !== 1) {
      throw new NotFoundException("Question item not found");
    }
    const item = await tx.summativeQuestionConfigurationItem.findFirst({
      where: {
        id: questionItemId,
        departmentId: authority.departmentId,
        configurationId,
        examinationCourseId: authority.examinationCourseId,
        isActive: true,
      },
      select: { id: true, fullMark: true, isRequired: true },
    });
    if (!item) throw new NotFoundException("Question item not found");
    return item;
  }

  private async lockActiveQuestionItems(
    tx: Prisma.TransactionClient,
    authority: ThirdExaminerMarkingAuthority,
    configurationId: string,
  ) {
    await tx.$queryRaw`
      SELECT "id"
      FROM "summative_question_configuration_items"
      WHERE "department_id" = ${authority.departmentId}
        AND "configuration_id" = ${configurationId}
        AND "examination_course_id" = ${authority.examinationCourseId}
        AND "is_active" = TRUE
      ORDER BY "id"
      FOR UPDATE
    `;
    return tx.summativeQuestionConfigurationItem.findMany({
      where: {
        departmentId: authority.departmentId,
        configurationId,
        examinationCourseId: authority.examinationCourseId,
        isActive: true,
      },
      select: { id: true, fullMark: true, isRequired: true },
      orderBy: { id: "asc" },
    });
  }

  private async lockQuestionMarks(
    tx: Prisma.TransactionClient,
    authority: ThirdExaminerMarkingAuthority,
    submissionId: string,
  ) {
    await tx.$queryRaw`
      SELECT "id"
      FROM "summative_third_examiner_question_marks"
      WHERE "submission_id" = ${submissionId}
        AND "department_id" = ${authority.departmentId}
        AND "examination_course_id" = ${authority.examinationCourseId}
      ORDER BY "question_item_id", "id"
      FOR UPDATE
    `;
  }

  private ownSubmissionWhere(
    authority: ThirdExaminerMarkingAuthority,
    candidateId: string,
    submissionId?: string,
  ): Prisma.SummativeThirdExaminerMarkSubmissionWhereInput {
    return {
      ...(submissionId ? { id: submissionId } : {}),
      departmentId: authority.departmentId,
      examinationId: authority.examinationId,
      examinationCourseId: authority.examinationCourseId,
      candidateId,
      referralId: authority.referralId,
    };
  }

  private assertSubmissionUsesScope(
    submission: Pick<SubmissionRecord, "examinationCourseId" | "questionConfigurationId">,
    scope: LockedMarkingScope,
  ) {
    if (
      submission.examinationCourseId !== scope.examinationCourseId ||
      submission.questionConfigurationId !== scope.questionConfigurationId
    ) {
      throw new ConflictException(
        "Examiner submission does not use the exact question configuration bound to the referral",
      );
    }
  }

  private parseAwardedMark(value: string | null | undefined) {
    if (value === undefined || value === null) return value ?? null;
    if (typeof value !== "string" || !AWARDED_DECIMAL_6_2_PATTERN.test(value)) {
      throw new BadRequestException(
        "awardedMark must be a non-negative decimal string within Decimal(6,2)",
      );
    }
    try {
      return new Prisma.Decimal(value);
    } catch {
      throw new BadRequestException(
        "awardedMark must be a valid Decimal(6,2) value",
      );
    }
  }

  private serializeSubmission(submission: Pick<SubmissionRecord, "id" | "candidateId" | "examinationCourseId" | "referralId" | "questionConfigurationId" | "versionNumber" | "status" | "totalMark" | "submittedAt" | "lockedAt" | "createdAt" | "updatedAt"> & { questionMarks: { id: string, questionItemId: string, awardedMark: Prisma.Decimal, createdAt: Date, updatedAt: Date }[] } | null) {
    if (!submission) return null;
    const calculatedTotal = submission.questionMarks.reduce(
      (sum, mark) => sum.add(mark.awardedMark),
      new Prisma.Decimal(0),
    );
    return {
      id: submission.id,
      candidateId: submission.candidateId,
      examinationCourseId: submission.examinationCourseId,
      referralId: submission.referralId,
      questionConfigurationId: submission.questionConfigurationId,
      versionNumber: submission.versionNumber,
      status: submission.status,
      calculatedTotal: calculatedTotal.toString(),
      totalMark: submission.totalMark?.toString() ?? null,
      submittedAt: submission.submittedAt,
      lockedAt: submission.lockedAt,
      createdAt: submission.createdAt,
      updatedAt: submission.updatedAt,
      questionMarks: submission.questionMarks.map((mark) => ({
        id: mark.id,
        questionItemId: mark.questionItemId,
        awardedMark: mark.awardedMark.toString(),
        createdAt: mark.createdAt,
        updatedAt: mark.updatedAt,
      })),
    };
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    authority: ThirdExaminerMarkingAuthority,
    submission: Pick<
      SubmissionRecord,
      "id" | "candidateId" | "versionNumber" | "status"
    >,
    action: string,
    metadata: Prisma.InputJsonObject,
  ) {
    const requestContext = this.requestContextService.get();
    await tx.auditLog.create({
      data: {
        requestId: requestContext?.requestId,
        actorUserId: authority.actorUserId,
        actorType: "USER",
        departmentId: authority.departmentId,
        action,
        targetType: "summative_third_examiner_mark_submission",
        targetId: submission.id,
        outcome: "SUCCESS",
        ipAddress: requestContext?.audit.ipAddress,
        userAgent: requestContext?.audit.userAgent,
        contextJson: {
          examinationId: authority.examinationId,
          examinationCourseId: authority.examinationCourseId,
          candidateId: submission.candidateId,
          referralId: authority.referralId,
          submissionId: submission.id,
          submissionVersion: submission.versionNumber,
          submissionStatus: submission.status,
          ...metadata,
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
