import type { EligibilityStatus, EnrollmentStatus, Prisma } from "@prisma/client";

export interface EligibilityEnrollmentListFilters {
  departmentId: string;
  courseOfferingId?: string;
  academicTermId?: string;
  studentUserId?: string;
  statuses?: EnrollmentStatus[];
}

export interface UpdateEnrollmentEligibilityInput {
  eligibilityStatus: EligibilityStatus;
  eligibilitySnapshotJson: Prisma.InputJsonValue;
}

export interface EligibilityRepositoryPort {
  findEnrollmentById(departmentId: string, id: string): Promise<unknown | null>;
  findEnrollmentByIdForStudent(
    departmentId: string,
    id: string,
    studentUserId: string
  ): Promise<unknown | null>;
  findEnrollmentByIdForTeacher(
    departmentId: string,
    id: string,
    teacherUserId: string
  ): Promise<unknown | null>;
  findEnrollments(filters: EligibilityEnrollmentListFilters): Promise<unknown[]>;
  findCourseOfferingById(departmentId: string, id: string): Promise<unknown | null>;
  listAttendanceRecordsForEnrollment(
    departmentId: string,
    enrollmentId: string,
    courseOfferingId: string
  ): Promise<unknown[]>;
  updateEnrollmentEligibility(
    departmentId: string,
    id: string,
    input: UpdateEnrollmentEligibilityInput
  ): Promise<unknown | null>;
}

