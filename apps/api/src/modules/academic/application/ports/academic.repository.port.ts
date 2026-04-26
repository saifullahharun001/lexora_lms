import type {
  AcademicProgramStatus,
  CourseOfferingStatus,
  CourseStatus,
  EligibilityStatus,
  EnrollmentSourceType,
  EnrollmentStatus,
  Prisma
} from "@prisma/client";

export interface ProgramListFilters {
  departmentId: string;
  status?: AcademicProgramStatus;
  search?: string;
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
  eligibilitySnapshotJson?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
}

export interface UpdateEnrollmentInput {
  approvedByUserId?: string;
  sourceType?: EnrollmentSourceType;
  status?: EnrollmentStatus;
  eligibilityStatus?: EligibilityStatus;
  eligibilitySnapshotJson?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  enrolledAt?: Date | null;
  droppedAt?: Date | null;
}

export interface AcademicRepositoryPort {
  findPrograms(filters: ProgramListFilters): Promise<unknown[]>;
  findProgramById(departmentId: string, id: string): Promise<unknown | null>;
  createProgram(input: CreateProgramInput): Promise<unknown>;
  updateProgram(departmentId: string, id: string, input: UpdateProgramInput): Promise<unknown | null>;
  findCourses(filters: CourseListFilters): Promise<unknown[]>;
  findCourseById(departmentId: string, id: string): Promise<unknown | null>;
  createCourse(input: CreateCourseInput): Promise<unknown>;
  updateCourse(departmentId: string, id: string, input: UpdateCourseInput): Promise<unknown | null>;
  findCourseOfferings(filters: CourseOfferingListFilters): Promise<unknown[]>;
  findCourseOfferingById(departmentId: string, id: string): Promise<unknown | null>;
  createCourseOffering(input: CreateCourseOfferingInput): Promise<unknown>;
  updateCourseOffering(
    departmentId: string,
    id: string,
    input: UpdateCourseOfferingInput
  ): Promise<unknown | null>;
  findEnrollments(filters: EnrollmentListFilters): Promise<unknown[]>;
  findEnrollmentById(departmentId: string, id: string): Promise<unknown | null>;
  createEnrollment(input: CreateEnrollmentInput): Promise<unknown>;
  updateEnrollment(
    departmentId: string,
    id: string,
    input: UpdateEnrollmentInput
  ): Promise<unknown | null>;
}
