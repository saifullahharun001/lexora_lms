import type {
  AcademicProgramStatus,
  AcademicTermStatus,
  AcademicVersionStatus,
  AcademicYearStatus,
  CourseOfferingStatus,
  CourseOutlineStatus,
  CourseStatus,
  EligibilityStatus,
  EnrollmentSourceType,
  EnrollmentStatus,
  Prisma,
  TeacherAssignmentStatus,
} from "@prisma/client";

import type { CourseOutlineDraftFields } from "../../domain/course-outline-draft-fields";

export interface ProgramListFilters {
  departmentId: string;
  status?: AcademicProgramStatus;
  search?: string;
}

export interface AcademicYearListFilters {
  departmentId: string;
  status?: AcademicYearStatus;
  isCurrent?: boolean;
  search?: string;
}

export interface AcademicTermListFilters {
  departmentId: string;
  academicYearId?: string;
  status?: AcademicTermStatus;
}

export interface CourseListFilters {
  departmentId: string;
  academicProgramId?: string;
  status?: CourseStatus;
  search?: string;
}

export interface CourseOfferingListFilters {
  departmentId: string;
  academicTermId?: string;
  courseId?: string;
  status?: CourseOfferingStatus;
  assignedTeacherUserId?: string;
  teacherAssignmentStatus?: TeacherAssignmentStatus;
}

export interface SyllabusVersionListFilters {
  departmentId: string;
  curriculumCourseId?: string;
  status?: AcademicVersionStatus;
}

export interface StudentCourseOfferingListFilters {
  departmentId: string;
  studentUserId: string;
  academicTermId?: string;
  now?: Date;
}

export interface TeacherAssignmentListFilters {
  departmentId: string;
  courseOfferingId: string;
}

