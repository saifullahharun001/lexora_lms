import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { FinalFormativeService } from "@/modules/final-formative/final-formative.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";
import { ClassSessionEvidenceService } from "@/modules/class-session/class-session-evidence.service";
import { AttendanceMarkGenerationAuthorizerService } from "./attendance-mark-generation-authorizer.service";
import { ATTENDANCE_MARK_RULE } from "../../domain/attendance-mark.rule";
import { calculateAttendance, fingerprint } from "../../domain/formative-attendance.rules";
import { ATTENDANCE_AUDIT_EVENTS } from "../../domain/attendance.audit-events";

interface GenerationCourse {
  examinationCourseId: string; courseOfferingId: string; studentBatchId: string; academicTermId: string;
  configuration: Prisma.InputJsonValue;
  enrollments: Array<{ id: string; studentUserId: string }>;
}
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

// Exact controlled messages from the generation migration, including its deferred
// child-package validator. Unknown connector failures must not become business errors.
const generationConflictGuards = new Set([
  "Invalid or unbound ExaminationCourse",
  "Invalid Attendance academic scope",
  "Invalid Attendance curriculum identity",
  "A bound standard 30/5/5/60 assessment template is required",
  "Structurally inconsistent Attendance class evidence",
  "ATTENDANCE_PERIOD_OPEN",
  "Invalid Attendance enrollment student identity",
  "Examination has no applicable courses",
  "Attendance generation scope mismatch",
  "Attendance generation missing",
  "Attendance generation child package incomplete or inconsistent",
  "Generated Attendance must be complete without lifecycle transitions",
  "Attendance generation requires exactly one success audit",
  "Generated Attendance ExaminationCourse scope is immutable",
  "Generated Attendance Examination scope cannot expand",
  "Generated Attendance enrollment scope cannot expand",
  "Attendance academic offering scope is invalid or not current",
  "Attendance academic enrollment scope is invalid or not current",
  "Generated Attendance is irreversible",
  "Invalid generated Attendance provenance",
  "Generated Attendance outside Examination scope",
  "Attendance revision must extend the current immutable version",
  "Generated Attendance package must be complete",
  "Attendance conducted source set is incomplete or inconsistent",
  "Stale Attendance source evidence",
  "Attendance source reference identity mismatch",
  "Attendance effective source reference mismatch",
  "Attendance correction lineage mismatch",
  "Attendance source status does not match current effective evidence",
  "Attendance source package is incomplete or inconsistent",
  "Generated Attendance source is frozen",
  "Generated Attendance is frozen for ordinary correction",
]);

@Injectable()
export class AttendanceMarkGenerationService {
  constructor(private readonly prisma: PrismaService, private readonly context: RequestContextService,
    private readonly authorizer: AttendanceMarkGenerationAuthorizerService,
    private readonly sessions: ClassSessionEvidenceService,
    private readonly finalFormative: FinalFormativeService) {}

