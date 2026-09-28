import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { ClassSessionStatus, Prisma } from "@prisma/client";

import { CLASS_SESSION_AUDIT_EVENTS } from "../../domain/class-session.audit-events";
import type { ClassSessionRecord } from "../../contracts/class-session.contracts";
import { PrismaService } from "@/common/prisma/prisma.service";
import type {
  ClassSessionListFilters,
  ClassSessionRepositoryPort,
  CreateClassSessionInput,
  ClassSessionMutation,
  DueSessionCursor
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
  private readonly logger = new Logger(PrismaClassSessionRepository.name);

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
                    archivedAt: null,
                    assignedAt: { lte: new Date() },
                    teacherUser: { status: "ACTIVE", archivedAt: null, deletedAt: null }
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
                    archivedAt: null,
                    assignedAt: { lte: new Date() },
                    teacherUser: { status: "ACTIVE", archivedAt: null, deletedAt: null }
                  }
                }
              }
            }
          : {})
      },
      include: classSessionInclude
    });
  }

  // Lock ordering matches the historical Attendance source trigger: offering, then session.
  private async lockSession(tx: Prisma.TransactionClient, departmentId: string, id: string, skipLocked = false) {
    const skip = skipLocked ? Prisma.sql`SKIP LOCKED` : Prisma.empty;
    const offering = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT o.id FROM course_offerings o JOIN class_sessions s
        ON s.course_offering_id = o.id AND s.department_id = o.department_id
      WHERE s.id = ${id} AND s.department_id = ${departmentId} FOR UPDATE OF o ${skip}
    `);
    if (!offering.length) return false;
    const session = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM class_sessions WHERE id = ${id} AND department_id = ${departmentId}
      FOR UPDATE ${skip}
    `);
    return session.length > 0;
  }

  private async databaseNow(tx: Prisma.TransactionClient) {
    const [row] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    return row!.now;
  }

  async mutate(departmentId: string, id: string, assignedTeacherUserId: string | undefined,
    build: (current: ClassSessionRecord, now: Date) => Promise<ClassSessionMutation>) {
    return this.prisma.$transaction(async (tx) => {
      if (!await this.lockSession(tx, departmentId, id)) return null;
      const current = await tx.classSession.findFirst({ where: { id, departmentId }, include: classSessionInclude });
      if (!current) return null;
      // Recheck live object authority inside the mutation transaction; never cache assignments.
      if (assignedTeacherUserId) {
        const assignments = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT a.id FROM teacher_course_assignments a JOIN users u
            ON u.id = a.teacher_user_id AND u.department_id = a.department_id
          WHERE a.course_offering_id = ${current.courseOfferingId} AND a.department_id = ${departmentId}
            AND a.teacher_user_id = ${assignedTeacherUserId} AND a.status = 'ACTIVE'
            AND a.assigned_at <= clock_timestamp() AND a.unassigned_at IS NULL AND a.archived_at IS NULL
            AND u.status = 'ACTIVE' AND u.archived_at IS NULL AND u.deleted_at IS NULL FOR SHARE OF a, u
        `);
        if (!assignments.length) return null;
      }
      const mutation = await build(current, await this.databaseNow(tx));
      const result = await tx.classSession.updateMany({ where: { id, departmentId, status: current.status }, data: mutation.data });
      if (result.count !== 1) throw new ConflictException("Class session changed concurrently");
      await tx.auditLog.create({ data: mutation.audit });
      return tx.classSession.findFirst({ where: { id, departmentId }, include: classSessionInclude });
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2004" || (error.code === "P2010" && error.meta?.code === "23514"))) {
        throw new ConflictException("Class session lifecycle conflicts with scheduled-end or protected Attendance evidence");
      }
      throw error;
    });
  }

  async reconcileDue(cursor?: DueSessionCursor) {
    // Keyset pagination bounds each sweep and lets later rows progress past diagnostic conflicts.
    // The cursor is only a scan optimisation: all eligibility and mutation decisions are DB-backed.
    const candidates = await this.prisma.$queryRaw<Array<{ id: string; departmentId: string; scheduledEndAt: Date }>>(Prisma.sql`
      SELECT id, department_id AS "departmentId", scheduled_end_at AS "scheduledEndAt"
      FROM class_sessions WHERE status IN ('SCHEDULED', 'ACTIVE') AND scheduled_end_at <= (statement_timestamp() AT TIME ZONE 'UTC')
      ${cursor ? Prisma.sql`AND (scheduled_end_at, id) > (${cursor.scheduledEndAt}, ${cursor.id})` : Prisma.empty}
      ORDER BY scheduled_end_at, id LIMIT 100
    `);
    let processed = 0, conflicts = 0;
    for (const candidate of candidates) {
      try {
        const changed = await this.prisma.$transaction(async (tx) => {
          if (!await this.lockSession(tx, candidate.departmentId, candidate.id, true)) return false;
          const current = await tx.classSession.findFirst({ where: { id: candidate.id, departmentId: candidate.departmentId } });
          const now = await this.databaseNow(tx);
          if (!current || current.scheduledEndAt > now || !["SCHEDULED", "ACTIVE"].includes(current.status)) return false;
          if (current.canceledAt || current.actualEndAt || current.nonConductedAt ||
            (current.status === "SCHEDULED" ? current.actualStartAt !== null :
              !current.actualStartAt || current.actualStartAt >= current.scheduledEndAt)) {
            throw new ConflictException("Invalid class session start/end evidence");
          }
          const active = current.status === "ACTIVE";
          if (!active) {
            // Includes archived raw records and immutable history. Do not erase contradictions
            // by assigning a non-counting outcome. The offering mutex serializes evidence writers.
            const [evidence] = await tx.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
              SELECT EXISTS (
                SELECT 1 FROM attendance_records WHERE class_session_id = ${current.id}
                UNION ALL SELECT 1 FROM formative_attendance_source_items WHERE class_session_id = ${current.id}
                UNION ALL SELECT 1 FROM formative_attendance_corrections WHERE class_session_id = ${current.id}
              ) AS "exists"
            `);
            if (!evidence || evidence.exists) throw new ConflictException("Never-started class session has contradictory Attendance evidence");
          }
          const status = active ? ClassSessionStatus.COMPLETED : ClassSessionStatus.NOT_CONDUCTED;
          const result = await tx.classSession.updateMany({
            where: { id: current.id, departmentId: current.departmentId, status: current.status, scheduledEndAt: current.scheduledEndAt },
            data: { status, ...(active ? { actualEndAt: current.scheduledEndAt } : { nonConductedAt: current.scheduledEndAt }) }
          });
          if (result.count !== 1) return false;
          await tx.auditLog.create({ data: { actorType: "SERVICE", departmentId: current.departmentId,
            action: active ? CLASS_SESSION_AUDIT_EVENTS.RECORD_COMPLETED : CLASS_SESSION_AUDIT_EVENTS.RECORD_NOT_CONDUCTED,
            targetType: "class_session", targetId: current.id, outcome: "SUCCESS",
            contextJson: { automatic: true, source: "scheduled-end-reconciliation", previousStatus: current.status,
              status, scheduledEndAt: current.scheduledEndAt.toISOString(), reconciledAt: now.toISOString() }
          } });
          return true;
        });
        if (changed) processed++;
      } catch {
        conflicts++;
        // Do not log raw database errors, connection details or academic payloads.
        this.logger.error(`Scheduled-end reconciliation conflict for class session ${candidate.id}; transaction rolled back`);
      }
    }
    const last = candidates.at(-1);
    return { processed, conflicts, cursor: candidates.length === 100 && last ? { id: last.id, scheduledEndAt: last.scheduledEndAt } : null };
  }
}
