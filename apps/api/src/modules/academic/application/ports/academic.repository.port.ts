import type {
  AcademicProgramStatus,
  AcademicTermStatus,
  AcademicYearStatus,
  CourseOfferingStatus,
  CourseStatus,
  EligibilityStatus,
  EnrollmentSourceType,
  EnrollmentStatus,
  Prisma,
  TeacherAssignmentStatus,
} from "@prisma/client";

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

export interface TeacherAssignmentListFilters {
  departmentId: string;
  courseOfferingId: string;
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
  findCourseOfferingById(
    departmentId: string,
    id: string,
  ): Promise<unknown | null>;
  findCourseOfferingByIdForTeacher(
    departmentId: string,
    id: string,
    teacherUserId: string,
  ): Promise<unknown | null>;
  createCourseOffering(input: CreateCourseOfferingInput): Promise<unknown>;
  updateCourseOffering(
    departmentId: string,
    id: string,
    input: UpdateCourseOfferingInput,
  ): Promise<unknown | null>;
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
  createEnrollment(input: CreateEnrollmentInput): Promise<unknown>;
  updateEnrollment(
    departmentId: string,
    id: string,
    input: UpdateEnrollmentInput,
  ): Promise<unknown | null>;
}
