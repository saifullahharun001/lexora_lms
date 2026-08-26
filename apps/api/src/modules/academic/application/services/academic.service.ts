import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AcademicTerm,
  AcademicYear,
  DepartmentStatus,
  EnrollmentStatus,
  PermissionScope,
  Prisma,
  TeacherAssignmentStatus,
  UserStatus,
} from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { isPermissionGrantFromLoadedRole } from "@/common/authorization/principal-authority";
import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";
import { PERMISSIONS } from "@/modules/identity-access/authorization/permissions.constants";

import { ACADEMIC_AUDIT_EVENTS } from "../../domain/academic.audit-events";
import { ACADEMIC_REPOSITORY } from "../../domain/academic.constants";
import type {
  AcademicRepositoryPort,
  AcademicSessionListFilters,
  AcademicTermListFilters,
  AcademicYearListFilters,
  CourseListFilters,
  CourseOfferingLearningOutcomesView,
  CourseOfferingListFilters,
  CreateAcademicSessionInput,
  CreateAcademicTermInput,
  CreateAcademicYearInput,
  CreateCourseInput,
  CreateCourseOfferingInput,
  CreateCourseOutlineVersionInput,
  CreateEnrollmentInput,
  CreateProgramInput,
  CreateStudentBatchInput,
  CreateSyllabusVersionInput,
  CreateTeacherAssignmentInput,
  CurriculumVersionLifecycleAction,
  EnrollmentListFilters,
  ProgramListFilters,
  StudentBatchListFilters,
  StudentCourseOfferingListFilters,
  StartCourseOutlineCoordinatorReviewInput,
  SubmitCourseOutlineVersionInput,
  SyllabusVersionLifecycleAction,
  SyllabusVersionListFilters,
  UpdateAcademicSessionInput,
  UpdateAcademicTermInput,
  UpdateAcademicYearInput,
  UpdateCourseInput,
  UpdateCourseOfferingInput,
  UpdateCourseOutlineVersionInput,
  UpdateEnrollmentInput,
  UpdateProgramInput,
  UpdateStudentBatchInput,
} from "../ports/academic.repository.port";
import type { CourseOutlineDraftFields } from "../../domain/course-outline-draft-fields";
import {
  hasCourseOutlineDraftFields,
  selectCourseOutlineDraftFields,
} from "../../domain/course-outline-draft-fields";

interface AuditMetadata {
  [key: string]: unknown;
}

interface CurriculumVersionTransitionMetadata {
  reason: string;
  approvalReference?: string;
}

interface SyllabusVersionTransitionMetadata {
  reason: string;
}

const CURRICULUM_VERSION_LIFECYCLE_PERMISSION = {
  resource: "course-management.curriculum-version.lifecycle",
  action: "manage",
} as const;

const SYLLABUS_VERSION_MANAGE_PERMISSION = {
  resource: "course-management.syllabus-version",
  action: "manage",
} as const;

const SYLLABUS_VERSION_LIFECYCLE_PERMISSION = {
  resource: "course-management.syllabus-version.lifecycle",
  action: "manage",
} as const;

const SYLLABUS_BINDING_PERMISSION = {
  code: PERMISSIONS.COURSE_MANAGEMENT.SYLLABUS_BINDING_MANAGE,
  resource: "course-management.syllabus-binding",
  action: "manage",
} as const;

const STUDENT_BATCH_BINDING_PERMISSION = {
  code: PERMISSIONS.COURSE_MANAGEMENT.STUDENT_BATCH_BINDING_MANAGE,
  resource: "course-management.student-batch-binding",
  action: "manage",
} as const;

@Injectable()
export class AcademicService {
  constructor(
    @Inject(ACADEMIC_REPOSITORY)
    private readonly repository: AcademicRepositoryPort,
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
  ) {}

  listPrograms(filters: Omit<ProgramListFilters, "departmentId">) {
    return this.repository.findPrograms({
      departmentId: this.getDepartmentId(),
      ...filters,
    });
  }

  async getProgram(id: string) {
    const program = await this.repository.findProgramById(
      this.getDepartmentId(),
      id,
    );

    if (!program) {
      throw new NotFoundException("Program not found");
    }

    return program;
  }

  async createProgram(input: Omit<CreateProgramInput, "departmentId">) {
    try {
      const program = await this.repository.createProgram({
        departmentId: this.getDepartmentId(),
        ...input,
      });

      await this.writeAudit(
        ACADEMIC_AUDIT_EVENTS.PROGRAM_CREATED,
        "academic_program",
        program,
        {
          code: input.code,
        },
      );

      return program;
    } catch (error) {
      this.rethrowKnownError(
        error,
        "Program code already exists in this department",
      );
    }
  }

  async updateProgram(id: string, input: UpdateProgramInput) {
    try {
      const program = await this.repository.updateProgram(
        this.getDepartmentId(),
        id,
        input,
      );

      if (!program) {
        throw new NotFoundException("Program not found");
      }

      await this.writeAudit(
        ACADEMIC_AUDIT_EVENTS.PROGRAM_UPDATED,
        "academic_program",
        program,
        {
          updatedFields: Object.keys(input),
        },
      );

      return program;
    } catch (error) {
      this.rethrowKnownError(
        error,
        "Program code already exists in this department",
      );
    }
  }

  listAcademicYears(filters: Omit<AcademicYearListFilters, "departmentId">) {
    return this.repository.findAcademicYears({
      departmentId: this.getDepartmentId(),
      ...filters,
    });
  }

  async getAcademicYear(id: string) {
    const academicYear = await this.repository.findAcademicYearById(
      this.getDepartmentId(),
      id,
    );

    if (!academicYear) {
      throw new NotFoundException("Academic year not found");
    }

    return academicYear;
  }

  async createAcademicYear(
    input: Omit<CreateAcademicYearInput, "departmentId">,
  ) {
    this.assertDateRange(
      input.startDate,
      input.endDate,
      "Academic year endDate must be after startDate",
    );

    try {
      const academicYear = await this.repository.createAcademicYear({
        departmentId: this.getDepartmentId(),
        ...input,
      });

      await this.writeAudit(
        ACADEMIC_AUDIT_EVENTS.ACADEMIC_YEAR_CREATED,
        "academic_year",
        academicYear,
        {
          code: input.code,
        },
      );

      return academicYear;
    } catch (error) {
      this.rethrowKnownError(
        error,
        "Academic year code already exists in this department",
      );
    }
  }

  async updateAcademicYear(id: string, input: UpdateAcademicYearInput) {
    this.assertUpdateHasAtLeastOneDefinedField(
      input as Record<string, unknown>,
      "At least one academic year field must be provided",
    );

    const existing = (await this.repository.findAcademicYearById(
      this.getDepartmentId(),
      id,
    )) as AcademicYear | null;

    if (!existing) {
      throw new NotFoundException("Academic year not found");
    }

    this.assertDateRange(
      input.startDate ?? existing.startDate,
      input.endDate ?? existing.endDate,
      "Academic year endDate must be after startDate",
    );

    try {
      const academicYear = await this.repository.updateAcademicYear(
        this.getDepartmentId(),
        id,
        input,
      );

      if (!academicYear) {
        throw new NotFoundException("Academic year not found");
      }

      await this.writeAudit(
        ACADEMIC_AUDIT_EVENTS.ACADEMIC_YEAR_UPDATED,
        "academic_year",
        academicYear,
        {
          updatedFields: Object.keys(input),
        },
      );

      return academicYear;
    } catch (error) {
      this.rethrowKnownError(
        error,
        "Academic year code already exists in this department",
      );
    }
  }

  listAcademicTerms(filters: Omit<AcademicTermListFilters, "departmentId">) {
    return this.repository.findAcademicTerms({
      departmentId: this.getDepartmentId(),
      ...filters,
    });
  }

  async getAcademicTerm(id: string) {
    const academicTerm = await this.repository.findAcademicTermById(
      this.getDepartmentId(),
      id,
    );

    if (!academicTerm) {
      throw new NotFoundException("Academic term not found");
    }

    return academicTerm;
  }

