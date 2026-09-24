import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";
import { AuthorizationService } from "@/modules/authorization/services/authorization.service";
import { AttendanceAcademicContextService } from "@/modules/academic/attendance-academic-context.service";
import { ClassSessionEvidenceService } from "@/modules/class-session/class-session-evidence.service";
import { calculateAttendance, fingerprint, FORMATIVE_ATTENDANCE_POLICY, isConducted, rawBasis } from "../../domain/formative-attendance.rules";
import { assertCurrentAttendanceStatus } from "../../domain/attendance-mark.rule";

type Authority = Awaited<ReturnType<AttendanceAcademicContextService["lock"]>>;
const include = { items: { orderBy: { classSessionId: "asc" as const } }, transitions: { orderBy: { occurredAt: "asc" as const } } };
type Version = Prisma.FormativeAttendanceVersionGetPayload<{ include: typeof include }>;
type Transition = "VERIFIED" | "FINALISED" | "LOCKED";

@Injectable()
export class FormativeAttendanceService {
  constructor(private readonly prisma: PrismaService, private readonly context: RequestContextService,
    private readonly authorization: AuthorizationService, private readonly academic: AttendanceAcademicContextService,
    private readonly sessions: ClassSessionEvidenceService) {}

  read(offeringId: string, enrollmentId: string) {
    return this.withScope(offeringId, enrollmentId, async (tx, scope) => {
      const history = await tx.formativeAttendanceVersion.findMany({ where: this.where(scope), include, orderBy: { revision: "desc" } });
      return { preview: await this.calculate(tx, scope), current: history[0] ? this.view(history[0]) : null,
        history: history.map((v) => this.view(v)) };
    });
  }

  // System calculation: no teacher submission, client totals or percentages.
  calculateVersion(offeringId: string, enrollmentId: string) {
    return this.withScope(offeringId, enrollmentId, async (tx, scope) => {
      const current = await this.latest(tx, scope);
      if (current && this.state(current) === "LOCKED") throw new ConflictException("Explicit Coordinator reopening is required");
      const result = await this.calculate(tx, scope);
      if (current && current.sourceFingerprint === result.sourceFingerprint) return this.view(current);
      return this.view(await this.createVersion(tx, scope, result, current));
    });
  }

  transition(offeringId: string, enrollmentId: string, versionId: string, state: Transition) {
    if (!["VERIFIED", "FINALISED", "LOCKED"].includes(state)) throw new BadRequestException("Invalid Attendance transition");
    return this.withScope(offeringId, enrollmentId, async (tx, scope) => {
      const current = await this.target(tx, scope, versionId);
      if (state === "FINALISED" || state === "LOCKED") {
        const open = (await this.sessions.read(tx, scope.departmentId, scope.courseOfferingId))
          .filter((s) => !s.canceledAt && ["SCHEDULED", "ACTIVE"].includes(s.status));
        if (open.length) throw new ConflictException({ code: "ATTENDANCE_PERIOD_OPEN", diagnostics: [{
          code: "ATTENDANCE_PERIOD_OPEN", enrollmentId, studentUserId: scope.studentUserId,
          classSessionIds: open.map((s) => s.id), message: "Complete or cancel the remaining open classes before finalising Attendance" }] });
      }
      const result = await this.calculate(tx, scope);
      if (result.status === "BLOCKED") throw new ConflictException({ code: "ATTENDANCE_BLOCKED", diagnostics: result.diagnostics });
      if (current.sourceFingerprint !== result.sourceFingerprint) throw new ConflictException({ code: "STALE_ATTENDANCE_EVIDENCE",
        diagnostics: [{ code: "STALE_ATTENDANCE_EVIDENCE", enrollmentId, studentUserId: scope.studentUserId,
          classSessionIds: this.changedSessions(current, result), message: "Recalculate and reverify the changed source package" }] });
      const previous = this.state(current);
      if (previous === state) return this.view(current);
      const required: Record<Transition, string> = { VERIFIED: "READY", FINALISED: "VERIFIED", LOCKED: "FINALISED" };
      if (previous !== required[state]) throw new ConflictException(`Attendance must be ${required[state]} before ${state}`);
      await this.event(tx, scope, current.id, state);
      return this.view((await this.latest(tx, scope))!);
    });
  }

