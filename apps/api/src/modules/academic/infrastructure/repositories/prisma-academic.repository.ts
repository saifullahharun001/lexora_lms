import { Injectable } from "@nestjs/common";

import { PrismaService } from "@/common/prisma/prisma.service";
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
} from "../../application/ports/academic.repository.port";

@Injectable()
export class PrismaAcademicRepository implements AcademicRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  findPrograms(filters: ProgramListFilters) {
    return this.prisma.academicProgram.findMany({
      where: {
        departmentId: filters.departmentId,
        archivedAt: null,
        status: filters.status,
        OR: filters.search
          ? [
              {
                code: {
                  contains: filters.search
                }
              },
              {
                name: {
                  contains: filters.search
                }
              }
            ]
          : undefined
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  findProgramById(departmentId: string, id: string) {
    return this.prisma.academicProgram.findFirst({
      where: {
        id,
        departmentId,
        archivedAt: null
      }
    });
  }

  createProgram(input: CreateProgramInput) {
    return this.prisma.academicProgram.create({
      data: {
        departmentId: input.departmentId,
        code: input.code,
        name: input.name,
        description: input.description,
        status: input.status
      }
    });
  }

  updateProgram(departmentId: string, id: string, input: UpdateProgramInput) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.academicProgram.updateMany({
        where: {
          id,
          departmentId,
          archivedAt: null
        },
        data: input
      });

      if (result.count === 0) {
        return null;
      }

      return tx.academicProgram.findFirst({
        where: {
          id,
          departmentId,
          archivedAt: null
        }
      });
    });
  }

  findCourses(filters: CourseListFilters) {
    return this.prisma.course.findMany({
      where: {
        departmentId: filters.departmentId,
        archivedAt: null,
        academicProgramId: filters.academicProgramId,
        status: filters.status,
        OR: filters.search
          ? [
              {
                code: {
                  contains: filters.search
                }
              },
              {
                title: {
                  contains: filters.search
                }
              }
            ]
          : undefined
      },
      include: {
        academicProgram: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  findCourseById(departmentId: string, id: string) {
    return this.prisma.course.findFirst({
      where: {
        id,
        departmentId,
        archivedAt: null
      },
      include: {
        academicProgram: true
      }
    });
  }

  createCourse(input: CreateCourseInput) {
    return this.prisma.course.create({
      data: {
        departmentId: input.departmentId,
        academicProgramId: input.academicProgramId,
        code: input.code,
        title: input.title,
        description: input.description,
        creditHours: input.creditHours,
        lectureHours: input.lectureHours,
        labHours: input.labHours,
        status: input.status
      },
      include: {
        academicProgram: true
      }
    });
  }

  updateCourse(departmentId: string, id: string, input: UpdateCourseInput) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.course.updateMany({
        where: {
          id,
          departmentId,
          archivedAt: null
        },
        data: input
      });

      if (result.count === 0) {
        return null;
      }

      return tx.course.findFirst({
        where: {
          id,
          departmentId,
          archivedAt: null
        },
        include: {
          academicProgram: true
        }
      });
    });
  }

  findCourseOfferings(filters: CourseOfferingListFilters) {
    return this.prisma.courseOffering.findMany({
      where: {
        departmentId: filters.departmentId,
        archivedAt: null,
        academicTermId: filters.academicTermId,
        courseId: filters.courseId,
        status: filters.status
      },
      include: {
        course: true,
        academicTerm: true
      },
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
      include: {
        course: true,
        academicTerm: true
      }
    });
  }

  createCourseOffering(input: CreateCourseOfferingInput) {
    return this.prisma.courseOffering.create({
      data: {
        departmentId: input.departmentId,
        courseId: input.courseId,
        academicTermId: input.academicTermId,
        sectionCode: input.sectionCode,
        capacity: input.capacity,
        status: input.status,
        visibilityStartAt: input.visibilityStartAt,
        visibilityEndAt: input.visibilityEndAt
      },
      include: {
        course: true,
        academicTerm: true
      }
    });
  }

  updateCourseOffering(
    departmentId: string,
    id: string,
    input: UpdateCourseOfferingInput
  ) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.courseOffering.updateMany({
        where: {
          id,
          departmentId,
          archivedAt: null
        },
        data: input
      });

      if (result.count === 0) {
        return null;
      }

      return tx.courseOffering.findFirst({
        where: {
          id,
          departmentId,
          archivedAt: null
        },
        include: {
          course: true,
          academicTerm: true
        }
      });
    });
  }

  findEnrollments(filters: EnrollmentListFilters) {
    return this.prisma.enrollment.findMany({
      where: {
        departmentId: filters.departmentId,
        archivedAt: null,
        academicTermId: filters.academicTermId,
        courseOfferingId: filters.courseOfferingId,
        studentUserId: filters.studentUserId,
        status: filters.status,
        eligibilityStatus: filters.eligibilityStatus
      },
      include: {
        academicTerm: true,
        courseOffering: {
          include: {
            course: true
          }
        },
        studentUser: {
          select: {
            id: true,
            displayName: true,
            email: true
          }
        },
        approvedByUser: {
          select: {
            id: true,
            displayName: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  findEnrollmentById(departmentId: string, id: string) {
    return this.prisma.enrollment.findFirst({
      where: {
        id,
        departmentId,
        archivedAt: null
      },
      include: {
        academicTerm: true,
        courseOffering: {
          include: {
            course: true
          }
        },
        studentUser: {
          select: {
            id: true,
            displayName: true,
            email: true
          }
        },
        approvedByUser: {
          select: {
            id: true,
            displayName: true,
            email: true
          }
        }
      }
    });
  }

  createEnrollment(input: CreateEnrollmentInput) {
    return this.prisma.enrollment.create({
      data: {
        departmentId: input.departmentId,
        academicTermId: input.academicTermId,
        courseOfferingId: input.courseOfferingId,
        studentUserId: input.studentUserId,
        approvedByUserId: input.approvedByUserId,
        sourceType: input.sourceType,
        status: input.status,
        eligibilityStatus: input.eligibilityStatus,
        eligibilitySnapshotJson: input.eligibilitySnapshotJson,
        enrolledAt: input.status === "APPROVED" ? new Date() : null
      },
      include: {
        academicTerm: true,
        courseOffering: {
          include: {
            course: true
          }
        },
        studentUser: {
          select: {
            id: true,
            displayName: true,
            email: true
          }
        },
        approvedByUser: {
          select: {
            id: true,
            displayName: true,
            email: true
          }
        }
      }
    });
  }

  updateEnrollment(departmentId: string, id: string, input: UpdateEnrollmentInput) {
  return this.prisma.$transaction(async (tx) => {
    const { approvedByUserId, ...rest } = input;

    const result = await tx.enrollment.updateMany({
      where: {
        id,
        departmentId,
        archivedAt: null
      },
      data: {
        ...rest,
        approvedByUserId
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
      include: {
        academicTerm: true,
        courseOffering: {
          include: {
            course: true
          }
        },
        studentUser: {
          select: {
            id: true,
            displayName: true,
            email: true
          }
        },
        approvedByUser: {
          select: {
            id: true,
            displayName: true,
            email: true
          }
        }
      }
    });
  });
}
}