  async generate(examinationId: string) {
    // Only the route object identity is accepted. Every authority and scope value is resolved by the server.
    const authority = await this.authorizer.authorize(examinationId);
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT id FROM examinations WHERE id=${examinationId} AND department_id=${authority.departmentId}
              AND archived_at IS NULL FOR UPDATE
          `);
          if (locked.length !== 1) throw new NotFoundException("Examination not found");
          // Corrections take the offering mutex before authority locks. Acquire every
          // offering in this scope before revalidating the Chairman to preserve that order.
          const rows = await tx.$queryRaw<Array<{ scope: GenerationCourse[] }>>(Prisma.sql`
            SELECT attendance_generation_scope(${authority.departmentId},${examinationId}) AS scope
          `);
          const scope = rows[0]?.scope;
          if (!scope?.length) throw new ConflictException("Examination has no applicable courses");
          await this.authorizer.assertCurrentAuthority(tx, authority, new Date());
          if (!scope.some((course) => course.enrollments.length > 0))
            throw new ConflictException("Examination has no applicable Attendance enrollments");
          const examination = await tx.examination.findUniqueOrThrow({ where: { id: examinationId },
            select: { id: true, academicProgramId: true, academicSessionId: true, academicTermId: true } });
          if (await tx.formativeAttendanceGeneration.findUnique({ where: {
            departmentId_examinationId: { departmentId: authority.departmentId, examinationId },
          } })) throw new ConflictException("Attendance has already been generated for this Examination");
          const children = [];
          const diagnostics = [];
          for (const course of scope) {
            const sessions = await this.sessions.read(tx, authority.departmentId, course.courseOfferingId);
            for (const enrollment of course.enrollments) {
              const identity = { departmentId: authority.departmentId, courseOfferingId: course.courseOfferingId,
                enrollmentId: enrollment.id, studentUserId: enrollment.studentUserId };
              // Preserve the exact historical/ordinary-correction fingerprint projection and key order.
              const records = await tx.attendanceRecord.findMany({ where: {
                departmentId: authority.departmentId, enrollmentId: enrollment.id,
              }, orderBy: { id: "asc" }, select: {
                id: true, departmentId: true, classSessionId: true, enrollmentId: true, studentUserId: true, status: true,
                sourceType: true, externalSourceRef: true, markedByUserId: true, overrideByUserId: true, overrideReason: true,
                markedAt: true, updatedAt: true, archivedAt: true, resolutionStatus: true, conflictEvidenceJson: true, attendanceEvidenceRevision: true,
              } });
              const all = await tx.formativeAttendanceCorrection.findMany({ where: {
                departmentId: authority.departmentId, courseOfferingId: course.courseOfferingId, enrollmentId: enrollment.id,
              }, orderBy: [{ classSessionId: "asc" }, { revision: "desc" }] });
              const corrections = all.filter((c, i) => all.findIndex((other) => other.classSessionId === c.classSessionId) === i);
              const result = calculateAttendance(identity, sessions, records, corrections);
              result.sourceFingerprint = fingerprint({ evidence: result.sourceFingerprint, configuration: course.configuration,
                studentBatchId: course.studentBatchId, academicTermId: course.academicTermId });
              diagnostics.push(...result.diagnostics.map((d) => ({ ...d, examinationCourseId: course.examinationCourseId })));
              const previous = await tx.formativeAttendanceVersion.findFirst({ where: {
                departmentId: authority.departmentId, enrollmentId: enrollment.id,
              }, orderBy: { revision: "desc" } });
              if (previous?.generationId) throw new ConflictException("Attendance scope is already generated and frozen");
              children.push({ course, identity, result, previous, corrections });
            }
          }
          if (diagnostics.length) throw new ConflictException({ code: "ATTENDANCE_BLOCKED", diagnostics });
          const ruleVersionCode = ATTENDANCE_MARK_RULE.versionCode;
          const sourceFingerprint = fingerprint({ ruleVersionCode, departmentId: authority.departmentId,
            examination: { id: examination.id, academicProgramId: examination.academicProgramId,
              academicSessionId: examination.academicSessionId, academicTermId: examination.academicTermId },
            authority, scope, children: children.map((c) => ({ examinationCourseId: c.course.examinationCourseId,
              ...c.identity, sourceFingerprint: c.result.sourceFingerprint, corrections: c.corrections })) });
          const generation = await tx.formativeAttendanceGeneration.create({ data: {
            departmentId: authority.departmentId, examinationId,
            academicProgramId: examination.academicProgramId, academicSessionId: examination.academicSessionId,
            academicTermId: examination.academicTermId, committeeId: authority.committeeId,
            chairmanAssignmentId: authority.committeeAssignmentId, chairmanUserId: authority.actorUserId,
            chairmanAssignedAtSnapshot: authority.assignmentAssignedAt, userRoleId: authority.userRoleId, roleId: authority.roleId,
            ruleVersionCode, courseCount: scope.length, resultCount: children.length, sourceFingerprint, scopeJson: json(scope),
          } });
          for (const child of children) {
            const { items, diagnostics: childDiagnostics, ...calculation } = child.result;
            const version = await tx.formativeAttendanceVersion.create({ data: {
              ...child.identity, ...calculation, studentBatchId: child.course.studentBatchId,
              academicTermId: child.course.academicTermId, configurationJson: child.course.configuration,
              diagnosticsJson: json(childDiagnostics), generationId: generation.id, examinationId,
              examinationCourseId: child.course.examinationCourseId, actorUserId: authority.actorUserId,
              revision: (child.previous?.revision ?? 0) + 1, previousId: child.previous?.id,
            } });
            await tx.formativeAttendanceSourceItem.createMany({ data: items.map((item) => ({
              ...item, departmentId: authority.departmentId, courseOfferingId: child.course.courseOfferingId,
              enrollmentId: child.identity.enrollmentId, versionId: version.id,
              evidenceJson: { ...item.evidenceJson,
                correction: json(child.corrections.find((c) => c.id === item.correctionId) ?? null) },
            })) });
          }
          const summary = { generationId: generation.id, examinationId, academicTermId: generation.academicTermId,
            committeeId: generation.committeeId, chairmanAssignmentId: generation.chairmanAssignmentId,
            chairmanUserId: generation.chairmanUserId, chairmanAssignedAtSnapshot: generation.chairmanAssignedAtSnapshot.toISOString(),
            ruleVersionCode, courseCount: generation.courseCount, resultCount: generation.resultCount,
            sourceFingerprint, generatedAt: generation.generatedAt.toISOString() };
          const request = this.context.get();
          await tx.auditLog.create({ data: { departmentId: authority.departmentId, actorUserId: authority.actorUserId,
            actorType: "USER", action: ATTENDANCE_AUDIT_EVENTS.MARK_GENERATED, targetType: "formative_attendance_generation",
            targetId: generation.id, outcome: "SUCCESS", contextJson: summary,
            requestId: request?.requestId, ipAddress: request?.audit.ipAddress, userAgent: request?.audit.userAgent,
          } });
          await this.finalFormative.reconcileInTransaction(tx, authority.departmentId, examinationId);
          return summary;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          const code = String(error.meta?.code);
          const retry = error.code === "P2034" || (error.code === "P2010" && ["40001", "40P01"].includes(code));
          if (retry && attempt < 2) continue;
          if (code === "P0002") throw new NotFoundException("Examination not found");
          if (code === "42501") throw new ForbiddenException("Attendance generation authority required");
          if (retry || ["P2002", "P2004"].includes(error.code) || ["23514", "23505"].includes(code))
            throw new ConflictException("Attendance generation is blocked, already frozen, or its scope changed; reload before retrying");
        }
        if (error instanceof Prisma.PrismaClientUnknownRequestError) {
          // Prisma 6 can wrap deferred trigger failures in a PostgresError instead
          // of exposing a known request error. Match the complete server message.
          const guard = /PostgresError\s*\{[^}]*?\bmessage: "([^"]+)"/.exec(error.message)?.[1] ?? error.message;
          if (guard === "Exact current Attendance Chairman authority required")
            throw new ForbiddenException("Attendance generation authority required");
          if (guard === "Examination not found") throw new NotFoundException("Examination not found");
          if (generationConflictGuards.has(guard))
            throw new ConflictException("Attendance generation is blocked, already frozen, or its scope changed; reload before retrying");
        }
        throw error;
      }
    }
  }
}
