import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";
import { FormativeActivitiesFinalisationAuthorizerService } from "./formative-activities-finalisation-authorizer.service";
import { deriveFinalResult, FORMATIVE_FINAL_RULE, type FinalSource } from "../../domain/formative-finalisation.rules";
import { FORMATIVE_AUDIT_EVENTS } from "../../domain/formative.audit-events";

interface FinalScope {
  ready: boolean; activityCount: number; rosterCount: number; totalWeight: string; sourceFingerprint: string;
  blockers: Array<{ code: string; activityId?: string }>;
  activities: Array<{ activityId: string; assignedWeight: string; status: string; submissionId: string | null;
    submissionVersion: number | null; isCurrent: boolean }>;
  results: Array<{ enrollmentId: string; studentUserId: string; mark: string; fullMark: string;
    sourceFingerprint: string; sources: FinalSource[] }>;
}
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const conflict = () => new ConflictException("Activities finalisation is blocked, already finalised, or its sources changed; reload before retrying");
const controlledGuards = new Set([
  "Invalid Activities academic scope", "Invalid Activities source package", "Invalid Activities finalisation package",
  "Invalid Activities result package", "Activities finalisation requires exactly one success audit",
  "Activities children require their new batch", "A bound standard 30/5/5/60 assessment template is required",
]);

@Injectable()
export class FormativeActivitiesFinalisationService {
  constructor(private readonly prisma: PrismaService, private readonly context: RequestContextService,
    private readonly authorizer: FormativeActivitiesFinalisationAuthorizerService) {}

  workspace(examinationCourseId: string) { return this.run(examinationCourseId, false); }
  finalise(examinationCourseId: string) { return this.run(examinationCourseId, true); }

