import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditActorType,
  AuditOutcome,
  Prisma,
  SummativeExaminerComparisonDecision,
  SummativeThirdExaminationReferralStatus,
  UserStatus,
} from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";
import { PLATFORM_ROLES } from "@/modules/identity-access/authorization/roles.constants";

import { SUMMATIVE_EXAMINATION_AUDIT_EVENTS } from "../../domain/summative-examination.audit-events";
import { AssignSummativeThirdExaminerReferralDto } from "../../presentation/http/dto/assign-summative-third-examiner-referral.dto";
import { SummativeManagementAuthorizerService, SummativeManagementAuthority } from "./summative-management-authorizer.service";

@Injectable()
export class SummativeThirdExaminationReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
    private readonly authorizer: SummativeManagementAuthorizerService,
  ) {}

  async assignThirdExaminer(dto: AssignSummativeThirdExaminerReferralDto) {
    const authority = await this.authorizer.authorize("summative-examination.examiner-assignment");

    if (dto.deadline <= new Date()) {
      throw new BadRequestException("Deadline must be in the future");
    }

    return this.withRetry(async (tx) => {
      const comparison = await this.lockAndValidateComparison(tx, authority, dto.comparisonId);

      const evaluatedAt = new Date();
      await this.validateThirdExaminerEligibility(tx, authority, dto.thirdExaminerUserId, evaluatedAt, comparison);

      const assignmentVersion = await this.getNextAssignmentVersion(tx, comparison);

      const referral = await tx.summativeThirdExaminationReferral.create({
        data: {
          departmentId: comparison.departmentId,
          examinationId: comparison.examinationId,
          examinationCourseId: comparison.examinationCourseId,
          candidateId: comparison.candidateId,
          comparisonId: comparison.id,
          thirdExaminerUserId: dto.thirdExaminerUserId,
          assignedByUserId: authority.actorUserId,
          questionConfigurationId: comparison.firstSubmission.questionConfigurationId,
          comparisonVersionSnapshot: comparison.comparisonVersion,
          ruleVersionCode: comparison.ruleVersionCode,
          deadline: dto.deadline,
          status: SummativeThirdExaminationReferralStatus.ASSIGNED,
          assignmentVersion,
        },
      });

      await this.auditAssignment(tx, authority, referral);

      return { id: referral.id };
    });
  }

  private async lockAndValidateComparison(
    tx: Prisma.TransactionClient,
    authority: SummativeManagementAuthority,
    comparisonId: string,
  ) {
    // Lock order: examination -> course -> candidate -> comparison
    const comparisonHeader = await tx.summativeExaminerComparison.findFirst({
      where: {
        id: comparisonId,
        departmentId: authority.departmentId,
      },
      select: {
        examinationId: true,
        examinationCourseId: true,
        candidateId: true,
      },
    });

    if (!comparisonHeader) {
      throw new NotFoundException("Comparison not found");
    }

    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "examinations"
      WHERE "id" = ${comparisonHeader.examinationId}
      FOR SHARE
    `);

    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "examination_courses"
      WHERE "id" = ${comparisonHeader.examinationCourseId}
      FOR SHARE
    `);

    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "summative_examination_candidates"
      WHERE "id" = ${comparisonHeader.candidateId}
      FOR SHARE
    `);

    const comparisons = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "summative_examiner_comparisons"
      WHERE "id" = ${comparisonId}
      FOR NO KEY UPDATE
    `);

    if (comparisons.length !== 1) {
      throw new NotFoundException("Comparison not found");
    }

    const comparison = await tx.summativeExaminerComparison.findUnique({
      where: { id: comparisonId },
      include: {
        firstSubmission: {
          include: { examinerAssignment: true },
        },
        secondSubmission: {
          include: { examinerAssignment: true },
        },
      },
    });

    if (!comparison) {
      throw new NotFoundException("Comparison not found");
    }

    if (comparison.decision !== SummativeExaminerComparisonDecision.THIRD_EXAMINATION_REQUIRED) {
      throw new BadRequestException("Comparison does not require third examination");
    }

    if (comparison.firstSubmission.questionConfigurationId !== comparison.secondSubmission.questionConfigurationId) {
      throw new BadRequestException("Ambiguous question configuration identity");
    }

    return comparison;
  }

  private async validateThirdExaminerEligibility(
    tx: Prisma.TransactionClient,
    authority: SummativeManagementAuthority,
    userId: string,
    evaluatedAt: Date,
    comparison: any,
  ) {
    const firstExaminerUserId = comparison.firstSubmission.examinerAssignment.assignedUserId;
    const secondExaminerUserId = comparison.secondSubmission.examinerAssignment.assignedUserId;

    if (userId === firstExaminerUserId || userId === secondExaminerUserId) {
      throw new BadRequestException("Third Examiner cannot be the First or Second Examiner");
    }

    const users = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT u."id"
      FROM "users" u
      JOIN "user_roles" ur ON ur."user_id" = u."id"
      JOIN "roles" r ON ur."role_id" = r."id"
      WHERE u."id" = ${userId}
        AND u."department_id" = ${authority.departmentId}
        AND u."status" = ${UserStatus.ACTIVE}
        AND u."archived_at" IS NULL
        AND u."deleted_at" IS NULL
        AND ur."department_id" = ${authority.departmentId}
        AND ur."revoked_at" IS NULL
        AND (ur."expires_at" IS NULL OR ur."expires_at" > ${evaluatedAt})
        AND r."department_id" = ${authority.departmentId}
        AND r."code" = ${PLATFORM_ROLES.TEACHER}
        AND r."archived_at" IS NULL
      ORDER BY ur."id", r."id"
      FOR UPDATE OF u, ur FOR SHARE OF r
    `);

    if (users.length === 0) {
      throw new BadRequestException("Third Examiner must be an active Teacher in the department");
    }
  }

  private async getNextAssignmentVersion(
    tx: Prisma.TransactionClient,
    comparison: any,
  ): Promise<number> {
    const existing = await tx.summativeThirdExaminationReferral.findFirst({
      where: {
        departmentId: comparison.departmentId,
        examinationCourseId: comparison.examinationCourseId,
        candidateId: comparison.candidateId,
      },
      orderBy: { assignmentVersion: "desc" },
    });

    if (existing && existing.status === SummativeThirdExaminationReferralStatus.ASSIGNED) {
      throw new ConflictException("Candidate already has an active Third Examiner assignment");
    }

    return existing ? existing.assignmentVersion + 1 : 1;
  }

  private async auditAssignment(
    tx: Prisma.TransactionClient,
    authority: SummativeManagementAuthority,
    referral: any,
  ) {
    const requestContext = this.requestContextService.get();

    await tx.auditLog.create({
      data: {
        departmentId: authority.departmentId,
        actorType: AuditActorType.USER,
        actorUserId: authority.actorUserId,
        action: SUMMATIVE_EXAMINATION_AUDIT_EVENTS.THIRD_REFERRAL_ASSIGNED,
        outcome: AuditOutcome.SUCCESS,
        targetType: "SummativeThirdExaminationReferral",
        targetId: referral.id,
        contextJson: {
          referralId: referral.id,
          comparisonId: referral.comparisonId,
          candidateId: referral.candidateId,
          examinationCourseId: referral.examinationCourseId,
          thirdExaminerUserId: referral.thirdExaminerUserId,
          assignmentVersion: referral.assignmentVersion,
          status: referral.status,
          ruleVersionCode: referral.ruleVersionCode,
          deadline: referral.deadline.toISOString(),
        } as unknown as Prisma.InputJsonObject,
        ipAddress: requestContext?.audit?.ipAddress || "0.0.0.0",
        userAgent: requestContext?.audit?.userAgent || "Unknown",
      },
    });
  }

  private async withRetry<T>(
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
        if (this.isRetryable(error) && attempt < 3) {
          continue;
        }
        if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
          throw new BadRequestException("Candidate already has an active Third Examiner assignment for this version");
        }
        throw error;
      }
    }
  }

  private isRetryable(error: unknown): boolean {
    if (!(error instanceof PrismaClientKnownRequestError)) return false;
    return (
      error.code === "P2034" ||
      error.message.includes("could not serialize access") ||
      error.message.includes("deadlock detected")
    );
  }
}
