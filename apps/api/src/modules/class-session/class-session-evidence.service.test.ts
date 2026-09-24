import assert from "node:assert/strict";
import test from "node:test";
import { ClassSessionEvidenceService } from "./class-session-evidence.service";

test("Attendance session read is department/offering scoped and preserves open, canceled and archived evidence", async () => {
  const rows = ["SCHEDULED", "ACTIVE", "CANCELED", "COMPLETED", "LOCKED", "ARCHIVED"].map((status) => ({ status }));
  const tx = { classSession: { findMany: async (query: any) => {
    assert.deepEqual(query.where, { departmentId: "law", courseOfferingId: "offering" });
    for (const field of ["status", "actualStartAt", "actualEndAt", "canceledAt", "attendanceEvidenceRevision"]) assert.equal(query.select[field], true);
    return rows;
  } } };
  assert.deepEqual(await new ClassSessionEvidenceService().read(tx as any, "law", "offering"), rows);
});
