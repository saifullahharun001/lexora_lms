import { Injectable } from "@nestjs/common";
import { AttendanceImportBatchStatus, Prisma } from "@prisma/client";

import { PrismaService } from "@/common/prisma/prisma.service";
import type {
  AttendanceImportBatchListFilters,
  AttendanceRecordListFilters,
  AttendanceRepositoryPort,
  CreateAttendanceImportBatchInput,
  OverrideAttendanceRecordInput,
  SaveAttendanceRecordInput
} from "../../application/ports/attendance.repository.port";

const userSummarySelect = {
  id: true,
  displayName: true,
  email: true
} satisfies Prisma.UserSelect;

const attendanceRecordInclude = {
  classSession: {
    include: {
      courseOffering: {
        include: {
          course: true,
          academicTerm: true
        }
      }
    }
  },
  enrollment: {
    include: {
      courseOffering: {
        include: {
          course: true
        }
      }
    }
  },
  studentUser: {
    select: userSummarySelect
  },
  markedByUser: {
    select: userSummarySelect
  },
  overrideByUser: {
    select: userSummarySelect
  }
} satisfies Prisma.AttendanceRecordInclude;

const attendanceImportBatchInclude = {
  courseOffering: {
    include: {
      course: true,
      academicTerm: true
    }
  },
  classSession: true,
  uploadedByUser: {
    select: userSummarySelect
  },
  reviewedByUser: {
    select: userSummarySelect
  }
} satisfies Prisma.AttendanceImportBatchInclude;

@Injectable()
export class PrismaAttendanceRepository implements AttendanceRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  findAttendanceRecords(filters: AttendanceRecordListFilters) {
    return this.prisma.attendanceRecord.findMany({
      where: {
        departmentId: filters.departmentId,
        archivedAt: null,
        classSessionId: filters.classSessionId,
        enrollmentId: filters.enrollmentId,
        studentUserId: filters.studentUserId,
        status: filters.status,
        sourceType: filters.sourceType,
        classSession: {
          courseOfferingId: filters.courseOfferingId,
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
        }
      },
      include: attendanceRecordInclude,
      orderBy: {
        markedAt: "desc"
      },
      take: filters.limit,
      skip: filters.offset
    });
  }

  findAttendanceRecordById(departmentId: string, id: string, assignedTeacherUserId?: string) {
    return this.prisma.attendanceRecord.findFirst({
      where: {
        id,
        departmentId,
        archivedAt: null,
        ...(assignedTeacherUserId
          ? {
              classSession: {
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
            }
          : {})
      },
      include: attendanceRecordInclude
    });
  }

  saveAttendanceRecord(record: SaveAttendanceRecordInput) {
    const data = {
      departmentId: record.departmentId,
      classSessionId: record.classSessionId,
      enrollmentId: record.enrollmentId,
      studentUserId: record.studentUserId,
      markedByUserId: record.markedByUserId,
      status: record.status,
      sourceType: record.sourceType,
      externalSourceRef: record.externalSourceRef,
      sourcePayloadJson: record.sourcePayloadJson
    };

    return this.prisma.attendanceRecord.upsert({
      where: {
        classSessionId_enrollmentId: {
          classSessionId: record.classSessionId,
          enrollmentId: record.enrollmentId
        }
      },
      create: data,
      update: {
        markedByUserId: record.markedByUserId,
        status: record.status,
        sourceType: record.sourceType,
        externalSourceRef: record.externalSourceRef,
        sourcePayloadJson: record.sourcePayloadJson,
        markedAt: new Date()
      },
      include: attendanceRecordInclude
    });
  }

  overrideAttendanceRecord(
    departmentId: string,
    id: string,
    input: OverrideAttendanceRecordInput
  ) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.attendanceRecord.updateMany({
        where: {
          id,
          departmentId,
          archivedAt: null
        },
        data: {
          status: input.status,
          sourceType: input.sourceType,
          overrideByUserId: input.overrideByUserId,
          overrideReason: input.overrideReason
        }
      });

      if (result.count === 0) {
        return null;
      }

      return tx.attendanceRecord.findFirst({
        where: {
          id,
          departmentId,
          archivedAt: null
        },
        include: attendanceRecordInclude
      });
    });
  }

  findImportBatches(filters: AttendanceImportBatchListFilters) {
    return this.prisma.attendanceImportBatch.findMany({
      where: {
        departmentId: filters.departmentId,
        archivedAt: null,
        courseOfferingId: filters.courseOfferingId,
        classSessionId: filters.classSessionId,
        status: filters.status,
        sourceType: filters.sourceType,
        ...(filters.assignedTeacherUserId
          ? {
              OR: [
                {
                  courseOffering: {
                    teacherAssignments: {
                      some: this.buildAssignedTeacherWhere(
                        filters.departmentId,
                        filters.assignedTeacherUserId
                      )
                    }
                  }
                },
                {
                  classSession: {
                    courseOffering: {
                      teacherAssignments: {
                        some: this.buildAssignedTeacherWhere(
                          filters.departmentId,
                          filters.assignedTeacherUserId
                        )
                      }
                    }
                  }
                }
              ]
            }
          : {})
      },
      include: attendanceImportBatchInclude,
      orderBy: {
        createdAt: "desc"
      },
      take: filters.limit,
      skip: filters.offset
    });
  }

  findImportBatchById(departmentId: string, id: string, assignedTeacherUserId?: string) {
    return this.prisma.attendanceImportBatch.findFirst({
      where: {
        id,
        departmentId,
        archivedAt: null,
        ...(assignedTeacherUserId
          ? {
              OR: [
                {
                  courseOffering: {
                    teacherAssignments: {
                      some: this.buildAssignedTeacherWhere(departmentId, assignedTeacherUserId)
                    }
                  }
                },
                {
                  classSession: {
                    courseOffering: {
                      teacherAssignments: {
                        some: this.buildAssignedTeacherWhere(departmentId, assignedTeacherUserId)
                      }
                    }
                  }
                }
              ]
            }
          : {})
      },
      include: attendanceImportBatchInclude
    });
  }

  saveImportBatch(record: CreateAttendanceImportBatchInput) {
    return this.prisma.attendanceImportBatch.create({
      data: {
        departmentId: record.departmentId,
        courseOfferingId: record.courseOfferingId,
        classSessionId: record.classSessionId,
        uploadedByUserId: record.uploadedByUserId,
        sourceType: record.sourceType,
        status: AttendanceImportBatchStatus.RECEIVED,
        externalSystemName: record.externalSystemName,
        externalBatchRef: record.externalBatchRef,
        importWindowStartAt: record.importWindowStartAt,
        importWindowEndAt: record.importWindowEndAt,
        validationSummaryJson: record.validationSummaryJson
      },
      include: attendanceImportBatchInclude
    });
  }

  cancelImportBatch(departmentId: string, id: string, reviewedByUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.attendanceImportBatch.updateMany({
        where: {
          id,
          departmentId,
          archivedAt: null,
          status: {
            in: [AttendanceImportBatchStatus.RECEIVED, AttendanceImportBatchStatus.VALIDATING]
          }
        },
        data: {
          status: AttendanceImportBatchStatus.CANCELED,
          reviewedByUserId
        }
      });

      if (result.count === 0) {
        return null;
      }

      return tx.attendanceImportBatch.findFirst({
        where: {
          id,
          departmentId,
          archivedAt: null
        },
        include: attendanceImportBatchInclude
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
