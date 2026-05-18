import { Injectable } from "@nestjs/common";
import { ClassSessionStatus, Prisma } from "@prisma/client";

import { PrismaService } from "@/common/prisma/prisma.service";
import type {
  ClassSessionListFilters,
  ClassSessionRepositoryPort,
  CreateClassSessionInput,
  UpdateClassSessionInput
} from "../../application/ports/class-session.repository.port";

const classSessionInclude = {
  courseOffering: {
    include: {
      course: true,
      academicTerm: true
    }
  },
  teacherAssignment: {
    include: {
      teacherUser: {
        select: {
          id: true,
          displayName: true,
          email: true
        }
      }
    }
  }
} satisfies Prisma.ClassSessionInclude;

@Injectable()
export class PrismaClassSessionRepository implements ClassSessionRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateClassSessionInput) {
    return this.prisma.classSession.create({
      data: {
        departmentId: input.departmentId,
        courseOfferingId: input.courseOfferingId,
        teacherAssignmentId: input.teacherAssignmentId,
        sessionCode: input.sessionCode,
        title: input.title,
        scheduledStartAt: input.scheduledStartAt,
        scheduledEndAt: input.scheduledEndAt,
        location: input.location,
        externalSourceRef: input.externalSourceRef,
        status: ClassSessionStatus.SCHEDULED
      },
      include: classSessionInclude
    });
  }

  findMany(filters: ClassSessionListFilters) {
    return this.prisma.classSession.findMany({
      where: {
        departmentId: filters.departmentId,
        courseOfferingId: filters.courseOfferingId,
        teacherAssignmentId: filters.teacherAssignmentId,
        status: filters.status,
        ...(filters.assignedTeacherUserId
          ? {
              courseOffering: {
                teacherAssignments: {
                  some: {
                    departmentId: filters.departmentId,
                    teacherUserId: filters.assignedTeacherUserId,
                    status: "ACTIVE",
                    unassignedAt: null,
                    archivedAt: null
                  }
                }
              }
            }
          : {})
      },
      include: classSessionInclude,
      orderBy: {
        scheduledStartAt: "desc"
      },
      take: filters.limit,
      skip: filters.offset
    });
  }

  findById(departmentId: string, id: string, assignedTeacherUserId?: string) {
    return this.prisma.classSession.findFirst({
      where: {
        id,
        departmentId,
        ...(assignedTeacherUserId
          ? {
              courseOffering: {
                teacherAssignments: {
                  some: {
                    departmentId,
                    teacherUserId: assignedTeacherUserId,
                    status: "ACTIVE",
                    unassignedAt: null,
                    archivedAt: null
                  }
                }
              }
            }
          : {})
      },
      include: classSessionInclude
    });
  }

  update(departmentId: string, id: string, input: UpdateClassSessionInput) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.classSession.updateMany({
        where: {
          id,
          departmentId
        },
        data: input
      });

      if (result.count === 0) {
        return null;
      }

      return tx.classSession.findFirst({
        where: {
          id,
          departmentId
        },
        include: classSessionInclude
      });
    });
  }

  updateLifecycle(
    departmentId: string,
    id: string,
    whereStatus: ClassSessionStatus | ClassSessionStatus[],
    data: Prisma.ClassSessionUpdateManyMutationInput
  ) {
    const allowedStatuses = Array.isArray(whereStatus) ? whereStatus : [whereStatus];

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.classSession.updateMany({
        where: {
          id,
          departmentId,
          status: {
            in: allowedStatuses
          }
        },
        data
      });

      if (result.count === 0) {
        return null;
      }

      return tx.classSession.findFirst({
        where: {
          id,
          departmentId
        },
        include: classSessionInclude
      });
    });
  }
}
