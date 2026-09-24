import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { ATTENDANCE_MARK_RULE, attendanceMarkForCounts } from "./attendance-mark.rule";

export const FORMATIVE_ATTENDANCE_POLICY = "attendance.formative.coordinate";
export interface AttendanceDiagnostic {
  code: string;
  enrollmentId: string;
  studentUserId: string;
  classSessionId: string | null;
  attendanceRecordIds: string[];
  correctionId?: string;
  message: string;
}
export interface SessionEvidence {
  id: string; departmentId: string; courseOfferingId: string; status: string;
  actualStartAt: Date | null; actualEndAt: Date | null; canceledAt: Date | null;
}
export interface RecordEvidence {
  id: string; departmentId: string; classSessionId: string; enrollmentId: string; studentUserId: string;
  status: string; sourceType: string; externalSourceRef: string | null;
  markedByUserId: string | null; overrideByUserId: string | null; overrideReason: string | null;
  markedAt: Date; updatedAt: Date; archivedAt: Date | null;
  resolutionStatus: string; conflictEvidenceJson: unknown;
}
export interface CorrectionEvidence {
  id: string; classSessionId: string; status: string; basisFingerprint: string;
}
export interface AttendanceScope {
  departmentId: string; courseOfferingId: string; enrollmentId: string; studentUserId: string;
}

// JSON is built exclusively from server-selected fields; arbitrary capture payloads are never copied.
export function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function rawBasis(session: SessionEvidence, records: RecordEvidence[]) {
  return { session, records: [...records].sort((a, b) => a.id.localeCompare(b.id)) };
}
export function isConducted(session: SessionEvidence) {
  return ["COMPLETED", "LOCKED", "ARCHIVED"].includes(session.status) && !session.canceledAt &&
    !!session.actualStartAt && !!session.actualEndAt && session.actualEndAt > session.actualStartAt;
}

export function calculateAttendance(scope: AttendanceScope, sessions: SessionEvidence[], records: RecordEvidence[], corrections: CorrectionEvidence[]) {
  const diagnostics: AttendanceDiagnostic[] = [];
  const items: Array<{ classSessionId: string; attendanceRecordId: string | null; correctionId: string | null;
    status: string | null; basisFingerprint: string; evidenceJson: Prisma.InputJsonObject }> = [];
  let presentCount = 0;
  const counted = sessions.filter(isConducted).sort((a, b) => a.id.localeCompare(b.id));
  const issue = (code: string, message: string, sessionId: string | null, evidence: RecordEvidence[] = [], correctionId?: string) =>
    diagnostics.push({ code, message, enrollmentId: scope.enrollmentId, studentUserId: scope.studentUserId,
      classSessionId: sessionId, attendanceRecordIds: evidence.map((r) => r.id), ...(correctionId ? { correctionId } : {}) });
  for (const session of counted) {
    const evidence = records.filter((r) => r.classSessionId === session.id);
    const effective = evidence.filter((r) => !r.archivedAt);
    const basis = rawBasis(session, evidence);
    const basisFingerprint = fingerprint(basis);
    const correction = corrections.find((c) => c.classSessionId === session.id);
    let status: string | null = null;
    const relationshipValid = session.departmentId === scope.departmentId && session.courseOfferingId === scope.courseOfferingId &&
      evidence.every((r) => r.departmentId === scope.departmentId && r.enrollmentId === scope.enrollmentId && r.studentUserId === scope.studentUserId);
    if (!relationshipValid) issue("INVALID_SOURCE_RELATIONSHIP", "Source identity does not match this enrollment and offering", session.id, evidence);
    else if (effective.length > 1) issue("AMBIGUOUS_EFFECTIVE_EVIDENCE", "More than one effective attendance record exists", session.id, effective);
    else if (correction && correction.basisFingerprint !== basisFingerprint)
      issue("STALE_RECONCILIATION", "Evidence changed after the Coordinator correction; reconcile again", session.id, evidence, correction.id);
    else if (correction) status = correction.status;
    else if (!effective.length) issue("MISSING_ATTENDANCE_EVIDENCE", "Resolve attendance for this conducted class; missing does not mean absent", session.id);
    else {
      const record = effective[0]!;
      if (record.resolutionStatus !== "RESOLVED") issue(record.resolutionStatus === "CONFLICT" ? "UNRESOLVED_CONFLICT" : "UNRESOLVED_RECONCILIATION",
        "Coordinator reconciliation is required", session.id, effective);
      else status = record.status;
    }
    if (status !== null && status !== "PRESENT" && status !== "ABSENT") {
      issue("UNSUPPORTED_ATTENDANCE_STATUS", "Only resolved PRESENT or ABSENT can contribute to Attendance /5", session.id, evidence, correction?.id);
      status = null;
    }
    if (status === "PRESENT") presentCount++;
    items.push({ classSessionId: session.id, attendanceRecordId: relationshipValid && effective.length === 1 ? effective[0]!.id : null,
      correctionId: correction?.id ?? null, status, basisFingerprint,
      evidenceJson: JSON.parse(JSON.stringify(basis)) as Prisma.InputJsonObject });
  }
  if (!counted.length) issue("ZERO_CONDUCTED_SESSIONS", "No valid conducted classes are available", null);
  const blocked = diagnostics.length > 0;
  return { ruleVersionCode: ATTENDANCE_MARK_RULE.versionCode, presentCount, conductedCount: counted.length,
    calculationBasis: "PRESENT / VALID_CONDUCTED_CLASSES; EXACT_RATIO_V1",
    percentage: blocked ? null : new Prisma.Decimal(presentCount).mul(100).div(counted.length).toDecimalPlaces(6),
    mark: blocked ? null : attendanceMarkForCounts(presentCount, counted.length).mark,
    status: blocked ? "BLOCKED" : "READY", diagnostics, items,
    sourceFingerprint: fingerprint({ rule: ATTENDANCE_MARK_RULE.versionCode, scope, items, diagnostics }) };
}
