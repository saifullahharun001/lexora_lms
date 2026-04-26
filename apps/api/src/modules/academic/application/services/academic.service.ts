import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { EnrollmentStatus, Prisma, UserStatus } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";
import type {
  AcademicRepositoryPort,
  CourseListFilters,
  CourseOfferingListFilters,
  CreateCourseInput,
  CreateCourseOfferingInput,
  CreateEnrollmentInput,
  CreateProgramInput,
  EnrollmentListFilters,
  ProgramListFilters,
  UpdateCourseInput,
  UpdateCourseOfferingInput,
  UpdateEnrollmentInput,
  UpdateProgramInput
} from "../ports/academic.repository.port";
import { ACADEMIC_REPOSITORY } from "../../domain/academic.constants";
import { ACADEMIC_AUDIT_EVENTS } from "../../domain/academic.audit-events";

interface AuditMetadata {
  [key: string]: unknown;
}

@Injectable()
export class AcademicService {
  constructor(
    @Inject(ACADEMIC_REPOSITORY)
    private readonly repository: AcademicRepositoryPort,
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService
  ) {}

  listPrograms(filters: Omit<ProgramListFilters, "departmentId">) {
    return this.repository.findPrograms({
      departmentId: this.getDepartmentId(),
      ...filters
    });
  }

  async getProgram(id: string) {
    const program = await this.repository.findProgramById(this.getDepartmentId(), id);

    if (!program) {
      throw new NotFoundException("Program not found");
    }

    return program;
  }

  async createProgram(input: Omit<CreateProgramInput, "departmentId">) {
    try {
      const program = await this.repository.createProgram({
        departmentId: this.getDepartmentId(),
        ...input
      });

      await this.writeAudit(ACADEMIC_AUDIT_EVENTS.PROGRAM_CREATED, "academic_program", program, {
        code: input.code
      });

      return program;
    } catch (error) {
      this.rethrowKnownError(error, "Program code already exists in this department");
    }
  }

  async updateProgram(id: string, input: UpdateProgramInput) {
    try {
      const program = await this.repository.updateProgram(this.getDepartmentId(), id, input);

      if (!program) {
        throw new NotFoundException("Program not found");
      }

      await this.writeAudit(ACADEMIC_AUDIT_EVENTS.PROGRAM_UPDATED, "academic_program", program, {
        updatedFields: Object.keys(input)
      });

      return program;
    } catch (error) {
      this.rethrowKnownError(error, "Program code already exists in this department");
    }
  }

  listCourses(filters: Omit<CourseListFilters, "departmentId">) {
    return this.repository.findCourses({
      departmentId: this.getDepartmentId(),
      ...filters
    });
  }

  async getCourse(id: string) {
    const course = await this.repository.findCourseById(this.getDepartmentId(), id);

    if (!course) {
      throw new NotFoundException("Course not found");
    }

    return course;
  }

  async createCourse(input: Omit<CreateCourseInput, "departmentId">) {
    await this.assertProgramInDepartment(input.academicProgramId);

    try {
      const course = await this.repository.createCourse({
        departmentId: this.getDepartmentId(),
        ...input
      });

      await this.writeAudit(ACADEMIC_AUDIT_EVENTS.COURSE_CREATED, "course", course, {
        code: input.code
      });

      return course;
    } catch (error) {
      this.rethrowKnownError(error, "Course code already exists in this department");
    }
  }

  async updateCourse(id: string, input: UpdateCourseInput) {
    await this.assertProgramInDepartment(input.academicProgramId);

    try {
      const course = await this.repository.updateCourse(this.getDepartmentId(), id, input);

      if (!course) {
        throw new NotFoundException("Course not found");
      }

      await this.writeAudit(ACADEMIC_AUDIT_EVENTS.COURSE_UPDATED, "course", course, {
        updatedFields: Object.keys(input)
      });

      return course;
    } catch (error) {
      this.rethrowKnownError(error, "Course code already exists in this department");
    }
  }

