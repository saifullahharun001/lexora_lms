import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";
import { ClassSessionEvidenceService } from "@/modules/class-session/class-session-evidence.service";
import { correctionAuthorities } from "../../domain/attendance-correction-authority";
import { fingerprint, isConducted, rawBasis } from "../../domain/formative-attendance.rules";
import { ATTENDANCE_AUDIT_EVENTS } from "../../domain/attendance.audit-events";

interface CorrectionScope {
  departmentId: string; courseOfferingId: string; enrollmentId: string; studentUserId: string;
  studentBatchId: string; academicTermId: string;
}
export interface OrdinaryCorrectionInput {
  classSessionId: string; enrollmentId: string; status: "PRESENT" | "ABSENT"; reason: string;
}

@Injectable()
export class AttendanceCorrectionService {
  constructor(private readonly prisma: PrismaService, private readonly context: RequestContextService,
    private readonly sessions: ClassSessionEvidenceService) {}

  async correct(input: OrdinaryCorrectionInput) {
    if (typeof input.reason !== "string" || !input.reason.trim() || input.reason.trim().length > 2000)
      throw new BadRequestException("A reason of 1–2000 characters is required");
    if (!["PRESENT", "ABSENT"].includes(input.status)) throw new BadRequestException("Correction must be PRESENT or ABSENT");
    const principal = this.context.get()?.principal;
    const authority = principal && correctionAuthorities(principal)[0];
    if (!principal || !authority) throw new ForbiddenException("Attendance correction authority required");
    const reason = input.reason.trim();
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          // Shared database boundary locks/revalidates the full academic identity, exact live
          // grant and assignment, and historical freeze. INSERT repeats it for direct writers.
          const rows = await tx.$queryRaw<Array<{ scope: CorrectionScope }>>(Prisma.sql`
            SELECT attendance_resolve_correction_scope(${principal.activeDepartmentId}, ${principal.actorId},
              ${input.classSessionId}, ${input.enrollmentId}, ${authority.authorityKind},
              ${JSON.stringify(authority)}::jsonb) AS scope
          `);
          const scope = rows[0]?.scope;
          if (!scope) throw new NotFoundException("Attendance scope not found");
          const session = (await this.sessions.read(tx, scope.departmentId, scope.courseOfferingId))
            .find((s) => s.id === input.classSessionId);
          if (!session || !isConducted(session)) throw new NotFoundException("Conducted class session not found");
          // Keep this exact source projection compatible with historical fingerprints.
          const records = await tx.attendanceRecord.findMany({ where: { departmentId: scope.departmentId,
            enrollmentId: scope.enrollmentId, classSessionId: session.id }, orderBy: { id: "asc" }, select: {
            id: true, departmentId: true, classSessionId: true, enrollmentId: true, studentUserId: true, status: true,
            sourceType: true, externalSourceRef: true, markedByUserId: true, overrideByUserId: true, overrideReason: true,
            markedAt: true, updatedAt: true, archivedAt: true, resolutionStatus: true, conflictEvidenceJson: true, attendanceEvidenceRevision: true,
          } });
          if (records.some((r) => r.studentUserId !== scope.studentUserId)) throw new ConflictException("Invalid Attendance source identity");
          const previous = await tx.formativeAttendanceCorrection.findFirst({ where: {
            departmentId: scope.departmentId, enrollmentId: scope.enrollmentId, classSessionId: session.id,
          }, orderBy: { revision: "desc" } });
          const basis = rawBasis(session, records);
          const correction = await tx.formativeAttendanceCorrection.create({ data: {
            ...scope, classSessionId: session.id, actorUserId: principal.actorId,
            status: input.status, reason, revision: (previous?.revision ?? 0) + 1,
            authorityKind: authority.authorityKind, authorityJson: authority,
            basisFingerprint: fingerprint(basis),
            originalEvidenceJson: JSON.parse(JSON.stringify(basis)) as Prisma.InputJsonValue,
            // The database derives previousEvidenceJson, source tokens and occurredAt.
          } });
          const request = this.context.get();
          await tx.auditLog.create({ data: { departmentId: scope.departmentId, actorUserId: principal.actorId,
            actorType: "USER", action: ATTENDANCE_AUDIT_EVENTS.RECORD_CORRECTED,
            targetType: "formative_attendance_correction", targetId: correction.id, outcome: "SUCCESS",
            requestId: request?.requestId, ipAddress: request?.audit.ipAddress, userAgent: request?.audit.userAgent,
            contextJson: { ...scope, classSessionId: session.id, correctedStatus: correction.status, reason,
              revision: correction.revision, authorityKind: correction.authorityKind,
              authority: correction.authorityJson, previousEvidence: correction.previousEvidenceJson,
              basisFingerprint: correction.basisFingerprint } as Prisma.InputJsonObject,
          } });
          return correction;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          const code = String(error.meta?.code);
          const retry = error.code === "P2034" || (error.code === "P2010" && ["40001", "40P01"].includes(code));
          if (retry && attempt < 2) continue;
          if (code === "P0002") throw new NotFoundException("Attendance scope not found");
          if (code === "42501") throw new ForbiddenException("Attendance correction authority required");
          if (retry || error.code === "P2002" || code === "23514")
            throw new ConflictException("Attendance correction is closed or its evidence changed; reload before retrying");
        }
        throw error;
      }
    }
  }
}