  async createAcademicTerm(
    input: Omit<CreateAcademicTermInput, "departmentId">,
  ) {
    const academicYear = await this.assertAcademicYearInDepartment(
      input.academicYearId,
    );
    this.validateAcademicTermDates(input, academicYear);

    try {
      const academicTerm = await this.repository.createAcademicTerm({
        departmentId: this.getDepartmentId(),
        ...input,
      });

      await this.writeAudit(
        ACADEMIC_AUDIT_EVENTS.ACADEMIC_TERM_CREATED,
        "academic_term",
        academicTerm,
        {
          code: input.code,
          academicYearId: input.academicYearId,
        },
      );

      return academicTerm;
    } catch (error) {
      this.rethrowKnownError(
        error,
        "Academic term code already exists in this department",
      );
    }
  }

  async updateAcademicTerm(id: string, input: UpdateAcademicTermInput) {
    this.assertUpdateHasAtLeastOneDefinedField(
      input as Record<string, unknown>,
      "At least one academic term field must be provided",
    );

    const existing = (await this.repository.findAcademicTermById(
      this.getDepartmentId(),
      id,
    )) as AcademicTerm | null;

    if (!existing) {
      throw new NotFoundException("Academic term not found");
    }

    const academicYear = await this.assertAcademicYearInDepartment(
      input.academicYearId ?? existing.academicYearId,
    );

    this.validateAcademicTermDates(
      {
        startDate: input.startDate ?? existing.startDate,
        endDate: input.endDate ?? existing.endDate,
        enrollmentStartAt:
          input.enrollmentStartAt === undefined
            ? existing.enrollmentStartAt
            : input.enrollmentStartAt,
        enrollmentEndAt:
          input.enrollmentEndAt === undefined
            ? existing.enrollmentEndAt
            : input.enrollmentEndAt,
      },
      academicYear,
    );

    try {
      const academicTerm = await this.repository.updateAcademicTerm(
        this.getDepartmentId(),
        id,
        input,
      );

      if (!academicTerm) {
        throw new NotFoundException("Academic term not found");
      }

      await this.writeAudit(
        ACADEMIC_AUDIT_EVENTS.ACADEMIC_TERM_UPDATED,
        "academic_term",
        academicTerm,
        {
          updatedFields: Object.keys(input),
        },
      );

      return academicTerm;
    } catch (error) {
      this.rethrowKnownError(
        error,
        "Academic term code already exists in this department",
      );
    }
  }

  listAcademicSessions(
    filters: Omit<AcademicSessionListFilters, "departmentId">,
  ) {
    return this.repository.findAcademicSessions({
      departmentId: this.getDepartmentId(),
      ...filters,
    });
  }

  async getAcademicSession(id: string) {
    const academicSession = await this.repository.findAcademicSessionById(
      this.getDepartmentId(),
      id,
    );

    if (!academicSession) {
      throw new NotFoundException("Academic session not found");
    }

    return academicSession;
  }

  async createAcademicSession(
    input: Omit<CreateAcademicSessionInput, "departmentId">,
  ) {
    const departmentId = this.getDepartmentId();

    try {
      const academicSession = await this.repository.createAcademicSession({
        ...this.getAcademicManagementWriteContext(departmentId),
        ...input,
      });

      return academicSession;
    } catch (error) {
      this.rethrowKnownError(
        error,
        "Academic session code already exists in this department",
      );
    }
  }

  async updateAcademicSession(id: string, input: UpdateAcademicSessionInput) {
    this.assertUpdateHasAtLeastOneDefinedField(
      input as Record<string, unknown>,
      "At least one academic session field must be provided",
    );

    const departmentId = this.getDepartmentId();

    try {
      const academicSession = await this.repository.updateAcademicSession({
        ...this.getAcademicManagementWriteContext(departmentId),
        academicSessionId: id,
        changes: input,
      });

      if (!academicSession) {
        throw new NotFoundException("Academic session not found");
      }

      return academicSession;
    } catch (error) {
      this.rethrowKnownError(
        error,
        "Academic session code already exists in this department",
      );
    }
  }

  listStudentBatches(filters: Omit<StudentBatchListFilters, "departmentId">) {
    return this.repository.findStudentBatches({
      departmentId: this.getDepartmentId(),
      ...filters,
    });
  }

  async getStudentBatch(id: string) {
    const studentBatch = await this.repository.findStudentBatchById(
      this.getDepartmentId(),
      id,
    );

    if (!studentBatch) {
      throw new NotFoundException("Student batch not found");
    }

    return studentBatch;
  }

  async createStudentBatch(
    input: Omit<CreateStudentBatchInput, "departmentId">,
  ) {
    const departmentId = this.getDepartmentId();
    await this.assertProgramInDepartment(input.academicProgramId);
    await this.assertAcademicSessionInDepartment(input.academicSessionId);

    try {
      const studentBatch = await this.repository.createStudentBatch({
        ...this.getAcademicManagementWriteContext(departmentId),
        ...input,
      });

      if (!studentBatch) {
        throw new NotFoundException("Student batch dependency not found");
      }

      return studentBatch;
    } catch (error) {
      this.rethrowKnownError(
        error,
        "Student batch code already exists for this program and academic session",
      );
    }
  }

  async updateStudentBatch(id: string, input: UpdateStudentBatchInput) {
    this.assertUpdateHasAtLeastOneDefinedField(
      input as Record<string, unknown>,
      "At least one student batch field must be provided",
    );

    const departmentId = this.getDepartmentId();

    try {
      const studentBatch = await this.repository.updateStudentBatch({
        ...this.getAcademicManagementWriteContext(departmentId),
        studentBatchId: id,
        changes: input,
      });

      if (!studentBatch) {
        throw new NotFoundException("Student batch not found");
      }

      return studentBatch;
    } catch (error) {
      this.rethrowKnownError(
        error,
        "Student batch code already exists for this program and academic session",
      );
    }
  }

  listCourses(filters: Omit<CourseListFilters, "departmentId">) {
    return this.repository.findCourses({
      departmentId: this.getDepartmentId(),
      ...filters,
    });
  }