  listCourseOfferings(filters: Omit<CourseOfferingListFilters, "departmentId">) {
    return this.repository.findCourseOfferings({
      departmentId: this.getDepartmentId(),
      ...filters
    });
  }

  async getCourseOffering(id: string) {
    const offering = await this.repository.findCourseOfferingById(this.getDepartmentId(), id);

    if (!offering) {
      throw new NotFoundException("Course offering not found");
    }

    return offering;
  }

  async createCourseOffering(input: Omit<CreateCourseOfferingInput, "departmentId">) {
    await this.assertCourseInDepartment(input.courseId);
    await this.assertAcademicTermInDepartment(input.academicTermId);

    try {
      const offering = await this.repository.createCourseOffering({
        departmentId: this.getDepartmentId(),
        ...input
      });

      await this.writeAudit(ACADEMIC_AUDIT_EVENTS.OFFERING_CREATED, "course_offering", offering, {
        sectionCode: input.sectionCode
      });

      return offering;
    } catch (error) {
      this.rethrowKnownError(
        error,
        "Course offering section already exists for this course and term"
      );
    }
  }

  async updateCourseOffering(id: string, input: UpdateCourseOfferingInput) {
    try {
      const offering = await this.repository.updateCourseOffering(this.getDepartmentId(), id, input);

      if (!offering) {
        throw new NotFoundException("Course offering not found");
      }

      await this.writeAudit(ACADEMIC_AUDIT_EVENTS.OFFERING_UPDATED, "course_offering", offering, {
        updatedFields: Object.keys(input)
      });

      return offering;
    } catch (error) {
      this.rethrowKnownError(
        error,
        "Course offering section already exists for this course and term"
      );
    }
  }

  listEnrollments(filters: Omit<EnrollmentListFilters, "departmentId">) {
    return this.repository.findEnrollments({
      departmentId: this.getDepartmentId(),
      ...filters
    });
  }

  async getEnrollment(id: string) {
    const enrollment = await this.repository.findEnrollmentById(this.getDepartmentId(), id);

    if (!enrollment) {
      throw new NotFoundException("Enrollment not found");
    }

    return enrollment;
  }

  async createEnrollment(input: Omit<CreateEnrollmentInput, "departmentId">) {
    const departmentId = this.getDepartmentId();
    const actorId = this.getActorId();
    const offering = await this.assertCourseOfferingInDepartment(input.courseOfferingId);
    await this.assertAcademicTermInDepartment(input.academicTermId);
    await this.assertStudentInDepartment(input.studentUserId);

    if (offering.academicTermId !== input.academicTermId) {
      throw new BadRequestException("Enrollment term must match the selected course offering");
    }

    try {
      const enrollment = await this.repository.createEnrollment({
        departmentId,
        approvedByUserId: input.status === EnrollmentStatus.APPROVED ? actorId : undefined,
        ...input
      });

      await this.writeAudit(ACADEMIC_AUDIT_EVENTS.ENROLLMENT_CREATED, "enrollment", enrollment, {
        studentUserId: input.studentUserId
      });

      return this.getEnrollment((enrollment as { id: string }).id);
    } catch (error) {
      this.rethrowKnownError(error, "Student is already enrolled in this course offering");
    }
  }

  async updateEnrollment(id: string, input: UpdateEnrollmentInput) {
    const actorId = this.getActorId();
    const existing = await this.assertEnrollmentExists(id);
    const data: UpdateEnrollmentInput = {
      approvedByUserId: undefined,
      sourceType: input.sourceType,
      status: input.status,
      eligibilityStatus: input.eligibilityStatus,
      eligibilitySnapshotJson: input.eligibilitySnapshotJson,
      enrolledAt: input.enrolledAt,
      droppedAt: input.droppedAt
    };

    if (input.status === EnrollmentStatus.APPROVED) {
      data.enrolledAt = input.enrolledAt ?? existing.enrolledAt ?? new Date();
      data.approvedByUserId = actorId;
    }

    if (
      input.status === EnrollmentStatus.DROPPED ||
      input.status === EnrollmentStatus.WITHDRAWN
    ) {
      data.droppedAt = input.droppedAt ?? existing.droppedAt ?? new Date();
    }

    const enrollment = await this.repository.updateEnrollment(this.getDepartmentId(), id, data);

    if (!enrollment) {
      throw new NotFoundException("Enrollment not found");
    }

    await this.writeAudit(ACADEMIC_AUDIT_EVENTS.ENROLLMENT_UPDATED, "enrollment", enrollment, {
      updatedFields: Object.keys(input)
    });

    return enrollment;
  }

