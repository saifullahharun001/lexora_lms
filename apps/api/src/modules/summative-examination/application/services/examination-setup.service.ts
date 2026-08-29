import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { CourseOfferingStatus, Prisma } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";

import { SUMMATIVE_EXAMINATION_AUDIT_EVENTS } from "../../domain/summative-examination.audit-events";
import { CreateExaminationCourseDto } from "../../presentation/http/dto/create-examination-course.dto";
import { CreateExaminationDto } from "../../presentation/http/dto/create-examination.dto";
import {
  SummativeManagementAuthorizerService,
  type SummativeManagementAuthority,
} from "./summative-management-authorizer.service";

@Injectable()
export class ExaminationSetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
    private readonly authorizer: SummativeManagementAuthorizerService,
  ) {}

  async createExamination(input: CreateExaminationDto) {
    const authority = await this.authorizer.authorize(
      "summative-examination.setup",
    );
    const transitionAt = new Date();
    try {
      return await this.serializable(async (tx) => {
        await this.authorizer.assertCurrentAuthority(
          tx,
          authority,
          "summative-examination.setup",
          transitionAt,
        );
        await this.lockExaminationParents(tx, authority.departmentId, input);
        const examination = await tx.examination.create({
          data: {
            departmentId: authority.departmentId,
            academicProgramId: input.academicProgramId,
            academicSessionId: input.academicSessionId,
            academicTermId: input.academicTermId,
            code: input.code.trim(),
            name: input.name.trim(),
            categoryCode: input.categoryCode.trim(),
            ruleVersionCode: input.ruleVersionCode.trim(),
          },
        });
        await this.writeAudit(
          tx,
          authority,
          SUMMATIVE_EXAMINATION_AUDIT_EVENTS.EXAMINATION_CREATED,
          "examination",
          examination.id,
          {
            academicProgramId: examination.academicProgramId,
            academicSessionId: examination.academicSessionId,
            academicTermId: examination.academicTermId,
            code: examination.code,
            ruleVersionCode: examination.ruleVersionCode,
          },
        );
        return examination;
      });
    } catch (error) {
      if (this.isUniqueConflict(error, "examination_department_code_uq")) {
        throw new ConflictException(
          "Examination code already exists in this department",
        );
      }
      throw error;
    }
  }

  async listExaminations() {
    const authority = await this.authorizer.authorize(
      "summative-examination.setup",
    );
    return this.prisma.examination.findMany({
      where: { departmentId: authority.departmentId, archivedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  async getExamination(examinationId: string) {
    const authority = await this.authorizer.authorize(
      "summative-examination.setup",
    );
    const examination = await this.prisma.examination.findFirst({
      where: {
        id: examinationId,
        departmentId: authority.departmentId,
        archivedAt: null,
      },
    });
    if (!examination) throw new NotFoundException("Examination not found");
    return examination;
  }

  async createExaminationCourse(input: CreateExaminationCourseDto) {
    const authority = await this.authorizer.authorize(
      "summative-examination.setup",
    );
    const transitionAt = new Date();
    const markingDeadline = this.parseOptionalDate(input.markingDeadline);
    try {
      return await this.serializable(async (tx) => {
        await this.authorizer.assertCurrentAuthority(
          tx,
          authority,
          "summative-examination.setup",
          transitionAt,
        );

        const offeringRows = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            SELECT "id"
            FROM "course_offerings"
            WHERE "id" = ${input.courseOfferingId}
              AND "department_id" = ${authority.departmentId}
              AND "archived_at" IS NULL
              AND "status" <> ${CourseOfferingStatus.ARCHIVED}::"CourseOfferingStatus"
            FOR UPDATE
          `,
        );
        if (offeringRows.length !== 1) {
          throw new NotFoundException("Course offering not found");
        }

        const offering = await tx.courseOffering.findFirst({
          where: {
            id: input.courseOfferingId,
            departmentId: authority.departmentId,
            archivedAt: null,
            status: { not: CourseOfferingStatus.ARCHIVED },
          },
          include: {
            curriculumCourse: {
              include: {
                curriculumVersion: true,
                assessmentTemplate: true,
              },
            },
            syllabusVersion: true,
            studentBatch: true,
          },
        });
        if (
          !offering?.curriculumCourse ||
          !offering.curriculumCourseId ||
          !offering.syllabusVersion ||
          !offering.syllabusVersionId
        ) {
          throw new BadRequestException(
            "Course offering lacks required curriculum or syllabus configuration",
          );
        }
        const curriculumCourse = offering.curriculumCourse;
        if (
          curriculumCourse.curriculumVersion.archivedAt ||
          curriculumCourse.assessmentTemplate.archivedAt ||
          offering.syllabusVersion.archivedAt
        ) {
          throw new BadRequestException(
            "Course offering academic configuration is archived",
          );
        }

        const examinationRows = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            SELECT "id"
            FROM "examinations"
            WHERE "id" = ${input.examinationId}
              AND "department_id" = ${authority.departmentId}
              AND "archived_at" IS NULL
            FOR UPDATE
          `,
        );
        if (examinationRows.length !== 1) {
          throw new NotFoundException("Examination not found");
        }
        const examination = await tx.examination.findFirst({
          where: {
            id: input.examinationId,
            departmentId: authority.departmentId,
            archivedAt: null,
          },
        });
        if (!examination) throw new NotFoundException("Examination not found");

        if (
          examination.academicProgramId !==
          curriculumCourse.curriculumVersion.academicProgramId
        ) {
          throw new BadRequestException(
            "Course offering programme does not match Examination programme",
          );
        }
        if (examination.academicTermId !== offering.academicTermId) {
          throw new BadRequestException(
            "Course offering term does not match Examination term",
          );
        }
        if (
          offering.studentBatch &&
          (offering.studentBatch.archivedAt ||
            offering.studentBatch.departmentId !== authority.departmentId ||
            offering.studentBatch.academicProgramId !==
              examination.academicProgramId ||
            offering.studentBatch.academicSessionId !==
              examination.academicSessionId)
        ) {
          throw new BadRequestException(
            "Course offering StudentBatch does not match Examination programme and session",
          );
        }
        if (Boolean(offering.studentBatchId) !== Boolean(offering.studentBatch)) {
          throw new BadRequestException(
            "Course offering StudentBatch identity is inconsistent",
          );
        }

        const summativeComponent =
          await tx.assessmentTemplateComponent.findFirst({
            where: {
              assessmentTemplateId: curriculumCourse.assessmentTemplateId,
              departmentId: authority.departmentId,
              code: "SUMMATIVE_EXAMINATION",
            },
          });
        if (!summativeComponent || summativeComponent.maximumMarks.lte(0)) {
          throw new BadRequestException(
            "Assessment template lacks a positive SUMMATIVE_EXAMINATION component",
          );
        }

        const examinationCourse = await tx.examinationCourse.create({
          data: {
            departmentId: authority.departmentId,
            examinationId: examination.id,
            academicProgramId: examination.academicProgramId,
            academicSessionId: examination.academicSessionId,
            academicTermId: examination.academicTermId,
            courseOfferingId: offering.id,
            studentBatchId: offering.studentBatchId,
            curriculumVersionId: curriculumCourse.curriculumVersionId,
            curriculumCourseId: curriculumCourse.id,
            syllabusVersionId: offering.syllabusVersion.id,
            assessmentTemplateId: curriculumCourse.assessmentTemplateId,
            summativeAssessmentComponentId: summativeComponent.id,
            summativeComponentCode: "SUMMATIVE_EXAMINATION",
            summativeFullMark: summativeComponent.maximumMarks,
            markingDeadline,
            ruleVersionCode: input.ruleVersionCode.trim(),
          },
        });
        await this.writeAudit(
          tx,
          authority,
          SUMMATIVE_EXAMINATION_AUDIT_EVENTS.EXAMINATION_COURSE_CREATED,
          "examination_course",
          examinationCourse.id,
          {
            examinationId: examination.id,
            courseOfferingId: offering.id,
            studentBatchId: offering.studentBatchId,
            curriculumCourseId: curriculumCourse.id,
            syllabusVersionId: offering.syllabusVersion.id,
            assessmentTemplateId: curriculumCourse.assessmentTemplateId,
            summativeAssessmentComponentId: summativeComponent.id,
            summativeFullMark: summativeComponent.maximumMarks.toString(),
            ruleVersionCode: examinationCourse.ruleVersionCode,
          },
        );
        return examinationCourse;
      });
    } catch (error) {
      if (this.isUniqueConflict(error, "examination_course_offering_uq")) {
        throw new ConflictException("Examination course already exists");
      }
      throw error;
    }
  }

  async getExaminationCourse(examinationCourseId: string) {
    const authority = await this.authorizer.authorize(
      "summative-examination.setup",
    );
    const examinationCourse = await this.prisma.examinationCourse.findFirst({
      where: {
        id: examinationCourseId,
        departmentId: authority.departmentId,
        archivedAt: null,
        examination: { archivedAt: null },
      },
    });
    if (!examinationCourse) {
      throw new NotFoundException("Examination course not found");
    }
    return examinationCourse;
  }

  async listExaminationCourses(examinationId: string) {
    const authority = await this.authorizer.authorize(
      "summative-examination.setup",
    );
    const examination = await this.prisma.examination.findFirst({
      where: {
        id: examinationId,
        departmentId: authority.departmentId,
        archivedAt: null,
      },
      select: { id: true },
    });
    if (!examination) throw new NotFoundException("Examination not found");
    return this.prisma.examinationCourse.findMany({
      where: {
        examinationId,
        departmentId: authority.departmentId,
        archivedAt: null,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  private async lockExaminationParents(
    tx: Prisma.TransactionClient,
    departmentId: string,
    input: Pick<
      CreateExaminationDto,
      "academicProgramId" | "academicSessionId" | "academicTermId"
    >,
  ) {
    const programmes = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "academic_programs"
      WHERE "id" = ${input.academicProgramId}
        AND "department_id" = ${departmentId}
        AND "archived_at" IS NULL
      FOR KEY SHARE
    `);
    if (programmes.length !== 1) {
      throw new NotFoundException("Academic programme not found");
    }
    const sessions = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "academic_sessions"
      WHERE "id" = ${input.academicSessionId}
        AND "department_id" = ${departmentId}
        AND "archived_at" IS NULL
      FOR KEY SHARE
    `);
    if (sessions.length !== 1) {
      throw new NotFoundException("Academic session not found");
    }
    const terms = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "academic_terms"
      WHERE "id" = ${input.academicTermId}
        AND "department_id" = ${departmentId}
        AND "archived_at" IS NULL
      FOR KEY SHARE
    `);
    if (terms.length !== 1) {
      throw new NotFoundException("Academic term not found");
    }
  }

  private parseOptionalDate(value: string | undefined) {
    if (value === undefined) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException("Marking deadline must be an ISO date");
    }
    return parsed;
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    authority: SummativeManagementAuthority,
    action: string,
    targetType: string,
    targetId: string,
    contextJson: Prisma.InputJsonObject,
  ) {
    const requestContext = this.requestContextService.get();
    await tx.auditLog.create({
      data: {
        requestId: requestContext?.requestId,
        actorUserId: authority.actorUserId,
        actorType: "USER",
        departmentId: authority.departmentId,
        action,
        targetType,
        targetId,
        outcome: "SUCCESS",
        ipAddress: requestContext?.audit.ipAddress,
        userAgent: requestContext?.audit.userAgent,
        contextJson,
      },
    });
  }

  private isUniqueConflict(error: unknown, constraint: string) {
    if (
      !(error instanceof PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      return false;
    }
    return error.meta?.target === constraint;
  }

  private isRetryableSerializableConflict(error: unknown) {
    if (!(error instanceof PrismaClientKnownRequestError)) return false;
    return (
      error.code === "P2034" ||
      (error.code === "P2010" && error.meta?.code === "40001")
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
        if (attempt >= 2 || !this.isRetryableSerializableConflict(error)) {
          throw error;
        }
      }
    }
  }
}
