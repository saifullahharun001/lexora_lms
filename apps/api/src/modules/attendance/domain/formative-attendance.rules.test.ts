import assert from "node:assert/strict";
import test from "node:test";
import { calculateAttendance, fingerprint, rawBasis, type RecordEvidence, type SessionEvidence } from "./formative-attendance.rules";

const scope = { departmentId: "law", courseOfferingId: "offering", enrollmentId: "enrollment", studentUserId: "student" };
const start = new Date("2026-09-01T09:00:00Z"), end = new Date("2026-09-01T10:00:00Z");
export const session = (id = "session"): SessionEvidence => ({ id, departmentId: "law", courseOfferingId: "offering", status: "COMPLETED", actualStartAt: start, actualEndAt: end, canceledAt: null });
export const record = (classSessionId = "session", status = "PRESENT"): RecordEvidence => ({ id: `record-${classSessionId}`, ...scope, classSessionId,
  status, sourceType: "MANUAL", externalSourceRef: null, markedByUserId: "teacher", overrideByUserId: null, overrideReason: null,
  markedAt: start, updatedAt: start, archivedAt: null, resolutionStatus: "RESOLVED", conflictEvidenceJson: null });

test("complete current outcomes use conducted classes as the denominator and retain source references", () => {
  const sessions = Array.from({ length: 10 }, (_, i) => session(`s${i}`));
  const result = calculateAttendance(scope, sessions, sessions.map((s, i) => record(s.id, i < 9 ? "PRESENT" : "ABSENT")), []);
  assert.equal(result.status, "READY"); assert.equal(result.mark?.toString(), "5");
  assert.equal(result.percentage?.toString(), "90"); assert.equal(result.presentCount, 9); assert.equal(result.conductedCount, 10);
  assert.equal(result.items.length, 10); assert.equal(result.items[0]!.attendanceRecordId, "record-s0");
});

test("canceled including later locked/archived sessions and invalid/nonconducted sessions are excluded", () => {
  const ignored = [
    { ...session("scheduled"), status: "SCHEDULED" }, { ...session("active"), status: "ACTIVE", actualEndAt: null },
    { ...session("canceled"), status: "CANCELED", canceledAt: start },
    { ...session("locked-canceled"), status: "LOCKED", canceledAt: start },
    { ...session("archived-canceled"), status: "ARCHIVED", canceledAt: start },
    { ...session("invalid"), actualEndAt: null }, { ...session("reverse"), actualEndAt: start },
  ];
  const result = calculateAttendance(scope, [session(), ...ignored], [record()], []);
  assert.equal(result.conductedCount, 1); assert.equal(result.mark?.toString(), "5");
  for (const status of ["COMPLETED", "LOCKED", "ARCHIVED"]) {
    assert.equal(calculateAttendance(scope, [{ ...session(), status }], [record()], []).conductedCount, 1);
  }
});

for (const [name, evidence, code] of [
  ["missing", [], "MISSING_ATTENDANCE_EVIDENCE"],
  ["archived", [{ ...record(), archivedAt: end }], "MISSING_ATTENDANCE_EVIDENCE"],
  ["conflict", [{ ...record(), resolutionStatus: "CONFLICT" }], "UNRESOLVED_CONFLICT"],
  ["reconciliation", [{ ...record(), resolutionStatus: "PENDING_REVIEW" }], "UNRESOLVED_RECONCILIATION"],
  ["ambiguous", [record(), { ...record(), id: "duplicate" }], "AMBIGUOUS_EFFECTIVE_EVIDENCE"],
  ["EXCUSED", [record("session", "EXCUSED")], "UNSUPPORTED_ATTENDANCE_STATUS"],
  ["LATE", [record("session", "LATE")], "UNSUPPORTED_ATTENDANCE_STATUS"],
  ["invalid identity", [{ ...record(), studentUserId: "different" }], "INVALID_SOURCE_RELATIONSHIP"],
] as Array<[string, RecordEvidence[], string]>) {
  test(`${name} evidence blocks without inventing ABSENT or a mark`, () => {
    const result = calculateAttendance(scope, [session()], evidence, []);
    assert.equal(result.status, "BLOCKED"); assert.equal(result.mark, null); assert.equal(result.percentage, null);
    assert.equal(result.diagnostics[0]?.code, code); assert.equal(result.diagnostics[0]?.enrollmentId, scope.enrollmentId);
    assert.equal(result.diagnostics[0]?.studentUserId, scope.studentUserId); assert.equal(result.diagnostics[0]?.classSessionId, "session");
  });
}

test("zero denominator is explicitly blocked", () => {
  assert.equal(calculateAttendance(scope, [], [], []).diagnostics[0]?.code, "ZERO_CONDUCTED_SESSIONS");
});

test("explicit correction resolves legacy/missing evidence and is invalidated by later source changes", () => {
  for (const records of [[], [record("session", "EXCUSED")]]) {
    const correction = { id: "correction", classSessionId: "session", status: "ABSENT", basisFingerprint: fingerprint(rawBasis(session(), records)) };
    const result = calculateAttendance(scope, [session()], records, [correction]);
    assert.equal(result.status, "READY"); assert.equal(result.mark?.toString(), "0"); assert.equal(result.items[0]?.correctionId, "correction");
    const changed = calculateAttendance(scope, [session()], [record()], [correction]);
    assert.equal(changed.diagnostics[0]?.code, "STALE_RECONCILIATION");
  }
});