  private async assertEnrollmentExists(id: string) {
    const enrollment = await this.repository.findEnrollmentById(this.getDepartmentId(), id);

    if (!enrollment) {
      throw new NotFoundException("Enrollment not found");
    }

    return enrollment as {
      id: string;
      enrolledAt: Date | null;
      droppedAt: Date | null;
    };
  }

  private async assertProgramInDepartment(academicProgramId?: string | null) {
    if (!academicProgramId) {
      return;
    }

    const program = await this.repository.findProgramById(this.getDepartmentId(), academicProgramId);

    if (!program) {
      throw new BadRequestException("Academic program does not belong to the active department");
    }
  }

  private async assertCourseInDepartment(courseId: string) {
    const course = await this.repository.findCourseById(this.getDepartmentId(), courseId);

    if (!course) {
      throw new BadRequestException("Course does not belong to the active department");
    }

    return course;
  }

  private async assertCourseOfferingInDepartment(courseOfferingId: string) {
    const offering = await this.repository.findCourseOfferingById(
      this.getDepartmentId(),
      courseOfferingId
    );

    if (!offering) {
      throw new BadRequestException("Course offering does not belong to the active department");
    }

    return offering as {
      id: string;
      academicTermId: string;
    };
  }

  private async assertAcademicTermInDepartment(academicTermId: string) {
    const term = await this.prisma.academicTerm.findFirst({
      where: {
        id: academicTermId,
        departmentId: this.getDepartmentId(),
        archivedAt: null
      },
      select: {
        id: true
      }
    });

    if (!term) {
      throw new BadRequestException("Academic term does not belong to the active department");
    }
  }

  private async assertStudentInDepartment(studentUserId: string) {
    const student = await this.prisma.user.findFirst({
      where: {
        id: studentUserId,
        departmentId: this.getDepartmentId(),
        deletedAt: null,
        archivedAt: null,
        status: {
          in: [UserStatus.ACTIVE, UserStatus.INVITED]
        }
      },
      select: {
        id: true
      }
    });

    if (!student) {
      throw new BadRequestException("Student user does not belong to the active department");
    }
  }

  private getDepartmentId() {
    const principal = this.requestContextService.get()?.principal;

    if (!principal?.activeDepartmentId) {
      throw new BadRequestException("Active department context is required");
    }

    return principal.activeDepartmentId;
  }

  private getActorId() {
    const principal = this.requestContextService.get()?.principal;

    if (!principal?.actorId) {
      throw new BadRequestException("Authenticated actor is required");
    }

    return principal.actorId;
  }

  private async writeAudit(
    action: string,
    targetType: string,
    target: unknown,
    metadata?: AuditMetadata
  ) {
    const requestContext = this.requestContextService.get();
    const targetId = (target as { id?: string }).id ?? null;

    await this.prisma.auditLog.create({
      data: {
        requestId: requestContext?.requestId,
        actorUserId: this.getActorId(),
        actorType: "USER",
        departmentId: this.getDepartmentId(),
        action,
        targetType,
        targetId,
        outcome: "SUCCESS",
        ipAddress: requestContext?.audit.ipAddress,
        userAgent: requestContext?.audit.userAgent,
        contextJson: metadata as Prisma.InputJsonValue | undefined
      }
    });
  }

  private rethrowKnownError(error: unknown, message: string): never {
    if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictException(message);
    }

    throw error;
  }
}