export interface CourseOutlineVersionView {
  id: string;
  departmentId: string;
  courseOfferingId: string;
  curriculumCourseId: string;
  syllabusVersionId: string;
  versionNumber: number;
  status: CourseOutlineStatus;
  courseSummary: string | null;
  deliveryPlan: string | null;
  teachingStrategies: string | null;
  assessmentStrategy: string | null;
  evaluationPolicy: string | null;
  makeUpProcedure: string | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  activatedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CourseOutlineWriteAuditInput {
  actorUserId: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CreateCourseOutlineVersionInput
  extends CourseOutlineDraftFields,
    CourseOutlineWriteAuditInput {
  departmentId: string;
  courseOfferingId: string;
}

export interface UpdateCourseOutlineVersionInput
  extends CourseOutlineDraftFields,
    CourseOutlineWriteAuditInput {
  departmentId: string;
  courseOfferingId: string;
  courseOutlineVersionId: string;
}

export interface SubmitCourseOutlineVersionInput
  extends CourseOutlineWriteAuditInput {
  departmentId: string;
  courseOfferingId: string;
  courseOutlineVersionId: string;
  transitionAt: Date;
}

export type CreateCourseOutlineVersionResult =
  | { outcome: "CREATED"; courseOutlineVersion: CourseOutlineVersionView }
  | {
      outcome:
        | "OFFERING_NOT_FOUND"
        | "OFFERING_NOT_FULLY_BOUND"
        | "OPEN_VERSION_ALREADY_EXISTS"
        | "VERSION_CONFLICT";
    };

export type UpdateCourseOutlineVersionResult =
  | { outcome: "UPDATED"; courseOutlineVersion: CourseOutlineVersionView }
  | {
      outcome:
        | "OFFERING_NOT_FOUND"
        | "OUTLINE_NOT_FOUND"
        | "OUTLINE_NOT_EDITABLE"
        | "NO_CHANGES"
        | "VERSION_CONFLICT";
    };

export type SubmitCourseOutlineVersionResult =
  | { outcome: "SUBMITTED"; courseOutlineVersion: CourseOutlineVersionView }
  | {
      outcome:
        | "OFFERING_NOT_FOUND"
        | "OUTLINE_NOT_FOUND"
        | "OUTLINE_NOT_SUBMITTABLE"
        | "VERSION_CONFLICT";
    };

export interface ProgramLearningOutcomeReadView {
  id: string;
  code: string;
  statement: string;
  displayOrder: number;
}

export interface CourseLearningOutcomeReadView {
  id: string;
  code: string;
  statement: string;
  displayOrder: number;
  mappedProgramLearningOutcomes: ProgramLearningOutcomeReadView[];
}

export interface CourseOfferingLearningOutcomesView {
  courseOfferingId: string;
  curriculumCourse: {
    id: string;
    courseCodeSnapshot: string;
    courseTitleSnapshot: string;
    curriculumVersion: {
      id: string;
      code: string;
      name: string;
      status: AcademicVersionStatus;
      effectiveAcademicSessionCode: string;
    };
  };
  courseLearningOutcomes: CourseLearningOutcomeReadView[];
}

export interface EnrollmentListFilters {
  departmentId: string;
  academicTermId?: string;
  courseOfferingId?: string;
  studentUserId?: string;
  status?: EnrollmentStatus;
  eligibilityStatus?: EligibilityStatus;
}

export interface CreateProgramInput {
  departmentId: string;
  code: string;
  name: string;
  description?: string;
  status?: AcademicProgramStatus;
}

export interface UpdateProgramInput {
  code?: string;
  name?: string;
  description?: string | null;
  status?: AcademicProgramStatus;
}

export interface CreateAcademicYearInput {
  departmentId: string;
  code: string;
  name: string;
  startDate: Date;
  endDate: Date;
  isCurrent?: boolean;
  status?: AcademicYearStatus;
}

export interface UpdateAcademicYearInput {
  code?: string;
  name?: string;
  startDate?: Date;
  endDate?: Date;
  isCurrent?: boolean;
  status?: AcademicYearStatus;
}

export interface CreateAcademicTermInput {
  departmentId: string;
  academicYearId: string;
  code: string;
  name: string;
  sequence: number;
  startDate: Date;
  endDate: Date;
  enrollmentStartAt?: Date | null;
  enrollmentEndAt?: Date | null;
  status?: AcademicTermStatus;
}

export interface UpdateAcademicTermInput {
  academicYearId?: string;
  code?: string;
  name?: string;
  sequence?: number;
  startDate?: Date;
  endDate?: Date;
  enrollmentStartAt?: Date | null;
  enrollmentEndAt?: Date | null;
  status?: AcademicTermStatus;
}

export interface CreateCourseInput {
  departmentId: string;
  academicProgramId?: string | null;
  code: string;
  title: string;
  description?: string;
  creditHours: Prisma.Decimal;
  lectureHours?: Prisma.Decimal | null;
  labHours?: Prisma.Decimal | null;
  status?: CourseStatus;
}

export interface UpdateCourseInput {
  academicProgramId?: string | null;
  code?: string;
  title?: string;
  description?: string | null;
  creditHours?: Prisma.Decimal;
  lectureHours?: Prisma.Decimal | null;
  labHours?: Prisma.Decimal | null;
  status?: CourseStatus;
}

export interface CreateCourseOfferingInput {
  departmentId: string;
  courseId: string;
  academicTermId: string;
  sectionCode: string;
  capacity?: number | null;
  status?: CourseOfferingStatus;
  visibilityStartAt?: Date | null;
  visibilityEndAt?: Date | null;
}

export interface CreateTeacherAssignmentInput {
  departmentId: string;
  courseOfferingId: string;
  teacherUserId: string;
  roleCode: string;
}

export interface UpdateCourseOfferingInput {
  sectionCode?: string;
  capacity?: number | null;
  status?: CourseOfferingStatus;
  visibilityStartAt?: Date | null;
  visibilityEndAt?: Date | null;
}

export interface BindCourseOfferingCurriculumInput {
  departmentId: string;
  courseOfferingId: string;
  curriculumCourseId: string;
  actorUserId: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface BindCourseOfferingSyllabusInput {
  departmentId: string;
  courseOfferingId: string;
  syllabusVersionId: string;
  actorUserId: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface BindCourseOfferingStudentBatchInput {
  departmentId: string;
  courseOfferingId: string;
  studentBatchId: string;
  actorUserId: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CreateSyllabusVersionInput {
  departmentId: string;
  curriculumCourseId: string;
  code: string;
  versionNumber: number;
  effectiveFrom?: Date;
  effectiveTo?: Date;
  actorUserId: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export type CreateSyllabusVersionResult =
  | { outcome: "CREATED"; syllabusVersion: unknown }
  | {
      outcome:
        | "CURRICULUM_COURSE_NOT_FOUND"
        | "DEPENDENCY_SCOPE_MISMATCH"
        | "DUPLICATE_CODE"
        | "DUPLICATE_VERSION_NUMBER";
    };

export type BindCourseOfferingCurriculumResult =
  | { outcome: "BOUND" | "ALREADY_BOUND"; offering: unknown }
  | {
      outcome:
        | "OFFERING_NOT_FOUND"
        | "CURRICULUM_COURSE_NOT_FOUND"
        | "DEPENDENCY_SCOPE_MISMATCH"
        | "COURSE_MISMATCH"
        | "INACTIVE_CURRICULUM_VERSION"
        | "INACTIVE_ASSESSMENT_TEMPLATE"
        | "BINDING_CONFLICT";
    };

export type BindCourseOfferingSyllabusResult =
  | { outcome: "BOUND" | "ALREADY_BOUND"; offering: unknown }
  | {
      outcome:
        | "OFFERING_NOT_FOUND"
        | "OFFERING_CURRICULUM_NOT_BOUND"
        | "SYLLABUS_VERSION_NOT_FOUND"
        | "SYLLABUS_CURRICULUM_MISMATCH"
        | "INELIGIBLE_SYLLABUS_VERSION"
        | "MALFORMED_SYLLABUS_VERSION"
        | "DEPENDENCY_SCOPE_MISMATCH"
        | "BINDING_CONFLICT";
    };

export type BindCourseOfferingStudentBatchResult =
  | { outcome: "BOUND" | "ALREADY_BOUND"; offering: unknown }
  | {
      outcome:
        | "OFFERING_NOT_FOUND"
        | "OFFERING_CURRICULUM_NOT_BOUND"
        | "STUDENT_BATCH_NOT_FOUND"
        | "DEPENDENCY_SCOPE_MISMATCH"
        | "PROGRAMME_MISMATCH"
        | "BINDING_CONFLICT";
    };

export type CurriculumVersionLifecycleAction =
  | "APPROVE"
  | "ACTIVATE"
  | "RETIRE"
  | "ARCHIVE";

export interface CurriculumVersionLifecycleView {
  id: string;
  departmentId: string;
  academicProgramId: string;
  code: string;
  name: string;
  status: AcademicVersionStatus;
  effectiveAcademicSessionCode: string;
  approvedAt: Date | null;
  archivedAt: Date | null;
  updatedAt: Date;
}

export interface TransitionCurriculumVersionInput {
  departmentId: string;
  curriculumVersionId: string;
  action: CurriculumVersionLifecycleAction;
  reason: string;
  approvalReference?: string;
  actorUserId: string;
  transitionAt: Date;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export type TransitionCurriculumVersionResult =
  | {
      outcome: "TRANSITIONED" | "ALREADY_TARGET";
      curriculumVersion: CurriculumVersionLifecycleView;
    }
  | {
      outcome:
        | "CURRICULUM_VERSION_NOT_FOUND"
        | "DEPENDENCY_SCOPE_MISMATCH"
        | "INVALID_TRANSITION";
    };

export type SyllabusVersionLifecycleAction =
  | "APPROVE"
  | "ACTIVATE"
  | "RETIRE"
  | "ARCHIVE";

export interface SyllabusVersionLifecycleView {
  id: string;
  code: string;
  versionNumber: number;
  status: AcademicVersionStatus;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  approvedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  curriculumCourse: unknown;
}

export interface TransitionSyllabusVersionInput {
  departmentId: string;
  syllabusVersionId: string;
  action: SyllabusVersionLifecycleAction;
  reason: string;
  actorUserId: string;
  transitionAt: Date;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export type TransitionSyllabusVersionResult =
  | {
      outcome: "TRANSITIONED" | "ALREADY_TARGET";
      syllabusVersion: SyllabusVersionLifecycleView;
    }
  | {
      outcome:
        | "SYLLABUS_VERSION_NOT_FOUND"
        | "DEPENDENCY_SCOPE_MISMATCH"
        | "INVALID_TRANSITION";
    };

export interface CreateStudentCurriculumAssignmentInput {
  departmentId: string;
  studentUserId: string;
  academicProgramId: string;
  curriculumVersionId: string;
  actorUserId: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export type CreateStudentCurriculumAssignmentResult =
  | { outcome: "CREATED" | "ALREADY_ASSIGNED"; assignment: unknown }
  | {
      outcome:
        | "STUDENT_NOT_FOUND"
        | "ACADEMIC_PROGRAM_NOT_FOUND"
        | "CURRICULUM_VERSION_NOT_FOUND"
        | "INACTIVE_CURRICULUM_VERSION"
        | "DEPENDENCY_SCOPE_MISMATCH"
        | "ASSIGNMENT_CONFLICT";
    };

export interface CreateEnrollmentInput {
  departmentId: string;
  academicTermId: string;
  courseOfferingId: string;
  studentUserId: string;
  approvedByUserId?: string;
  sourceType?: EnrollmentSourceType;
  status?: EnrollmentStatus;
  eligibilityStatus?: EligibilityStatus;
  eligibilitySnapshotJson?:
    | Prisma.InputJsonValue
    | Prisma.NullableJsonNullValueInput;
}

export type CreateEnrollmentResult =
  | { outcome: "CREATED"; enrollment: unknown }
  | {
      outcome:
        | "OFFERING_NOT_FOUND"
        | "OFFERING_CURRICULUM_NOT_BOUND"
        | "TERM_MISMATCH"
        | "STUDENT_NOT_FOUND"
        | "STUDENT_CURRICULUM_ASSIGNMENT_NOT_FOUND"
        | "CURRICULUM_DEPENDENCY_MISMATCH"
        | "STUDENT_CURRICULUM_VERSION_MISMATCH"
        | "DUPLICATE_ENROLLMENT";
    };

export interface UpdateEnrollmentInput {
  approvedByUserId?: string;
  sourceType?: EnrollmentSourceType;
  status?: EnrollmentStatus;
  eligibilityStatus?: EligibilityStatus;
  eligibilitySnapshotJson?:
    | Prisma.InputJsonValue
    | Prisma.NullableJsonNullValueInput;
  enrolledAt?: Date | null;
  droppedAt?: Date | null;
}

export interface AcademicRepositoryPort {
  findPrograms(filters: ProgramListFilters): Promise<unknown[]>;
  findProgramById(departmentId: string, id: string): Promise<unknown | null>;
  createProgram(input: CreateProgramInput): Promise<unknown>;
  updateProgram(
    departmentId: string,
    id: string,
    input: UpdateProgramInput,
  ): Promise<unknown | null>;
  findAcademicYears(filters: AcademicYearListFilters): Promise<unknown[]>;
  findAcademicYearById(
    departmentId: string,
    id: string,
  ): Promise<unknown | null>;
  createAcademicYear(input: CreateAcademicYearInput): Promise<unknown>;
  updateAcademicYear(
    departmentId: string,
    id: string,
    input: UpdateAcademicYearInput,
  ): Promise<unknown | null>;
  findAcademicTerms(filters: AcademicTermListFilters): Promise<unknown[]>;
  findAcademicTermById(
    departmentId: string,
    id: string,
  ): Promise<unknown | null>;
  createAcademicTerm(input: CreateAcademicTermInput): Promise<unknown>;
  updateAcademicTerm(
    departmentId: string,
    id: string,
    input: UpdateAcademicTermInput,
  ): Promise<unknown | null>;
  findCourses(filters: CourseListFilters): Promise<unknown[]>;
  findCourseById(departmentId: string, id: string): Promise<unknown | null>;
  createCourse(input: CreateCourseInput): Promise<unknown>;
  updateCourse(
    departmentId: string,
    id: string,
    input: UpdateCourseInput,
  ): Promise<unknown | null>;
  findCourseOfferings(filters: CourseOfferingListFilters): Promise<unknown[]>;
  findStudentVisibleCourseOfferings(
    filters: StudentCourseOfferingListFilters,
  ): Promise<unknown[]>;
  findCourseOfferingById(
    departmentId: string,
    id: string,
  ): Promise<unknown | null>;
  findCourseOfferingByIdForTeacher(
    departmentId: string,
    id: string,
    teacherUserId: string,
  ): Promise<unknown | null>;
  findBoundSyllabusVersionForCourseOffering(
    departmentId: string,
    courseOfferingId: string,
  ): Promise<unknown | null>;
  findBoundSyllabusVersionForCourseOfferingForTeacher(
    departmentId: string,
    courseOfferingId: string,
    teacherUserId: string,
  ): Promise<unknown | null>;
  findApprovedLearningOutcomesForCourseOffering(
    departmentId: string,
    courseOfferingId: string,
  ): Promise<CourseOfferingLearningOutcomesView | null>;
  findApprovedLearningOutcomesForCourseOfferingForTeacher(
    departmentId: string,
    courseOfferingId: string,
    teacherUserId: string,
  ): Promise<CourseOfferingLearningOutcomesView | null>;
  findCourseOutlineVersions(
    departmentId: string,
    courseOfferingId: string,
  ): Promise<CourseOutlineVersionView[] | null>;
  findCourseOutlineVersionsForTeacher(
    departmentId: string,
    courseOfferingId: string,
    actorUserId: string,
  ): Promise<CourseOutlineVersionView[] | null>;
  findCourseOutlineVersionById(
    departmentId: string,
    courseOfferingId: string,
    courseOutlineVersionId: string,
  ): Promise<CourseOutlineVersionView | null>;
  findCourseOutlineVersionByIdForTeacher(
    departmentId: string,
    courseOfferingId: string,
    courseOutlineVersionId: string,
    actorUserId: string,
  ): Promise<CourseOutlineVersionView | null>;
  createCourseOutlineVersion(
    input: CreateCourseOutlineVersionInput,
  ): Promise<CreateCourseOutlineVersionResult>;
  updateCourseOutlineVersion(
    input: UpdateCourseOutlineVersionInput,
  ): Promise<UpdateCourseOutlineVersionResult>;
  submitCourseOutlineVersion(
    input: SubmitCourseOutlineVersionInput,
  ): Promise<SubmitCourseOutlineVersionResult>;
  createCourseOffering(input: CreateCourseOfferingInput): Promise<unknown>;
  updateCourseOffering(
    departmentId: string,
    id: string,
    input: UpdateCourseOfferingInput,
  ): Promise<unknown | null>;
  bindCourseOfferingCurriculum(
    input: BindCourseOfferingCurriculumInput,
  ): Promise<BindCourseOfferingCurriculumResult>;
  bindCourseOfferingSyllabus(
    input: BindCourseOfferingSyllabusInput,
  ): Promise<BindCourseOfferingSyllabusResult>;
  bindCourseOfferingStudentBatch(
    input: BindCourseOfferingStudentBatchInput,
  ): Promise<BindCourseOfferingStudentBatchResult>;
  findSyllabusVersions(filters: SyllabusVersionListFilters): Promise<unknown[]>;
  findSyllabusVersionById(
    departmentId: string,
    id: string,
  ): Promise<unknown | null>;
  createSyllabusVersion(
    input: CreateSyllabusVersionInput,
  ): Promise<CreateSyllabusVersionResult>;
  transitionCurriculumVersion(
    input: TransitionCurriculumVersionInput,
  ): Promise<TransitionCurriculumVersionResult>;
  transitionSyllabusVersion(
    input: TransitionSyllabusVersionInput,
  ): Promise<TransitionSyllabusVersionResult>;
  createStudentCurriculumAssignment(
    input: CreateStudentCurriculumAssignmentInput,
  ): Promise<CreateStudentCurriculumAssignmentResult>;
  findTeacherAssignments(
    filters: TeacherAssignmentListFilters,
  ): Promise<unknown[]>;
  createOrReactivateTeacherAssignment(
    input: CreateTeacherAssignmentInput,
  ): Promise<unknown | null>;
  findTeacherAssignmentById(
    departmentId: string,
    id: string,
  ): Promise<unknown | null>;
  unassignTeacherAssignment(
    departmentId: string,
    id: string,
    unassignedAt: Date,
  ): Promise<unknown | null>;
  findEnrollments(filters: EnrollmentListFilters): Promise<unknown[]>;
  findEnrollmentById(departmentId: string, id: string): Promise<unknown | null>;
  findEnrollmentByIdForStudent(
    departmentId: string,
    id: string,
    studentUserId: string,
  ): Promise<unknown | null>;
  createEnrollment(
    input: CreateEnrollmentInput,
  ): Promise<CreateEnrollmentResult>;
  updateEnrollment(
    departmentId: string,
    id: string,
    input: UpdateEnrollmentInput,
  ): Promise<unknown | null>;
}