  reopen(offeringId: string, enrollmentId: string, versionId: string, reason: string) {
    reason = this.reason(reason);
    return this.withScope(offeringId, enrollmentId, async (tx, scope) => {
      const current = await this.target(tx, scope, versionId);
      if (this.state(current) !== "LOCKED") throw new ConflictException("Only the current locked Attendance version can be reopened");
      await this.event(tx, scope, current.id, "REOPENED", reason);
      return this.view(await this.createVersion(tx, scope, await this.calculate(tx, scope), current, reason));
    });
  }

  correct(offeringId: string, enrollmentId: string, versionId: string, classSessionId: string, input: { status: string; reason: string }) {
    const reason = this.reason(input.reason);
    try { assertCurrentAttendanceStatus(input.status); } catch { throw new BadRequestException("Correction must be PRESENT or ABSENT"); }
    return this.withScope(offeringId, enrollmentId, async (tx, scope) => {
      const current = await this.target(tx, scope, versionId);
      if (!["READY", "BLOCKED", "VERIFIED", "FINALISED"].includes(this.state(current))) throw new ConflictException("Reopen locked evidence or recalculate before correction");
      const sources = await this.sources(tx, scope);
      const session = sources.sessions.find((s) => s.id === classSessionId);
      if (!session || !isConducted(session)) throw new NotFoundException("Conducted class session not found");
      const basis = rawBasis(session, sources.records.filter((r) => r.classSessionId === session.id));
      const previous = await tx.formativeAttendanceCorrection.findFirst({ where: { ...this.where(scope), classSessionId }, orderBy: { revision: "desc" } });
      const { configurationJson: _configuration, ...identity } = scope;
      const correction = await tx.formativeAttendanceCorrection.create({ data: {
        ...identity, versionId: current.id, classSessionId, status: input.status, reason,
        revision: (previous?.revision ?? 0) + 1, basisFingerprint: fingerprint(basis),
        originalEvidenceJson: JSON.parse(JSON.stringify(basis)) as Prisma.InputJsonValue,
      } });
      await this.audit(tx, scope, "corrected", correction.id, { previousCorrectionId: previous?.id ?? null, versionId: current.id, reason });
      return this.view(await this.createVersion(tx, scope, await this.calculate(tx, scope), current, reason));
    });
  }