  private async run(examinationCourseId: string, write: boolean) {
    const authority = await this.authorizer.authorize(examinationCourseId);
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const { departmentId, examinationId, courseOfferingId } = authority;
          if (write) {
            await tx.$executeRaw(Prisma.sql`SELECT formative_final_lock(${departmentId},${examinationId},${examinationCourseId},${courseOfferingId})`);
          } else {
            // Enforced by PostgreSQL: previews cannot acquire row locks or create business-row versions.
            await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
            await tx.$executeRaw(Prisma.sql`SELECT formative_final_read_scope(${departmentId},${examinationId},${examinationCourseId},${courseOfferingId})`);
          }
          const [time] = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AT TIME ZONE 'UTC' AS now`);
          await this.authorizer.assertCurrentAuthority(tx, authority, time!.now, write);
          const existing = await tx.formativeActivitiesFinalisation.findUnique({ where: { courseOfferingId },
            select: { id: true, examinationId: true, examinationCourseId: true, finalisedAt: true, activityCount: true,
              resultCount: true, ruleVersionCode: true, sourceFingerprint: true } });
          if (write && existing) throw conflict();
          const [row] = await tx.$queryRaw<Array<{ scope: FinalScope }>>(Prisma.sql`
            SELECT formative_final_sources(${departmentId},${examinationId},${examinationCourseId},${courseOfferingId},${write}) AS scope`);
          const scope = row!.scope;
          // Independent application arithmetic/framing check. SQL validates the entire lineage and package again at commit.
          for (const result of scope.results) {
            const derived = deriveFinalResult(result.enrollmentId, result.studentUserId, result.sources);
            if (derived.mark !== result.mark || derived.sourceFingerprint !== result.sourceFingerprint ||
              result.sources.length !== scope.activityCount || result.fullMark !== "30.00") throw conflict();
          }
          if (!write) return { examinationCourseId, examinationId, courseOfferingId,
            activityCount: scope.activityCount, totalWeight: scope.totalWeight, rosterCount: scope.rosterCount,
            activities: scope.activities.slice(0, 500).map(({ activityId, assignedWeight, status, submissionId, submissionVersion, isCurrent }) =>
              ({ activityId, assignedWeight, status, submissionId, submissionVersion, isCurrent })),
            preview: scope.results.slice(0, 500).map(({ enrollmentId, studentUserId, mark, fullMark }) => ({ enrollmentId, studentUserId, mark, fullMark })),
            truncated: scope.activities.length > 500 || scope.results.length > 500,
            ready: scope.ready && !existing, blockers: existing ? [{ code: "ALREADY_FINALISED" }] : scope.blockers.slice(0, 50),
            existingFinalisation: existing };
          if (!scope.ready || !scope.rosterCount || scope.results.length !== scope.rosterCount)
            throw new ConflictException({ code: "ACTIVITIES_FINALISATION_BLOCKED", blockers: scope.blockers.slice(0, 50) });
          const parent = await tx.formativeActivitiesFinalisation.create({ data: {
            departmentId, examinationId, examinationCourseId, courseOfferingId,
            committeeId: authority.committeeId, chairmanAssignmentId: authority.committeeAssignmentId,
            chairmanUserId: authority.actorUserId, chairmanAssignedAtSnapshot: authority.assignmentAssignedAt,
            userRoleId: authority.userRoleId, roleId: authority.roleId, permissionId: authority.permissionId,
            rolePermissionId: authority.rolePermissionId,
            authoritySnapshotJson: { roleCode: "teacher", permissionCode: "formative.activities.finalise_department",
              resource: "formative.activities", action: "finalise", scope: "DEPARTMENT" },
            ruleVersionCode: FORMATIVE_FINAL_RULE,
            activityCount: scope.activityCount, resultCount: scope.rosterCount, sourceFingerprint: scope.sourceFingerprint,
            scopeJson: json(scope),
          } });
          for (const result of scope.results) {
            const { sources, ...data } = result;
            const child = await tx.formativeActivitiesFinalResult.create({ data: { ...data, finalisationId: parent.id } });
            await tx.formativeActivitiesFinalSourceItem.createMany({ data: sources.map((s) => ({ ...s, resultId: child.id })) });
          }
          const summary = { finalisationId: parent.id, departmentId, examinationId, examinationCourseId, courseOfferingId,
            committeeId: parent.committeeId, chairmanAssignmentId: parent.chairmanAssignmentId, chairmanUserId: parent.chairmanUserId,
            chairmanAssignedAtSnapshot: parent.chairmanAssignedAtSnapshot.toISOString(), ruleVersionCode: parent.ruleVersionCode,
            activityCount: parent.activityCount, resultCount: parent.resultCount, sourceFingerprint: parent.sourceFingerprint,
            finalisedAt: parent.finalisedAt.toISOString() };
          const request = this.context.get();
          await tx.auditLog.create({ data: { departmentId, actorUserId: authority.actorUserId, actorType: "USER",
            action: FORMATIVE_AUDIT_EVENTS.ACTIVITIES_CHAIRMAN_FINALISED, targetType: "formative_activities_finalisation",
            targetId: parent.id, outcome: "SUCCESS", contextJson: summary, requestId: request?.requestId,
            ipAddress: request?.audit.ipAddress, userAgent: request?.audit.userAgent } });
          return summary;
        }, { isolationLevel: write ? Prisma.TransactionIsolationLevel.Serializable : Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 10000, timeout: 30000 });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          const code = String(error.meta?.code);
          const retry = error.code === "P2034" || (error.code === "P2010" && ["40001", "40P01"].includes(code));
          if (retry && attempt < 2) continue;
          if (code === "P0002") throw new NotFoundException("Examination course not found");
          if (code === "42501") throw new ForbiddenException("Activities Chairman authority required");
          if (retry || ["P2002", "P2004"].includes(error.code) || ["23514", "23505"].includes(code)) throw conflict();
        }
        if (error instanceof Prisma.PrismaClientUnknownRequestError) {
          const guard = /PostgresError\s*\{[^}]*?\bmessage: "([^"]+)"/.exec(error.message)?.[1] ?? error.message;
          if (guard === "Exact current Activities Chairman authority required") throw new ForbiddenException("Activities Chairman authority required");
          if (guard === "Examination course not found") throw new NotFoundException("Examination course not found");
          if (controlledGuards.has(guard)) throw conflict();
        }
        if (error instanceof RangeError) throw conflict();
        throw error;
      }
    }
  }
}
