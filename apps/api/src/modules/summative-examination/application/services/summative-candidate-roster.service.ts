import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  EnrollmentStatus,
  Prisma,
  UserStatus,
} from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";
import { PLATFORM_ROLES } from "@/modules/identity-access/authorization/roles.constants";

import { SUMMATIVE_EXAMINATION_AUDIT_EVENTS } from "../../domain/summative-examination.audit-events";
import {
  SummativeManagementAuthorizerService,
  type SummativeManagementAuthority,
} from "./summative-management-authorizer.service";

const MANAGEMENT_RESOURCE = "summative-examination.setup" as const;

interface CandidateCourseScope {
  examinationId: string;
  examinationCourseId: string;
  courseOfferingId: string;
  academicTermId: string;
  academicProgramId: string;
  curriculumVersionId: string;
  curriculumCourseId: string;
}

@Injectable()
export class SummativeCandidateRosterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
    private readonly authorizer: SummativeManagementAuthorizerService,
  ) {}

  async registerCandidate(
    examinationCourseId: string,
    enrollmentId: string,
  ) {
    const authority = await this.authorizer.authorize(MANAGEMENT_RESOURCE);
    const transitionAt = new Date();

    return this.serializable(async (tx) => {
      await this.authorizer.assertCurrentAuthority(
        tx,
        authority,
        MANAGEMENT_RESOURCE,
        transitionAt,
      );
      const scope = await this.lockCurrentExaminationCourse(
        tx,
        authority.departmentId,
        examinationCourseId,
      );

      const enrollmentRows = await tx.$queryRaw<
        Array<{
          id: string;
          studentUserId: string;
          studentCurriculumAssignmentId: string;
        }>
      >(
        Prisma.sql`
          SELECT
            e."id",
            e."student_user_id" AS "studentUserId",
            e."student_curriculum_assignment_id" AS "studentCurriculumAssignmentId"
          FROM "enrollments" e
          JOIN "student_curriculum_assignments" sca
            ON sca."id" = e."student_curriculum_assignment_id"
           AND sca."department_id" = e."department_id"
           AND sca."student_user_id" = e."student_user_id"
          WHERE e."id" = ${enrollmentId}
            AND e."department_id" = ${authority.departmentId}
            AND e."academic_term_id" = ${scope.academicTermId}
            AND e."course_offering_id" = ${scope.courseOfferingId}
            AND e."curriculum_course_id" = ${scope.curriculumCourseId}
            AND e."status" = ${EnrollmentStatus.APPROVED}::"EnrollmentStatus"
            AND e."enrolled_at" IS NOT NULL
            AND e."dropped_at" IS NULL
            AND e."archived_at" IS NULL
            AND sca."academic_program_id" = ${scope.academicProgramId}
            AND sca."curriculum_version_id" = ${scope.curriculumVersionId}
          FOR UPDATE OF e, sca
        `,
      );
      if (enrollmentRows.length !== 1) {
        throw new NotFoundException("Examination candidate enrollment not found");
      }
      const lockedEnrollment = enrollmentRows[0]!;

      const enrollment = await tx.enrollment.findFirst({
        where: {
          id: enrollmentId,
          departmentId: authority.departmentId,
          academicTermId: scope.academicTermId,
          courseOfferingId: scope.courseOfferingId,
          studentUserId: lockedEnrollment.studentUserId,
          studentCurriculumAssignmentId:
            lockedEnrollment.studentCurriculumAssignmentId,
          curriculumCourseId: scope.curriculumCourseId,
          status: EnrollmentStatus.APPROVED,
          enrolledAt: { not: null },
          droppedAt: null,
          archivedAt: null,
          studentCurriculumAssignment: {
            is: {
              departmentId: authority.departmentId,
              studentUserId: lockedEnrollment.studentUserId,
              academicProgramId: scope.academicProgramId,
              curriculumVersionId: scope.curriculumVersionId,
            },
          },
          studentUser: {
            is: {
              departmentId: authority.departmentId,
              status: UserStatus.ACTIVE,
              archivedAt: null,
              deletedAt: null,
              userRoles: {
                some: {
                  departmentId: authority.departmentId,
                  revokedAt: null,
                  OR: [
                    { expiresAt: null },
                    { expiresAt: { gt: transitionAt } },
                  ],
                  role: {
                    code: PLATFORM_ROLES.STUDENT,
                    departmentId: authority.departmentId,
                    archivedAt: null,
                  },
                },
              },
            },
          },
        },
        select: {
          id: true,
          studentUserId: true,
          studentCurriculumAssignmentId: true,
        },
      });
      if (!enrollment || !enrollment.studentCurriculumAssignmentId) {
        throw new NotFoundException("Examination candidate enrollment not found");
      }

      const existing = await tx.summativeExaminationCandidate.findFirst({
        where: {
          departmentId: authority.departmentId,
          examinationCourseId: scope.examinationCourseId,
          enrollmentId: enrollment.id,
        },
      });
      if (existing) return existing;

      const candidate = await tx.summativeExaminationCandidate.create({
        data: {
          departmentId: authority.departmentId,
          examinationId: scope.examinationId,
          examinationCourseId: scope.examinationCourseId,
          courseOfferingId: scope.courseOfferingId,
          enrollmentId: enrollment.id,
          studentUserId: enrollment.studentUserId,
          registeredByUserId: authority.actorUserId,
          registeredAt: transitionAt,
        },
      });
      await this.writeAudit(tx, authority, candidate.id, {
        examinationId: scope.examinationId,
        examinationCourseId: scope.examinationCourseId,
        candidateId: candidate.id,
        enrollmentId: enrollment.id,
        statusTransition: "UNREGISTERED_TO_REGISTERED",
      });
      return candidate;
    });
  }

  private async lockCurrentExaminationCourse(
    tx: Prisma.TransactionClient,
    departmentId: string,
    examinationCourseId: string,
  ): Promise<CandidateCourseScope> {
    const base = await tx.examinationCourse.findFirst({
      where: { id: examinationCourseId, departmentId },
      select: {
        id: true,
        examinationId: true,
        courseOfferingId: true,
        academicTermId: true,
        academicProgramId: true,
        curriculumVersionId: true,
        curriculumCourseId: true,
      },
    });
    if (!base) throw new NotFoundException("Examination course not found");

    const examinations = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "examinations"
      WHERE "id" = ${base.examinationId}
        AND "department_id" = ${departmentId}
        AND "archived_at" IS NULL
      FOR UPDATE
    `);
    if (examinations.length !== 1) {
      throw new NotFoundException("Examination course not found");
    }
    const courses = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "examination_courses"
      WHERE "id" = ${base.id}
        AND "department_id" = ${departmentId}
        AND "examination_id" = ${base.examinationId}
        AND "course_offering_id" = ${base.courseOfferingId}
        AND "archived_at" IS NULL
      FOR UPDATE
    `);
    if (courses.length !== 1) {
      throw new NotFoundException("Examination course not found");
    }
    if (!base.curriculumVersionId || !base.curriculumCourseId) {
      throw new BadRequestException(
        "Examination course lacks authoritative curriculum identity",
      );
    }
    return {
      examinationId: base.examinationId,
      examinationCourseId: base.id,
      courseOfferingId: base.courseOfferingId,
      academicTermId: base.academicTermId,
      academicProgramId: base.academicProgramId,
      curriculumVersionId: base.curriculumVersionId,
      curriculumCourseId: base.curriculumCourseId,
    };
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    authority: SummativeManagementAuthority,
    candidateId: string,
    contextJson: Prisma.InputJsonObject,
  ) {
    const requestContext = this.requestContextService.get();
    await tx.auditLog.create({
      data: {
        requestId: requestContext?.requestId,
        actorUserId: authority.actorUserId,
        actorType: "USER",
        departmentId: authority.departmentId,
        action: SUMMATIVE_EXAMINATION_AUDIT_EVENTS.CANDIDATE_REGISTERED,
        targetType: "summative_examination_candidate",
        targetId: candidateId,
        outcome: "SUCCESS",
        ipAddress: requestContext?.audit.ipAddress,
        userAgent: requestContext?.audit.userAgent,
        contextJson,
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