  async getCourse(id: string) {
    const course = await this.repository.findCourseById(
      this.getDepartmentId(),
      id,
    );

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
        ...input,
      });

      await this.writeAudit(
        ACADEMIC_AUDIT_EVENTS.COURSE_CREATED,
        "course",
        course,
        {
          code: input.code,
        },
      );

      return course;
    } catch (error) {
      this.rethrowKnownError(
        error,
        "Course code already exists in this department",
      );
    }
  }

  async updateCourse(id: string, input: UpdateCourseInput) {
    try {
      const result = await this.repository.updateCourse(
        this.getDepartmentId(),
        id,
        input,
      );

      switch (result.outcome) {
        case "COURSE_NOT_FOUND":
          throw new NotFoundException("Course not found");
        case "ACADEMIC_PROGRAM_NOT_FOUND":
          throw new BadRequestException(
            "Academic program does not belong to the active department",
          );
        case "PROGRAMME_DEPENDENCY_CONFLICT":
          throw new ConflictException(
            "Course academic program conflicts with existing curriculum dependencies",
          );
      }

      const course = result.course;

      await this.writeAudit(
        ACADEMIC_AUDIT_EVENTS.COURSE_UPDATED,
        "course",
        course,
        {
          updatedFields: Object.keys(input),
        },
      );

      return course;
    } catch (error) {
      this.rethrowKnownError(
        error,
        "Course code already exists in this department",
      );
    }
  }

  listCourseOfferings(
    filters: Omit<CourseOfferingListFilters, "departmentId">,
  ) {
    if (this.hasRole("teacher") && !this.hasRole("department_admin")) {
      return this.repository.findCourseOfferings({
        departmentId: this.getDepartmentId(),
        ...filters,
        assignedTeacherUserId: this.getActorId(),
        teacherAssignmentStatus: TeacherAssignmentStatus.ACTIVE,
      });
    }

    return this.repository.findCourseOfferings({
      departmentId: this.getDepartmentId(),
      ...filters,
    });
  }

  async listMyCourseOfferings(
    query: Omit<
      StudentCourseOfferingListFilters,
      "departmentId" | "studentUserId" | "now"
    >,
  ) {
    if (!this.hasRole("student")) {
      throw new ForbiddenException(
        "Only students can access student course offerings",
      );
    }

    const offerings = await this.repository.findStudentVisibleCourseOfferings({
      departmentId: this.getDepartmentId(),
      studentUserId: this.getActorId(),
      academicTermId: query.academicTermId,
      now: new Date(),
    });

    return offerings.map((offering) => {
      const { enrollments, ...safeOffering } = offering as {
        enrollments?: unknown[];
        [key: string]: unknown;
      };

      return {
        ...safeOffering,
        myEnrollment: enrollments?.[0] ?? null,
      };
    });
  }

  async getCourseOffering(id: string) {
    const offering =
      this.hasRole("teacher") && !this.hasRole("department_admin")
        ? await this.repository.findCourseOfferingByIdForTeacher(
            this.getDepartmentId(),
            id,
            this.getActorId(),
          )
        : await this.repository.findCourseOfferingById(
            this.getDepartmentId(),
            id,
          );

    if (!offering) {
      throw new NotFoundException("Course offering not found");
    }

    return offering;
  }

  async getCourseOfferingSyllabus(courseOfferingId: string) {
    let syllabusVersion: unknown | null;

    if (this.hasRole("department_admin")) {
      syllabusVersion =
        await this.repository.findBoundSyllabusVersionForCourseOffering(
          this.getDepartmentId(),
          courseOfferingId,
        );
    } else if (this.hasRole("teacher")) {
      syllabusVersion =
        await this.repository.findBoundSyllabusVersionForCourseOfferingForTeacher(
          this.getDepartmentId(),
          courseOfferingId,
          this.getActorId(),
        );
    } else {
      throw new ForbiddenException(
        "Course offering syllabus access is forbidden",
      );
    }

    if (!syllabusVersion) {
      throw new NotFoundException("Syllabus version not found");
    }

    return syllabusVersion;
  }

  async getCourseOfferingLearningOutcomes(courseOfferingId: string) {
    let learningOutcomes: CourseOfferingLearningOutcomesView | null;

    if (this.hasRole("department_admin")) {
      learningOutcomes =
        await this.repository.findApprovedLearningOutcomesForCourseOffering(
          this.getDepartmentId(),
          courseOfferingId,
        );
    } else if (this.hasRole("teacher")) {
      learningOutcomes =
        await this.repository.findApprovedLearningOutcomesForCourseOfferingForTeacher(
          this.getDepartmentId(),
          courseOfferingId,
          this.getActorId(),
        );
    } else {
      throw new ForbiddenException(
        "Course offering learning outcomes access is forbidden",
      );
    }

    if (!learningOutcomes) {
      throw new NotFoundException(
        "Course offering learning outcomes not found",
      );
    }

    return learningOutcomes;
  }

  async createCourseOutlineVersion(
    courseOfferingId: string,
    input: CourseOutlineDraftFields,
  ) {
    this.assertTeacherCourseOutlineAuthor();
    const requestContext = this.requestContextService.get();
    const draftFields = selectCourseOutlineDraftFields(input);
    const result = await this.repository.createCourseOutlineVersion({
      departmentId: this.getDepartmentId(),
      courseOfferingId,
      actorUserId: this.getActorId(),
      courseSummary: draftFields.courseSummary,
      deliveryPlan: draftFields.deliveryPlan,
      teachingStrategies: draftFields.teachingStrategies,
      assessmentStrategy: draftFields.assessmentStrategy,
      evaluationPolicy: draftFields.evaluationPolicy,
      makeUpProcedure: draftFields.makeUpProcedure,
      requestId: requestContext?.requestId,
      ipAddress: requestContext?.audit.ipAddress,
      userAgent: requestContext?.audit.userAgent,
    } satisfies CreateCourseOutlineVersionInput);

    switch (result.outcome) {
      case "CREATED":
        return result.courseOutlineVersion;
      case "OFFERING_NOT_FOUND":
        throw new NotFoundException("Course offering not found");
      case "OFFERING_NOT_FULLY_BOUND":
        throw new ConflictException(
          "Course offering must have curriculum and syllabus bindings",
        );
      case "OPEN_VERSION_ALREADY_EXISTS":
        throw new ConflictException(
          "An in-progress Course Outline version already exists",
        );
      case "VERSION_CONFLICT":
        throw new ConflictException("Course Outline version conflict");
    }
  }

  async listCourseOutlineVersions(courseOfferingId: string) {
    const departmentId = this.getDepartmentId();
    let versions;

    if (this.hasRole("department_admin")) {
      versions = await this.repository.findCourseOutlineVersions(
        departmentId,
        courseOfferingId,
      );
    } else if (this.hasRole("teacher")) {
      versions = await this.repository.findCourseOutlineVersionsForTeacher(
        departmentId,
        courseOfferingId,
        this.getActorId(),
      );
    } else {
      throw new ForbiddenException("Course Outline access is forbidden");
    }

    if (!versions) throw new NotFoundException("Course offering not found");
    return versions;
  }

  async getCourseOutlineVersion(
    courseOfferingId: string,
    courseOutlineVersionId: string,
  ) {
    const departmentId = this.getDepartmentId();
    let version;

    if (this.hasRole("department_admin")) {
      version = await this.repository.findCourseOutlineVersionById(
        departmentId,
        courseOfferingId,
        courseOutlineVersionId,
      );
    } else if (this.hasRole("teacher")) {
      version = await this.repository.findCourseOutlineVersionByIdForTeacher(
        departmentId,
        courseOfferingId,
        courseOutlineVersionId,
        this.getActorId(),
      );
    } else {
      throw new ForbiddenException("Course Outline access is forbidden");
    }

    if (!version) throw new NotFoundException("Course Outline version not found");
    return version;
  }

  async updateCourseOutlineVersion(
    courseOfferingId: string,
    courseOutlineVersionId: string,
    input: CourseOutlineDraftFields,
  ) {
    this.assertTeacherCourseOutlineAuthor();
    const draftFields = selectCourseOutlineDraftFields(input);
    if (!hasCourseOutlineDraftFields(draftFields)) {
      throw new BadRequestException(
        "At least one Course Outline draft field is required",
      );
    }

    const requestContext = this.requestContextService.get();
    const result = await this.repository.updateCourseOutlineVersion({
      departmentId: this.getDepartmentId(),
      courseOfferingId,
      courseOutlineVersionId,
      actorUserId: this.getActorId(),
      courseSummary: draftFields.courseSummary,
      deliveryPlan: draftFields.deliveryPlan,
      teachingStrategies: draftFields.teachingStrategies,
      assessmentStrategy: draftFields.assessmentStrategy,
      evaluationPolicy: draftFields.evaluationPolicy,
      makeUpProcedure: draftFields.makeUpProcedure,
      requestId: requestContext?.requestId,
      ipAddress: requestContext?.audit.ipAddress,
      userAgent: requestContext?.audit.userAgent,
    } satisfies UpdateCourseOutlineVersionInput);

    switch (result.outcome) {
      case "UPDATED":
        return result.courseOutlineVersion;
      case "OFFERING_NOT_FOUND":
      case "OUTLINE_NOT_FOUND":
        throw new NotFoundException("Course Outline version not found");
      case "OUTLINE_NOT_EDITABLE":
        throw new ConflictException(
          "Course Outline version is not editable in its current status",
        );
      case "NO_CHANGES":
        throw new BadRequestException(
          "Course Outline patch contains no actual changes",
        );
      case "VERSION_CONFLICT":
        throw new ConflictException("Course Outline version conflict");
    }
  }

  async submitCourseOutlineVersion(
    courseOfferingId: string,
    courseOutlineVersionId: string,
  ) {
    this.assertTeacherCourseOutlineAuthor();
    const requestContext = this.requestContextService.get();
    const result = await this.repository.submitCourseOutlineVersion({
      departmentId: this.getDepartmentId(),
      courseOfferingId,
      courseOutlineVersionId,
      actorUserId: this.getActorId(),
      transitionAt: new Date(),
      requestId: requestContext?.requestId,
      ipAddress: requestContext?.audit.ipAddress,
      userAgent: requestContext?.audit.userAgent,
    } satisfies SubmitCourseOutlineVersionInput);

    switch (result.outcome) {
      case "SUBMITTED":
        return result.courseOutlineVersion;
      case "OFFERING_NOT_FOUND":
      case "OUTLINE_NOT_FOUND":
        throw new NotFoundException("Course Outline version not found");
      case "OUTLINE_NOT_SUBMITTABLE":
        throw new ConflictException(
          "Course Outline version cannot be submitted in its current status",
        );
      case "VERSION_CONFLICT":
        throw new ConflictException("Course Outline submission conflict");
    }
  }

  async startCourseOutlineCoordinatorReview(
    courseOfferingId: string,
    courseOutlineVersionId: string,
  ) {
    const principal = this.requestContextService.get()?.principal;
    if (
      !principal ||
      principal.isAuthenticated !== true ||
      principal.actorType !== "user" ||
      !principal.actorId ||
      !principal.activeDepartmentId
    ) {
      throw new BadRequestException(
        "Authenticated department user context is required",
      );
    }

    const requestContext = this.requestContextService.get();
    const result = await this.repository.startCourseOutlineCoordinatorReview({
      departmentId: principal.activeDepartmentId,
      courseOfferingId,
      courseOutlineVersionId,
      actorUserId: principal.actorId,
      requestId: requestContext?.requestId,
      ipAddress: requestContext?.audit.ipAddress,
      userAgent: requestContext?.audit.userAgent,
    } satisfies StartCourseOutlineCoordinatorReviewInput);

    switch (result.outcome) {
      case "COORDINATOR_REVIEW_STARTED":
        return result.courseOutlineVersion;
      case "OFFERING_OR_AUTHORITY_NOT_FOUND":
      case "OUTLINE_NOT_FOUND":
        throw new NotFoundException("Course Outline version not found");
      case "OUTLINE_NOT_REVIEWABLE":
        throw new ConflictException(
          "Course Outline version cannot enter Coordinator review in its current status",
        );
      case "CONCURRENT_CONFLICT":
        throw new ConflictException(
          "Course Outline Coordinator review conflict",
        );
    }
  }

  async createCourseOffering(
    input: Omit<CreateCourseOfferingInput, "departmentId">,
  ) {
    await this.assertCourseInDepartment(input.courseId);
    await this.assertAcademicTermInDepartment(input.academicTermId);

    try {
      const offering = await this.repository.createCourseOffering({
        departmentId: this.getDepartmentId(),
        ...input,
      });

      await this.writeAudit(
        ACADEMIC_AUDIT_EVENTS.OFFERING_CREATED,
        "course_offering",
        offering,
        {
          sectionCode: input.sectionCode,
        },
      );

      return offering;
    } catch (error) {
      this.rethrowKnownError(
        error,
        "Course offering section already exists for this course and term",
      );
    }
  }

  async updateCourseOffering(id: string, input: UpdateCourseOfferingInput) {
    try {
      const offering = await this.repository.updateCourseOffering(
        this.getDepartmentId(),
        id,
        input,
      );

      if (!offering) {
        throw new NotFoundException("Course offering not found");
      }

      await this.writeAudit(
        ACADEMIC_AUDIT_EVENTS.OFFERING_UPDATED,
        "course_offering",
        offering,
        {
          updatedFields: Object.keys(input),
        },
      );

      return offering;
    } catch (error) {
      this.rethrowKnownError(
        error,
        "Course offering section already exists for this course and term",
      );
    }
  }

  async bindCourseOfferingCurriculum(
    courseOfferingId: string,
    curriculumCourseId: string,
  ) {
    const departmentId = await this.assertDepartmentAdminCanBindCurriculum();
    const requestContext = this.requestContextService.get();
    const result = await this.repository.bindCourseOfferingCurriculum({
      departmentId,
      courseOfferingId,
      curriculumCourseId,
      actorUserId: this.getActorId(),
      requestId: requestContext?.requestId,
      ipAddress: requestContext?.audit.ipAddress,
      userAgent: requestContext?.audit.userAgent,
    });

    switch (result.outcome) {
      case "BOUND":
      case "ALREADY_BOUND":
        return result.offering;
      case "OFFERING_NOT_FOUND":
        throw new NotFoundException("Course offering not found");
      case "CURRICULUM_COURSE_NOT_FOUND":
        throw new NotFoundException("Curriculum course not found");
      case "DEPENDENCY_SCOPE_MISMATCH":
        throw new NotFoundException("Curriculum binding dependency not found");
      case "COURSE_MISMATCH":
        throw new BadRequestException(
          "Curriculum course does not match the course offering",
        );
      case "INACTIVE_CURRICULUM_VERSION":
        throw new BadRequestException(
          "Curriculum version is not available for binding",
        );
      case "INACTIVE_ASSESSMENT_TEMPLATE":
        throw new BadRequestException(
          "Assessment template is not available for binding",
        );
      case "BINDING_CONFLICT":
        throw new ConflictException(
          "Course offering curriculum binding conflicts with an existing offering",
        );
    }
  }

  async bindCourseOfferingSyllabus(
    courseOfferingId: string,
    syllabusVersionId: string,
  ) {
    const departmentId = await this.assertDepartmentAdminCanBindSyllabus();
    const requestContext = this.requestContextService.get();
    const result = await this.repository.bindCourseOfferingSyllabus({
      departmentId,
      courseOfferingId,
      syllabusVersionId,
      actorUserId: this.getActorId(),
      requestId: requestContext?.requestId,
      ipAddress: requestContext?.audit.ipAddress,
      userAgent: requestContext?.audit.userAgent,
    });

    switch (result.outcome) {
      case "BOUND":
      case "ALREADY_BOUND":
        return result.offering;
      case "OFFERING_NOT_FOUND":
        throw new NotFoundException("Course offering not found");
      case "OFFERING_CURRICULUM_NOT_BOUND":
        throw new BadRequestException(
          "Course offering curriculum must be bound before its syllabus",
        );
      case "SYLLABUS_VERSION_NOT_FOUND":
        throw new NotFoundException("Syllabus version not found");
      case "SYLLABUS_CURRICULUM_MISMATCH":
        throw new BadRequestException(
          "Syllabus version does not match the course offering curriculum",
        );
      case "INELIGIBLE_SYLLABUS_VERSION":
        throw new BadRequestException(
          "Syllabus version is not eligible for a new binding",
        );
      case "MALFORMED_SYLLABUS_VERSION":
      case "DEPENDENCY_SCOPE_MISMATCH":
        throw new NotFoundException("Syllabus binding dependency not found");
      case "BINDING_CONFLICT":
        throw new ConflictException(
          "Course offering syllabus binding conflicts with an existing binding",
        );
    }
  }

  async bindCourseOfferingStudentBatch(
    courseOfferingId: string,
    studentBatchId: string,
  ) {
    const departmentId = await this.assertDepartmentAdminCanBindStudentBatch();
    const requestContext = this.requestContextService.get();
    const result = await this.repository.bindCourseOfferingStudentBatch({
      departmentId,
      courseOfferingId,
      studentBatchId,
      actorUserId: this.getActorId(),
      requestId: requestContext?.requestId,
      ipAddress: requestContext?.audit.ipAddress,
      userAgent: requestContext?.audit.userAgent,
    });

    switch (result.outcome) {
      case "BOUND":
      case "ALREADY_BOUND":
        return result.offering;
      case "OFFERING_NOT_FOUND":
        throw new NotFoundException("Course offering not found");
      case "OFFERING_CURRICULUM_NOT_BOUND":
        throw new BadRequestException(
          "Course offering curriculum must be bound before its StudentBatch",
        );
      case "STUDENT_BATCH_NOT_FOUND":
        throw new NotFoundException("StudentBatch not found");
      case "DEPENDENCY_SCOPE_MISMATCH":
        throw new NotFoundException(
          "StudentBatch binding dependency not found",
        );
      case "PROGRAMME_MISMATCH":
        throw new BadRequestException(
          "Course offering curriculum and StudentBatch programmes must match",
        );
      case "BINDING_CONFLICT":
        throw new ConflictException(
          "Course offering StudentBatch binding conflicts with an existing binding",
        );
    }
  }

  async createSyllabusVersion(
    input: Omit<
      CreateSyllabusVersionInput,
      "departmentId" | "actorUserId" | "requestId" | "ipAddress" | "userAgent"
    >,
  ) {
    const departmentId =
      await this.assertDepartmentAdminCanManageSyllabusVersions();
    const unsafeInput = input as unknown as Record<string, unknown>;
    if (
      "status" in unsafeInput ||
      "approvedAt" in unsafeInput ||
      "archivedAt" in unsafeInput ||
      "departmentId" in unsafeInput
    ) {
      throw new BadRequestException(
        "Syllabus lifecycle and department metadata are server-controlled",
      );
    }

    const curriculumCourseId =
      typeof input.curriculumCourseId === "string"
        ? input.curriculumCourseId.trim()
        : "";
    if (!curriculumCourseId) {
      throw new BadRequestException("Curriculum course ID is required");
    }
    const code = typeof input.code === "string" ? input.code.trim() : "";
    if (!code || code.length > 64) {
      throw new BadRequestException(
        "Syllabus version code must be between 1 and 64 characters",
      );
    }
    if (
      !Number.isInteger(input.versionNumber) ||
      input.versionNumber < 1 ||
      input.versionNumber > 32767
    ) {
      throw new BadRequestException(
        "Syllabus version number must be an integer between 1 and 32767",
      );
    }
    for (const value of [input.effectiveFrom, input.effectiveTo]) {
      if (
        value !== undefined &&
        (!(value instanceof Date) || Number.isNaN(value.getTime()))
      ) {
        throw new BadRequestException("Syllabus effective dates must be valid");
      }
    }
    if (
      input.effectiveFrom &&
      input.effectiveTo &&
      input.effectiveTo <= input.effectiveFrom
    ) {
      throw new BadRequestException(
        "Syllabus effectiveTo must be later than effectiveFrom",
      );
    }

    const requestContext = this.requestContextService.get();
    const result = await this.repository.createSyllabusVersion({
      departmentId,
      curriculumCourseId,
      code,
      versionNumber: input.versionNumber,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      actorUserId: this.getActorId(),
      requestId: requestContext?.requestId,
      ipAddress: requestContext?.audit.ipAddress,
      userAgent: requestContext?.audit.userAgent,
    });

    switch (result.outcome) {
      case "CREATED":
        return result.syllabusVersion;
      case "CURRICULUM_COURSE_NOT_FOUND":
      case "DEPENDENCY_SCOPE_MISMATCH":
        throw new NotFoundException("Curriculum course not found");
      case "DUPLICATE_CODE":
        throw new ConflictException(
          "Syllabus version code already exists for this curriculum course",
        );
      case "DUPLICATE_VERSION_NUMBER":
        throw new ConflictException(
          "Syllabus version number already exists for this curriculum course",
        );
    }
  }

  async listSyllabusVersions(
    filters: Omit<SyllabusVersionListFilters, "departmentId">,
  ) {
    const departmentId =
      await this.assertDepartmentAdminCanManageSyllabusVersions();
    return this.repository.findSyllabusVersions({ departmentId, ...filters });
  }

  async getSyllabusVersion(id: string) {
    const departmentId =
      await this.assertDepartmentAdminCanManageSyllabusVersions();
    const syllabusVersion = await this.repository.findSyllabusVersionById(
      departmentId,
      id,
    );

    if (!syllabusVersion) {
      throw new NotFoundException("Syllabus version not found");
    }

    return syllabusVersion;
  }

  approveSyllabusVersion(
    syllabusVersionId: string,
    input: SyllabusVersionTransitionMetadata,
  ) {
    return this.transitionSyllabusVersion(syllabusVersionId, "APPROVE", input);
  }

  activateSyllabusVersion(
    syllabusVersionId: string,
    input: SyllabusVersionTransitionMetadata,
  ) {
    return this.transitionSyllabusVersion(syllabusVersionId, "ACTIVATE", input);
  }

  retireSyllabusVersion(
    syllabusVersionId: string,
    input: SyllabusVersionTransitionMetadata,
  ) {
    return this.transitionSyllabusVersion(syllabusVersionId, "RETIRE", input);
  }

  archiveSyllabusVersion(
    syllabusVersionId: string,
    input: SyllabusVersionTransitionMetadata,
  ) {
    return this.transitionSyllabusVersion(syllabusVersionId, "ARCHIVE", input);
  }

  private async transitionSyllabusVersion(
    syllabusVersionId: string,
    action: SyllabusVersionLifecycleAction,
    input: SyllabusVersionTransitionMetadata,
  ) {
    const departmentId =
      await this.assertDepartmentAdminCanManageSyllabusLifecycle();
    const unsafeInput = input as unknown as Record<string, unknown>;
    if (
      "status" in unsafeInput ||
      "approvedAt" in unsafeInput ||
      "archivedAt" in unsafeInput ||
      "transitionAt" in unsafeInput ||
      "departmentId" in unsafeInput
    ) {
      throw new BadRequestException(
        "Syllabus lifecycle timestamps, status, and department are server-controlled",
      );
    }

    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if (!reason) {
      throw new BadRequestException("A non-empty transition reason is required");
    }

    const requestContext = this.requestContextService.get();
    const result = await this.repository.transitionSyllabusVersion({
      departmentId,
      syllabusVersionId,
      action,
      reason,
      actorUserId: this.getActorId(),
      transitionAt: new Date(),
      requestId: requestContext?.requestId,
      ipAddress: requestContext?.audit.ipAddress,
      userAgent: requestContext?.audit.userAgent,
    });

    switch (result.outcome) {
      case "TRANSITIONED":
      case "ALREADY_TARGET":
        return result.syllabusVersion;
      case "SYLLABUS_VERSION_NOT_FOUND":
      case "DEPENDENCY_SCOPE_MISMATCH":
        throw new NotFoundException("Syllabus version not found");
      case "INVALID_TRANSITION":
        throw new ConflictException(
          "Syllabus version cannot perform the requested lifecycle transition",
        );
    }
  }

  approveCurriculumVersion(
    curriculumVersionId: string,
    input: CurriculumVersionTransitionMetadata,
  ) {
    return this.transitionCurriculumVersion(
      curriculumVersionId,
      "APPROVE",
      input,
    );
  }

  activateCurriculumVersion(
    curriculumVersionId: string,
    input: CurriculumVersionTransitionMetadata,
  ) {
    return this.transitionCurriculumVersion(
      curriculumVersionId,
      "ACTIVATE",
      input,
    );
  }

  retireCurriculumVersion(
    curriculumVersionId: string,
    input: CurriculumVersionTransitionMetadata,
  ) {
    return this.transitionCurriculumVersion(
      curriculumVersionId,
      "RETIRE",
      input,
    );
  }

  archiveCurriculumVersion(
    curriculumVersionId: string,
    input: CurriculumVersionTransitionMetadata,
  ) {
    return this.transitionCurriculumVersion(
      curriculumVersionId,
      "ARCHIVE",
      input,
    );
  }

  private async transitionCurriculumVersion(
    curriculumVersionId: string,
    action: CurriculumVersionLifecycleAction,
    input: CurriculumVersionTransitionMetadata,
  ) {
    const departmentId =
      await this.assertDepartmentAdminCanManageCurriculumLifecycle();
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    const approvalReference =
      typeof input.approvalReference === "string"
        ? input.approvalReference.trim()
        : undefined;

    if (!reason) {
      throw new BadRequestException("A non-empty transition reason is required");
    }
    if (input.approvalReference !== undefined && !approvalReference) {
      throw new BadRequestException(
        "approvalReference must be non-empty when supplied",
      );
    }
    if (action === "APPROVE" && !approvalReference) {
      throw new BadRequestException(
        "A formal approvalReference is required to approve a curriculum version",
      );
    }

    const requestContext = this.requestContextService.get();
    const result = await this.repository.transitionCurriculumVersion({
      departmentId,
      curriculumVersionId,
      action,
      reason,
      ...(approvalReference ? { approvalReference } : {}),
      actorUserId: this.getActorId(),
      transitionAt: new Date(),
      requestId: requestContext?.requestId,
      ipAddress: requestContext?.audit.ipAddress,
      userAgent: requestContext?.audit.userAgent,
    });

    switch (result.outcome) {
      case "TRANSITIONED":
      case "ALREADY_TARGET":
        return result.curriculumVersion;
      case "CURRICULUM_VERSION_NOT_FOUND":
      case "DEPENDENCY_SCOPE_MISMATCH":
        throw new NotFoundException("Curriculum version not found");
      case "INVALID_TRANSITION":
        throw new ConflictException(
          "Curriculum version cannot perform the requested lifecycle transition",
        );
    }
  }

  async createStudentCurriculumAssignment(
    studentUserId: string,
    academicProgramId: string,
    curriculumVersionId: string,
  ) {
    const departmentId =
      await this.assertDepartmentAdminCanAssignStudentCurriculum();
    const requestContext = this.requestContextService.get();
    const result = await this.repository.createStudentCurriculumAssignment({
      departmentId,
      studentUserId,
      academicProgramId,
      curriculumVersionId,
      actorUserId: this.getActorId(),
      requestId: requestContext?.requestId,
      ipAddress: requestContext?.audit.ipAddress,
      userAgent: requestContext?.audit.userAgent,
    });

    switch (result.outcome) {
      case "CREATED":
      case "ALREADY_ASSIGNED":
        return result.assignment;
      case "STUDENT_NOT_FOUND":
        throw new NotFoundException("Student not found");
      case "ACADEMIC_PROGRAM_NOT_FOUND":
        throw new NotFoundException("Academic program not found");
      case "CURRICULUM_VERSION_NOT_FOUND":
      case "DEPENDENCY_SCOPE_MISMATCH":
        throw new NotFoundException("Curriculum version not found");
      case "INACTIVE_CURRICULUM_VERSION":
        throw new BadRequestException(
          "Curriculum version is not available for student assignment",
        );
      case "ASSIGNMENT_CONFLICT":
        throw new ConflictException(
          "Student already has a different curriculum assignment for this academic program",
        );
    }
  }

  async assignTeacherToCourseOffering(
    courseOfferingId: string,
    input: Omit<
      CreateTeacherAssignmentInput,
      "departmentId" | "courseOfferingId" | "roleCode"
    > & { roleCode?: string },
  ) {
    const departmentId =
      await this.assertDepartmentAdminCanManageTeacherAssignments();
    await this.assertCourseOfferingInDepartment(courseOfferingId);
    await this.assertTeacherInDepartment(input.teacherUserId);

    const roleCode = input.roleCode?.trim() || "primary_instructor";

    try {
      const assignment =
        await this.repository.createOrReactivateTeacherAssignment({
          departmentId,
          courseOfferingId,
          teacherUserId: input.teacherUserId,
          roleCode,
        });

      if (!assignment) {
        throw new ConflictException(
          "Archived teacher assignment cannot be reactivated",
        );
      }

      await this.writeAudit(
        ACADEMIC_AUDIT_EVENTS.TEACHER_ASSIGNMENT_ASSIGNED,
        "teacher_course_assignment",
        assignment,
        {
          courseOfferingId,
          teacherUserId: input.teacherUserId,
          roleCode,
        },
      );

      return assignment;
    } catch (error) {
      this.rethrowKnownError(
        error,
        "Teacher is already assigned to this course offering with that role",
      );
    }
  }

  async listTeacherAssignmentsForCourseOffering(courseOfferingId: string) {
    const departmentId =
      await this.assertDepartmentAdminCanManageTeacherAssignments();
    await this.assertCourseOfferingInDepartment(courseOfferingId);

    return this.repository.findTeacherAssignments({
      departmentId,
      courseOfferingId,
    });
  }

  async unassignTeacherAssignment(assignmentId: string) {
    const departmentId =
      await this.assertDepartmentAdminCanManageTeacherAssignments();
    const existing = await this.repository.findTeacherAssignmentById(
      departmentId,
      assignmentId,
    );

    if (!existing) {
      throw new NotFoundException("Teacher assignment not found");
    }

    const assignment = await this.repository.unassignTeacherAssignment(
      departmentId,
      assignmentId,
      new Date(),
    );

    if (!assignment) {
      throw new NotFoundException("Teacher assignment not found");
    }

    await this.writeAudit(
      ACADEMIC_AUDIT_EVENTS.TEACHER_ASSIGNMENT_UNASSIGNED,
      "teacher_course_assignment",
      assignment,
      {
        courseOfferingId: (assignment as { courseOfferingId?: string })
          .courseOfferingId,
        teacherUserId: (assignment as { teacherUserId?: string }).teacherUserId,
        roleCode: (assignment as { roleCode?: string }).roleCode,
      },
    );

    return assignment;
  }

  listEnrollments(filters: Omit<EnrollmentListFilters, "departmentId">) {
    return this.repository.findEnrollments({
      departmentId: this.getDepartmentId(),
      ...filters,
    });
  }

  async getEnrollment(id: string) {
    const enrollment = await this.repository.findEnrollmentById(
      this.getDepartmentId(),
      id,
    );

    if (!enrollment) {
      throw new NotFoundException("Enrollment not found");
    }

    return enrollment;
  }

  listMyEnrollments(
    filters: Omit<EnrollmentListFilters, "departmentId" | "studentUserId">,
  ) {
    const { studentUserId: _ignoredStudentUserId, ...safeFilters } =
      filters as Omit<EnrollmentListFilters, "departmentId">;

    return this.repository.findEnrollments({
      departmentId: this.getDepartmentId(),
      ...safeFilters,
      studentUserId: this.getActorId(),
    });
  }

  async getMyEnrollment(id: string) {
    const enrollment = await this.repository.findEnrollmentByIdForStudent(
      this.getDepartmentId(),
      id,
      this.getActorId(),
    );

    if (!enrollment) {
      throw new NotFoundException("Enrollment not found");
    }

    return enrollment;
  }

  async createEnrollment(input: Omit<CreateEnrollmentInput, "departmentId">) {
    const departmentId = this.getDepartmentId();
    const actorId = this.getActorId();
    const result = await this.repository.createEnrollment({
      departmentId,
      academicTermId: input.academicTermId,
      courseOfferingId: input.courseOfferingId,
      studentUserId: input.studentUserId,
      approvedByUserId:
        input.status === EnrollmentStatus.APPROVED ? actorId : undefined,
      sourceType: input.sourceType,
      status: input.status,
      eligibilityStatus: input.eligibilityStatus,
      eligibilitySnapshotJson: input.eligibilitySnapshotJson,
    });

    switch (result.outcome) {
      case "OFFERING_NOT_FOUND":
        throw new BadRequestException(
          "Course offering does not belong to the active department",
        );
      case "OFFERING_CURRICULUM_NOT_BOUND":
        throw new BadRequestException(
          "Course offering is not bound to a curriculum course",
        );
      case "TERM_MISMATCH":
        throw new BadRequestException(
          "Enrollment term must match the selected course offering",
        );
      case "STUDENT_NOT_FOUND":
        throw new BadRequestException(
          "Student user does not belong to the active department",
        );
      case "STUDENT_CURRICULUM_ASSIGNMENT_NOT_FOUND":
        throw new BadRequestException(
          "Student has no curriculum assignment for the offering programme",
        );
      case "CURRICULUM_DEPENDENCY_MISMATCH":
        throw new NotFoundException(
          "Enrollment curriculum dependency not found",
        );
      case "STUDENT_CURRICULUM_VERSION_MISMATCH":
        throw new BadRequestException(
          "Student curriculum version does not match the course offering",
        );
      case "DUPLICATE_ENROLLMENT":
        throw new ConflictException(
          "Student is already enrolled in this course offering",
        );
      case "CREATED": {
        const enrollment = result.enrollment as {
          id: string;
          studentCurriculumAssignmentId?: string | null;
          curriculumCourseId?: string | null;
        };
        await this.writeAudit(
          ACADEMIC_AUDIT_EVENTS.ENROLLMENT_CREATED,
          "enrollment",
          enrollment,
          {
            studentUserId: input.studentUserId,
            studentCurriculumAssignmentId:
              enrollment.studentCurriculumAssignmentId,
            curriculumCourseId: enrollment.curriculumCourseId,
          },
        );

        return this.getEnrollment(enrollment.id);
      }
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
      droppedAt: input.droppedAt,
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

    const enrollment = await this.repository.updateEnrollment(
      this.getDepartmentId(),
      id,
      data,
    );

    if (!enrollment) {
      throw new NotFoundException("Enrollment not found");
    }

    await this.writeAudit(
      ACADEMIC_AUDIT_EVENTS.ENROLLMENT_UPDATED,
      "enrollment",
      enrollment,
      {
        updatedFields: Object.keys(input),
      },
    );

    return enrollment;
  }

  private async assertEnrollmentExists(id: string) {
    const enrollment = await this.repository.findEnrollmentById(
      this.getDepartmentId(),
      id,
    );

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

    const program = await this.repository.findProgramById(
      this.getDepartmentId(),
      academicProgramId,
    );

    if (!program) {
      throw new BadRequestException(
        "Academic program does not belong to the active department",
      );
    }
  }

  private async assertCourseInDepartment(courseId: string) {
    const course = await this.repository.findCourseById(
      this.getDepartmentId(),
      courseId,
    );

    if (!course) {
      throw new BadRequestException(
        "Course does not belong to the active department",
      );
    }

    return course;
  }

  private async assertAcademicYearInDepartment(academicYearId: string) {
    const academicYear = await this.repository.findAcademicYearById(
      this.getDepartmentId(),
      academicYearId,
    );

    if (!academicYear) {
      throw new BadRequestException(
        "Academic year does not belong to the active department",
      );
    }

    return academicYear as AcademicYear;
  }

  private async assertAcademicSessionInDepartment(academicSessionId: string) {
    const academicSession = await this.repository.findAcademicSessionById(
      this.getDepartmentId(),
      academicSessionId,
    );

    if (!academicSession) {
      throw new BadRequestException(
        "Academic session does not belong to the active department",
      );
    }
  }

  private async assertCourseOfferingInDepartment(courseOfferingId: string) {
    const offering = await this.repository.findCourseOfferingById(
      this.getDepartmentId(),
      courseOfferingId,
    );

    if (!offering) {
      throw new BadRequestException(
        "Course offering does not belong to the active department",
      );
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
        archivedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!term) {
      throw new BadRequestException(
        "Academic term does not belong to the active department",
      );
    }
  }

  private validateAcademicTermDates(
    input: {
      startDate: Date;
      endDate: Date;
      enrollmentStartAt?: Date | null;
      enrollmentEndAt?: Date | null;
    },
    academicYear: AcademicYear,
  ) {
    this.assertDateRange(
      input.startDate,
      input.endDate,
      "Academic term endDate must be after startDate",
    );

    if (
      input.startDate < academicYear.startDate ||
      input.endDate > academicYear.endDate
    ) {
      throw new BadRequestException(
        "Academic term dates must be within the academic year",
      );
    }

    if (input.enrollmentStartAt && input.enrollmentEndAt) {
      this.assertDateRange(
        input.enrollmentStartAt,
        input.enrollmentEndAt,
        "Academic term enrollmentEndAt must be after enrollmentStartAt",
      );
    }

    if (input.enrollmentStartAt && input.enrollmentStartAt < input.startDate) {
      throw new BadRequestException(
        "Academic term enrollmentStartAt cannot be before startDate",
      );
    }

    if (input.enrollmentEndAt && input.enrollmentEndAt > input.endDate) {
      throw new BadRequestException(
        "Academic term enrollmentEndAt cannot be after endDate",
      );
    }
  }

  private assertDateRange(startDate: Date, endDate: Date, message: string) {
    if (endDate <= startDate) {
      throw new BadRequestException(message);
    }
  }

  private assertUpdateHasAtLeastOneDefinedField(
    input: Record<string, unknown>,
    message: string,
  ) {
    const hasDefinedField = Object.values(input).some(
      (value) => value !== undefined,
    );

    if (!hasDefinedField) {
      throw new BadRequestException(message);
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
          in: [UserStatus.ACTIVE, UserStatus.INVITED],
        },
      },
      select: {
        id: true,
      },
    });

    if (!student) {
      throw new BadRequestException(
        "Student user does not belong to the active department",
      );
    }
  }

  private async assertDepartmentAdminCanManageTeacherAssignments() {
    const departmentId = this.getDepartmentId();

    if (!this.hasRole("department_admin")) {
      throw new ForbiddenException(
        "Only department admins can manage teacher assignments",
      );
    }

    const department = await this.prisma.department.findFirst({
      where: {
        id: departmentId,
        status: DepartmentStatus.ACTIVE,
        archivedAt: null,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!department) {
      throw new BadRequestException("Active department context is required");
    }

    return departmentId;
  }

  private async assertDepartmentAdminCanBindCurriculum() {
    const departmentId = this.getDepartmentId();
    const actorId = this.getActorId();
    const now = new Date();
    const actor = await this.prisma.user.findFirst({
      where: {
        id: actorId,
        departmentId,
        status: UserStatus.ACTIVE,
        archivedAt: null,
        deletedAt: null,
        department: {
          id: departmentId,
          status: DepartmentStatus.ACTIVE,
          archivedAt: null,
          deletedAt: null,
        },
        userRoles: {
          some: {
            departmentId,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            role: {
              code: "department_admin",
              departmentId,
              archivedAt: null,
            },
          },
        },
      },
      select: { id: true },
    });

    if (!actor) {
      throw new ForbiddenException(
        "Only active department admins can manage curriculum bindings",
      );
    }

    return departmentId;
  }

  private async assertDepartmentAdminCanBindSyllabus() {
    const departmentId = this.getDepartmentId();
    const actorId = this.getActorId();
    const principal = this.requestContextService.get()?.principal;
    const bindingPermission = principal?.permissions.find(
      (permission) =>
        permission.resource === SYLLABUS_BINDING_PERMISSION.resource &&
        permission.action === SYLLABUS_BINDING_PERMISSION.action &&
        permission.scope === "department" &&
        isPermissionGrantFromLoadedRole(principal, permission) &&
        principal.roleAssignments.some(
          (assignment) =>
            assignment.role === "department_admin" &&
            assignment.departmentId === departmentId &&
            assignment.userRoleId === permission.source?.userRoleId &&
            assignment.roleId === permission.source?.roleId,
        ),
    );

    if (!bindingPermission?.source) {
      throw new ForbiddenException(
        "Explicit academic governance permission is required to manage syllabus bindings",
      );
    }
    const permissionSource = bindingPermission.source;
    const now = new Date();
    const actor = await this.prisma.user.findFirst({
      where: {
        id: actorId,
        departmentId,
        status: UserStatus.ACTIVE,
        archivedAt: null,
        deletedAt: null,
        department: {
          id: departmentId,
          status: DepartmentStatus.ACTIVE,
          archivedAt: null,
          deletedAt: null,
        },
        userRoles: {
          some: {
            id: permissionSource.userRoleId,
            departmentId,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            role: {
              id: permissionSource.roleId,
              code: "department_admin",
              departmentId,
              archivedAt: null,
              rolePermissions: {
                some: {
                  permission: {
                    is: {
                      code: SYLLABUS_BINDING_PERMISSION.code,
                      resource: SYLLABUS_BINDING_PERMISSION.resource,
                      action: SYLLABUS_BINDING_PERMISSION.action,
                      scope: PermissionScope.DEPARTMENT,
                    },
                  },
                },
              },
            },
          },
        },
      },
      select: { id: true },
    });

    if (!actor) {
      throw new ForbiddenException(
        "Only active department admins can manage syllabus bindings",
      );
    }

    return departmentId;
  }

  private async assertDepartmentAdminCanBindStudentBatch() {
    const departmentId = this.getDepartmentId();
    const actorId = this.getActorId();
    const principal = this.requestContextService.get()?.principal;
    const bindingPermission = principal?.permissions.find(
      (permission) =>
        permission.resource === STUDENT_BATCH_BINDING_PERMISSION.resource &&
        permission.action === STUDENT_BATCH_BINDING_PERMISSION.action &&
        permission.scope === "department" &&
        isPermissionGrantFromLoadedRole(principal, permission) &&
        principal.roleAssignments.some(
          (assignment) =>
            assignment.role === "department_admin" &&
            assignment.departmentId === departmentId &&
            assignment.userRoleId === permission.source?.userRoleId &&
            assignment.roleId === permission.source?.roleId,
        ),
    );

    if (!bindingPermission?.source) {
      throw new ForbiddenException(
        "Explicit academic governance permission is required to manage StudentBatch bindings",
      );
    }
    const permissionSource = bindingPermission.source;
    const now = new Date();
    const actor = await this.prisma.user.findFirst({
      where: {
        id: actorId,
        departmentId,
        status: UserStatus.ACTIVE,
        archivedAt: null,
        deletedAt: null,
        department: {
          id: departmentId,
          status: DepartmentStatus.ACTIVE,
          archivedAt: null,
          deletedAt: null,
        },
        userRoles: {
          some: {
            id: permissionSource.userRoleId,
            departmentId,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            role: {
              id: permissionSource.roleId,
              code: "department_admin",
              departmentId,
              archivedAt: null,
              rolePermissions: {
                some: {
                  permission: {
                    is: {
                      code: STUDENT_BATCH_BINDING_PERMISSION.code,
                      resource: STUDENT_BATCH_BINDING_PERMISSION.resource,
                      action: STUDENT_BATCH_BINDING_PERMISSION.action,
                      scope: PermissionScope.DEPARTMENT,
                    },
                  },
                },
              },
            },
          },
        },
      },
      select: { id: true },
    });

    if (!actor) {
      throw new ForbiddenException(
        "Only active department admins can manage StudentBatch bindings",
      );
    }

    return departmentId;
  }

  private async assertDepartmentAdminCanManageCurriculumLifecycle() {
    const departmentId = this.getDepartmentId();
    const actorId = this.getActorId();
    const principal = this.requestContextService.get()?.principal;
    const hasExactGovernancePermission = principal?.permissions.some(
      (permission) =>
        permission.resource ===
          CURRICULUM_VERSION_LIFECYCLE_PERMISSION.resource &&
        permission.action === CURRICULUM_VERSION_LIFECYCLE_PERMISSION.action &&
        permission.scope === "department",
    );

    if (!hasExactGovernancePermission) {
      throw new ForbiddenException(
        "Explicit academic governance permission is required to manage curriculum version lifecycle",
      );
    }

    const now = new Date();
    const actor = await this.prisma.user.findFirst({
      where: {
        id: actorId,
        departmentId,
        status: UserStatus.ACTIVE,
        archivedAt: null,
        deletedAt: null,
        department: {
          id: departmentId,
          status: DepartmentStatus.ACTIVE,
          archivedAt: null,
          deletedAt: null,
        },
        userRoles: {
          some: {
            departmentId,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            role: {
              code: "department_admin",
              departmentId,
              archivedAt: null,
              rolePermissions: {
                some: {
                  permission: {
                    is: {
                      resource:
                        CURRICULUM_VERSION_LIFECYCLE_PERMISSION.resource,
                      action: CURRICULUM_VERSION_LIFECYCLE_PERMISSION.action,
                      scope: PermissionScope.DEPARTMENT,
                    },
                  },
                },
              },
            },
          },
        },
      },
      select: { id: true },
    });

    if (!actor) {
      throw new ForbiddenException(
        "Only active department admins can manage curriculum version lifecycle",
      );
    }

    return departmentId;
  }

  private async assertDepartmentAdminCanManageSyllabusVersions() {
    const departmentId = this.getDepartmentId();
    const actorId = this.getActorId();
    const principal = this.requestContextService.get()?.principal;
    const hasExactGovernancePermission = principal?.permissions.some(
      (permission) =>
        permission.resource === SYLLABUS_VERSION_MANAGE_PERMISSION.resource &&
        permission.action === SYLLABUS_VERSION_MANAGE_PERMISSION.action &&
        permission.scope === "department",
    );

    if (!hasExactGovernancePermission) {
      throw new ForbiddenException(
        "Explicit academic governance permission is required to manage syllabus versions",
      );
    }

    const now = new Date();
    const actor = await this.prisma.user.findFirst({
      where: {
        id: actorId,
        departmentId,
        status: UserStatus.ACTIVE,
        archivedAt: null,
        deletedAt: null,
        department: {
          id: departmentId,
          status: DepartmentStatus.ACTIVE,
          archivedAt: null,
          deletedAt: null,
        },
        userRoles: {
          some: {
            departmentId,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            role: {
              code: "department_admin",
              departmentId,
              archivedAt: null,
              rolePermissions: {
                some: {
                  permission: {
                    is: {
                      resource: SYLLABUS_VERSION_MANAGE_PERMISSION.resource,
                      action: SYLLABUS_VERSION_MANAGE_PERMISSION.action,
                      scope: PermissionScope.DEPARTMENT,
                    },
                  },
                },
              },
            },
          },
        },
      },
      select: { id: true },
    });

    if (!actor) {
      throw new ForbiddenException(
        "Only active department admins can manage syllabus versions",
      );
    }

    return departmentId;
  }

  private async assertDepartmentAdminCanManageSyllabusLifecycle() {
    const departmentId = this.getDepartmentId();
    const actorId = this.getActorId();
    const principal = this.requestContextService.get()?.principal;
    const governancePermission = principal?.permissions.find(
      (permission) =>
        permission.resource ===
          SYLLABUS_VERSION_LIFECYCLE_PERMISSION.resource &&
        permission.action === SYLLABUS_VERSION_LIFECYCLE_PERMISSION.action &&
        permission.scope === "department" &&
        isPermissionGrantFromLoadedRole(principal, permission) &&
        principal.roleAssignments.some(
          (assignment) =>
            assignment.role === "department_admin" &&
            assignment.departmentId === departmentId &&
            assignment.userRoleId === permission.source?.userRoleId &&
            assignment.roleId === permission.source?.roleId,
        ),
    );

    if (!governancePermission?.source) {
      throw new ForbiddenException(
        "Explicit academic governance permission is required to manage syllabus version lifecycle",
      );
    }
    const permissionSource = governancePermission.source;

    const now = new Date();
    const actor = await this.prisma.user.findFirst({
      where: {
        id: actorId,
        departmentId,
        status: UserStatus.ACTIVE,
        archivedAt: null,
        deletedAt: null,
        department: {
          id: departmentId,
          status: DepartmentStatus.ACTIVE,
          archivedAt: null,
          deletedAt: null,
        },
        userRoles: {
          some: {
            id: permissionSource.userRoleId,
            departmentId,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            role: {
              id: permissionSource.roleId,
              code: "department_admin",
              departmentId,
              archivedAt: null,
              rolePermissions: {
                some: {
                  permission: {
                    is: {
                      resource: SYLLABUS_VERSION_LIFECYCLE_PERMISSION.resource,
                      action: SYLLABUS_VERSION_LIFECYCLE_PERMISSION.action,
                      scope: PermissionScope.DEPARTMENT,
                    },
                  },
                },
              },
            },
          },
        },
      },
      select: { id: true },
    });

    if (!actor) {
      throw new ForbiddenException(
        "Only active department admins can manage syllabus version lifecycle",
      );
    }

    return departmentId;
  }

  private async assertDepartmentAdminCanAssignStudentCurriculum() {
    const departmentId = this.getDepartmentId();
    const actorId = this.getActorId();
    const now = new Date();
    const actor = await this.prisma.user.findFirst({
      where: {
        id: actorId,
        departmentId,
        status: UserStatus.ACTIVE,
        archivedAt: null,
        deletedAt: null,
        department: {
          id: departmentId,
          status: DepartmentStatus.ACTIVE,
          archivedAt: null,
          deletedAt: null,
        },
        userRoles: {
          some: {
            departmentId,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            role: {
              code: "department_admin",
              departmentId,
              archivedAt: null,
            },
          },
        },
      },
      select: { id: true },
    });

    if (!actor) {
      throw new ForbiddenException(
        "Only active department admins can assign student curricula",
      );
    }

    return departmentId;
  }

  private async assertTeacherInDepartment(teacherUserId: string) {
    const departmentId = this.getDepartmentId();
    const now = new Date();
    const teacher = await this.prisma.user.findFirst({
      where: {
        id: teacherUserId,
        departmentId,
        deletedAt: null,
        archivedAt: null,
        status: UserStatus.ACTIVE,
        userRoles: {
          some: {
            departmentId,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            role: {
              code: "teacher",
              departmentId,
              archivedAt: null,
            },
          },
        },
      },
      select: {
        id: true,
      },
    });

    if (!teacher) {
      throw new BadRequestException(
        "Teacher user does not belong to the active department",
      );
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

  private getAcademicManagementWriteContext(departmentId: string) {
    const requestContext = this.requestContextService.get();

    return {
      departmentId,
      actorUserId: this.getActorId(),
      requestId: requestContext?.requestId,
      ipAddress: requestContext?.audit.ipAddress,
      userAgent: requestContext?.audit.userAgent,
    };
  }

  private hasRole(role: "department_admin" | "teacher" | "student") {
    const principal = this.requestContextService.get()?.principal;
    const departmentId = principal?.activeDepartmentId;

    return Boolean(
      departmentId &&
      principal?.roleAssignments.some(
        (assignment) =>
          assignment.departmentId === departmentId && assignment.role === role,
      ),
    );
  }

  private assertTeacherCourseOutlineAuthor() {
    if (!this.hasRole("teacher")) {
      throw new ForbiddenException(
        "Only an assigned Teacher can author Course Outlines",
      );
    }
  }

  private async writeAudit(
    action: string,
    targetType: string,
    target: unknown,
    metadata?: AuditMetadata,
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
        contextJson: metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private rethrowKnownError(error: unknown, message: string): never {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException(message);
    }

    throw error;
  }
}
