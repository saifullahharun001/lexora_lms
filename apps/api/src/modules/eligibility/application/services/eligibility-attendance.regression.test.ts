import assert from "node:assert/strict";
import test from "node:test";
import { EligibilityService } from "./eligibility.service";
import { attendanceMarkForCounts } from "@/modules/attendance/domain/attendance-mark.rule";

test("Eligibility retains 75/65, legacy attended statuses, no-record pending state and independent snapshots", async () => {
  for (const [attended, count, expected] of [[75, 100, "ELIGIBLE"], [74, 100, "CONDITIONAL"], [65, 100, "CONDITIONAL"], [64, 100, "INELIGIBLE"], [0, 0, "PENDING_REVIEW"]] as const) {
    const enrollment = { id: "enrollment", courseOfferingId: "offering", eligibilityStatus: "PENDING_REVIEW", eligibilitySnapshotJson: null };
    const writes: any[] = [];
    const service = new EligibilityService({
      findEnrollmentById: async () => enrollment,
      listAttendanceRecordsForEnrollment: async () => Array.from({ length: count }, (_, index) => ({ status: index < attended ? ["PRESENT", "LATE", "EXCUSED"][index % 3] : "ABSENT" })),
      updateEnrollmentEligibility: async (_department: string, _id: string, data: unknown) => { writes.push(data); return { ...enrollment, ...(data as object) }; },
    } as any, { auditLog: { create: async () => ({}) } } as any,
    { get: () => ({ principal: { actorId: "admin", activeDepartmentId: "law", roleAssignments: [{ role: "department_admin", departmentId: "law" }] }, audit: {} }) } as any);
    const result = await service.computeEnrollment("enrollment");
    assert.equal(result.eligibilityStatus, expected);
    assert.equal(result.snapshot.rule.thresholdPercentage, 75);
    assert.equal(result.snapshot.rule.conditionalThresholdPercentage, 65);
    const saved = JSON.stringify(writes);
    if (count) attendanceMarkForCounts(attended, count);
    assert.equal(JSON.stringify(writes), saved);
    assert.equal(writes.length, 1);
  }
});
