import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "@/common/prisma/prisma.service";
import type {
  EligibilityEnrollmentListFilters,
  EligibilityRepositoryPort,
  UpdateEnrollmentEligibilityInput
} from "../../application/ports/eligibility.repository.port";

const userSummarySelect = {
  id: true,
  displayName: true,
  email: true
} satisfies Prisma.UserSelect;

const enrollmentInclude = {
  academicTerm: true,
  courseOffering: {
    include: {
      course: true,
      academicTerm: true
    }
  },
  studentUser: {
    select: userSummarySelect
  },
  approvedByUser: {
    select: userSummarySelect
  }
} satisfies Prisma.EnrollmentInclude;

@Injectable()
export class PrismaEligibilityRepository implements EligibilityRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  findEnrollmentById(departmentId: string, id: string) {
    return this.prisma.enrollment.findFirst({
      where: {
        id,
        departmentId,
        archivedAt: null
      },
      include: enrollmentInclude
    });
  }

  findEnrollmentByIdForStudent(departmentId: string, id: string, studentUserId: string) {
    return this.prisma.enrollment.findFirst({
      where: {
        id,
        departmentId,
        studentUserId,
        archivedAt: null
      },
      include: enrollmentInclude
    });
  }

  findEnrollmentByIdForTeacher(departmentId: string, id: string, teacherUserId: string) {
    return this.prisma.enrollment.findFirst({
      where: {
        id,
        departmentId,
        archivedAt: null,
        courseOffering: {
          teacherAssignments: {
            some: this.buildAssignedTeacherWhere(departmentId, teacherUserId)
          }
        }
      },
      include: enrollmentInclude
    });
  }

  findEnrollments(filters: EligibilityEnrollmentListFilters) {
    return this.prisma.enrollment.findMany({
      where: {
        departmentId: filters.departmentId,
        archivedAt: null,
        courseOfferingId: filters.courseOfferingId,
        academicTermId: filters.academicTermId,
        studentUserId: filters.studentUserId,
        ...(filters.statuses
          ? {
              status: {
                in: filters.statuses
              }
            }
          : {})
      },
      include: enrollmentInclude,
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  findCourseOfferingById(departmentId: string, id: string) {
    return this.prisma.courseOffering.findFirst({
      where: {
        id,
        departmentId,
        archivedAt: null
      },
      select: {
        id: true
      }
    });
  }

  listAttendanceRecordsForEnrollment(
    departmentId: string,
    enrollmentId: string,
    courseOfferingId: string
  ) {
    return this.prisma.attendanceRecord.findMany({
      where: {
        departmentId,
        enrollmentId,
        archivedAt: null,
        classSession: {
          departmentId,
          courseOfferingId,
          archivedAt: null
        }
      },
      select: {
        id: true,
        status: true,
        classSessionId: true
      }
    });
  }

  updateEnrollmentEligibility(
    departmentId: string,
    id: string,
    input: UpdateEnrollmentEligibilityInput
  ) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.enrollment.updateMany({
        where: {
          id,
          departmentId,
          archivedAt: null
        },
        data: {
          eligibilityStatus: input.eligibilityStatus,
          eligibilitySnapshotJson: input.eligibilitySnapshotJson
        }
      });

      if (result.count === 0) {
        return null;
      }

      return tx.enrollment.findFirst({
        where: {
          id,
          departmentId,
          archivedAt: null
        },
        include: enrollmentInclude
      });
    });
  }

  private buildAssignedTeacherWhere(departmentId: string, teacherUserId: string) {
    return {
      departmentId,
      teacherUserId,
      status: "ACTIVE",
      unassignedAt: null,
      archivedAt: null
    } satisfies Prisma.TeacherCourseAssignmentWhereInput;
  }
}

