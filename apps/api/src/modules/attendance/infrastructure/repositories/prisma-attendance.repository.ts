import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { AttendanceImportBatchStatus, Prisma } from "@prisma/client";

import { RequestContextService } from "@/common/request-context/request-context.service";
import { assertCurrentAttendanceStatus } from "../../domain/attendance-mark.rule";
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
  constructor(private readonly prisma: PrismaService, private readonly context: RequestContextService) {}

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

  async saveAttendanceRecord(record: SaveAttendanceRecordInput) {
    try { assertCurrentAttendanceStatus(record.status); } catch { throw new BadRequestException("Current attendance must be PRESENT or ABSENT"); }
    return this.prisma.$transaction(async (tx) => {
      await this.lockCaptureSession(tx, record.departmentId, record.classSessionId);
      const assignment = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT a.id FROM teacher_course_assignments a
        JOIN class_sessions s ON s.course_offering_id = a.course_offering_id AND s.department_id = a.department_id
        JOIN users u ON u.id = a.teacher_user_id AND u.department_id = a.department_id
        WHERE s.id = ${record.classSessionId} AND a.department_id = ${record.departmentId}
        AND a.teacher_user_id = ${record.markedByUserId ?? ""} AND a.status = 'ACTIVE'
        AND a.assigned_at <= clock_timestamp() AND a.unassigned_at IS NULL AND a.archived_at IS NULL
        AND u.status = 'ACTIVE' AND u.deleted_at IS NULL AND u.archived_at IS NULL FOR SHARE OF a, u
      `);
      if (!assignment.length) throw new ForbiddenException("Teacher is not assigned to this course offering");
      const enrollment = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT e.id FROM enrollments e JOIN class_sessions s
          ON s.course_offering_id = e.course_offering_id AND s.department_id = e.department_id
        WHERE e.id = ${record.enrollmentId} AND e.department_id = ${record.departmentId}
          AND e.student_user_id = ${record.studentUserId} AND s.id = ${record.classSessionId}
          AND e.status = 'APPROVED' AND e.archived_at IS NULL AND e.dropped_at IS NULL FOR SHARE OF e
      `);
      if (!enrollment.length) throw new BadRequestException("Attendance enrollment identity does not match session");
      const previous = await tx.attendanceRecord.findUnique({ where: { classSessionId_enrollmentId: {
        classSessionId: record.classSessionId, enrollmentId: record.enrollmentId } } });
      if (previous && !["PRESENT", "ABSENT"].includes(previous.status)) throw new ConflictException("Historical attendance requires Coordinator reconciliation");
      const conflict = previous && (previous.resolutionStatus !== "RESOLVED" ||
        (previous.status !== record.status && (previous.sourceType !== record.sourceType || previous.markedByUserId !== record.markedByUserId)));
      const data = { ...record, markedAt: new Date(),
        resolutionStatus: conflict ? "CONFLICT" : "RESOLVED",
        ...(conflict ? { conflictEvidenceJson: { previous: { id: previous.id, status: previous.status,
          sourceType: previous.sourceType, markedByUserId: previous.markedByUserId, markedAt: previous.markedAt.toISOString(),
          earlierConflict: previous.conflictEvidenceJson }, incoming: { status: record.status, sourceType: record.sourceType,
          markedByUserId: record.markedByUserId ?? null } } as Prisma.InputJsonValue } : {}) };
      const saved = await tx.attendanceRecord.upsert({ where: { classSessionId_enrollmentId: {
        classSessionId: record.classSessionId, enrollmentId: record.enrollmentId } }, create: data, update: data, include: attendanceRecordInclude });
      await this.captureAudit(tx, record.departmentId, record.markedByUserId!, "attendance.record.captured", saved.id,
        { classSessionId: record.classSessionId, enrollmentId: record.enrollmentId, resolutionStatus: saved.resolutionStatus });
      return saved;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  overrideAttendanceRecord(departmentId: string, id: string, input: OverrideAttendanceRecordInput) {
    try { assertCurrentAttendanceStatus(input.status); } catch { throw new BadRequestException("Current attendance must be PRESENT or ABSENT"); }
    if (!input.overrideReason.trim()) throw new BadRequestException("Override reason is required");
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.attendanceRecord.findFirst({ where: { id, departmentId, archivedAt: null } });
      if (!previous) return null;
      await this.lockCaptureSession(tx, departmentId, previous.classSessionId);
      if (!["PRESENT", "ABSENT"].includes(previous.status)) throw new ConflictException("Historical attendance requires Coordinator reconciliation");
      const saved = await tx.attendanceRecord.update({ where: { id }, data: { ...input, resolutionStatus: "PENDING_REVIEW",
        conflictEvidenceJson: { previous: { status: previous.status, sourceType: previous.sourceType,
          markedAt: previous.markedAt.toISOString(), earlierConflict: previous.conflictEvidenceJson } } as Prisma.InputJsonValue }, include: attendanceRecordInclude });
      await this.captureAudit(tx, departmentId, input.overrideByUserId, "attendance.record.overridden", id,
        { previousStatus: previous.status, status: input.status, overrideReason: input.overrideReason });
      return saved;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async lockCaptureSession(tx: Prisma.TransactionClient, departmentId: string, sessionId: string) {
    // Same offering mutex as Attendance /5 and the source-change database triggers.
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT o.id FROM course_offerings o JOIN class_sessions s ON s.course_offering_id = o.id AND s.department_id = o.department_id
      WHERE s.id = ${sessionId} AND o.department_id = ${departmentId} AND o.archived_at IS NULL FOR UPDATE OF o
    `);
    if (!rows.length) throw new BadRequestException("Class session not found");
    const session = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM class_sessions WHERE id = ${sessionId} AND department_id = ${departmentId}
      AND status = 'ACTIVE' AND archived_at IS NULL AND canceled_at IS NULL FOR UPDATE
    `);
    if (!session.length) throw new ConflictException("Attendance capture/override requires an ACTIVE session; use Coordinator correction after completion");
  }

  private async captureAudit(tx: Prisma.TransactionClient, departmentId: string, actorUserId: string, action: string, targetId: string, metadata: Prisma.InputJsonObject) {
    const request = this.context.get();
    await tx.auditLog.create({ data: { departmentId, actorUserId, actorType: "USER", action, targetId,
      targetType: "attendance_record", outcome: "SUCCESS", requestId: request?.requestId,
      ipAddress: request?.audit.ipAddress, userAgent: request?.audit.userAgent, contextJson: metadata } });
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