  private where(scope: Authority) {
    return { departmentId: scope.departmentId, courseOfferingId: scope.courseOfferingId, enrollmentId: scope.enrollmentId };
  }
  private latest(tx: Prisma.TransactionClient, scope: Authority) {
    return tx.formativeAttendanceVersion.findFirst({ where: this.where(scope), orderBy: { revision: "desc" }, include });
  }
  private async target(tx: Prisma.TransactionClient, scope: Authority, versionId: string) {
    const current = await this.latest(tx, scope);
    if (!current || current.id !== versionId) throw new NotFoundException("Current Attendance version not found");
    return current;
  }
  private state(version: Version) {
    for (const state of ["REOPENED", "LOCKED", "FINALISED", "VERIFIED"]) {
      if (version.transitions.some((t) => t.state === state)) return state;
    }
    return version.status;
  }
  private view(version: Version) { return { ...version, workflowState: this.state(version) }; }
  private async sources(tx: Prisma.TransactionClient, scope: Authority) {
    const sessions = await this.sessions.read(tx, scope.departmentId, scope.courseOfferingId);
    const records = await tx.attendanceRecord.findMany({ where: { departmentId: scope.departmentId, enrollmentId: scope.enrollmentId }, orderBy: { id: "asc" }, select: {
      id: true, departmentId: true, classSessionId: true, enrollmentId: true, studentUserId: true, status: true,
      sourceType: true, externalSourceRef: true, markedByUserId: true, overrideByUserId: true, overrideReason: true,
      markedAt: true, updatedAt: true, archivedAt: true, resolutionStatus: true, conflictEvidenceJson: true, attendanceEvidenceRevision: true,
    } });
    return { sessions, records };
  }
  private async calculate(tx: Prisma.TransactionClient, scope: Authority) {
    const { sessions, records } = await this.sources(tx, scope);
    const all = await tx.formativeAttendanceCorrection.findMany({ where: this.where(scope), orderBy: { revision: "desc" } });
    const corrections = all.filter((c, i) => all.findIndex((other) => other.classSessionId === c.classSessionId) === i);
    const result = calculateAttendance({ departmentId: scope.departmentId, courseOfferingId: scope.courseOfferingId,
      enrollmentId: scope.enrollmentId, studentUserId: scope.studentUserId }, sessions, records, corrections);
    result.sourceFingerprint = fingerprint({ evidence: result.sourceFingerprint, configuration: scope.configurationJson,
      studentBatchId: scope.studentBatchId, academicTermId: scope.academicTermId });
    return result;
  }
  private async createVersion(tx: Prisma.TransactionClient, scope: Authority, result: Awaited<ReturnType<FormativeAttendanceService["calculate"]>>, previous: Version | null, reason?: string) {
    const { items, diagnostics, ...calculation } = result;
    const version = await tx.formativeAttendanceVersion.create({ data: {
      ...scope, ...calculation, revision: (previous?.revision ?? 0) + 1, previousId: previous?.id, reason,
      diagnosticsJson: JSON.parse(JSON.stringify(diagnostics)) as Prisma.InputJsonValue,
    } });
    await tx.formativeAttendanceSourceItem.createMany({ data: items.map((item) => ({
      ...item, ...this.where(scope), versionId: version.id,
    })) });
    await this.audit(tx, scope, "calculated", version.id, { revision: version.revision, status: version.status, previousId: previous?.id ?? null });
    return (await this.latest(tx, scope))!;
  }
  private changedSessions(current: Version, result: Awaited<ReturnType<FormativeAttendanceService["calculate"]>>) {
    return [...new Set([...current.items, ...result.items].map((i) => i.classSessionId))].filter((id) =>
      fingerprint(current.items.filter((i) => i.classSessionId === id).map((i) => [i.basisFingerprint, i.correctionId, i.status])) !==
      fingerprint(result.items.filter((i) => i.classSessionId === id).map((i) => [i.basisFingerprint, i.correctionId, i.status])));
  }
  private async event(tx: Prisma.TransactionClient, scope: Authority, versionId: string, state: string, reason?: string) {
    const { configurationJson: _configuration, studentUserId: _student, ...identity } = scope;
    const event = await tx.formativeAttendanceTransition.create({ data: { ...identity, versionId, state, reason } });
    await this.audit(tx, scope, state.toLowerCase(), versionId, { eventId: event.id, reason: reason ?? null });
  }
  private async audit(tx: Prisma.TransactionClient, scope: Authority, action: string, targetId: string, metadata: Prisma.InputJsonObject) {
    const request = this.context.get();
    await tx.auditLog.create({ data: { actorUserId: scope.actorUserId, actorType: "USER", departmentId: scope.departmentId,
      requestId: request?.requestId, ipAddress: request?.audit.ipAddress, userAgent: request?.audit.userAgent,
      action: `attendance.formative.${action}`, targetType: "formative_attendance", targetId, outcome: "SUCCESS",
      contextJson: { ...metadata, coordinatorAssignmentId: scope.coordinatorAssignmentId, enrollmentId: scope.enrollmentId,
        courseOfferingId: scope.courseOfferingId, studentBatchId: scope.studentBatchId, academicTermId: scope.academicTermId } } });
  }
  private reason(value: string) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > 2000) throw new BadRequestException("A reason of 1–2000 characters is required");
    return value.trim();
  }
  private async withScope<T>(offeringId: string, enrollmentId: string, work: (tx: Prisma.TransactionClient, scope: Authority) => Promise<T>): Promise<T> {
    const principal = this.context.get()?.principal;
    if (!principal?.isAuthenticated || principal.actorType !== "user" || !principal.actorId || !principal.activeDepartmentId ||
        !this.authorization.isAllowed(principal, FORMATIVE_ATTENDANCE_POLICY) || principal.roleAssignments.some((r) =>
          r.departmentId === principal.activeDepartmentId && r.role === "student")) throw new ForbiddenException("Attendance Coordinator access denied");
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const scope = await this.academic.lock(tx, principal.activeDepartmentId!, principal.actorId, offeringId, enrollmentId);
          return work(tx, scope);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
      } catch (error) {
        const retry = error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2034" || (error.code === "P2010" && ["40001", "40P01"].includes(String(error.meta?.code))));
        if (retry && attempt < 2) continue;
        if (retry || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"))
          throw new ConflictException("Concurrent Attendance operation; reload before retrying");
        throw error;
      }
    }
  }
}
