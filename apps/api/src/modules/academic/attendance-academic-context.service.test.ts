import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AttendanceAcademicContextService } from "./attendance-academic-context.service";

test("Attendance academic boundary locks exact offering, assignment and enrollment and validates the standard template", async () => {
  const queries: Prisma.Sql[] = [];
  const tx = { $queryRaw: async (sql: Prisma.Sql) => {
    queries.push(sql);
    if (queries.length === 1) return [{ studentBatchId: "batch", academicTermId: "term" }];
    if (queries.length === 2) return [{ id: "exact-assignment" }];
    if (queries.length === 3) return [{ studentUserId: "student" }];
    return Object.entries({ FORMATIVE_ACTIVITIES: 30, ATTENDANCE: 5, COMPREHENSIVE_EXAMINATION: 5, SUMMATIVE_EXAMINATION: 60 }).map(([code, maximum]) =>
      ({ templateId: "template", version: 1, code, maximum: new Prisma.Decimal(maximum), total: new Prisma.Decimal(100), required: true }));
  } };
  const result = await new AttendanceAcademicContextService().lock(tx as any, "law", "coordinator", "offering", "enrollment");
  assert.equal(result.coordinatorAssignmentId, "exact-assignment");
  assert.match(queries[0]!.sql, /FOR UPDATE/);
  const authority = queries[1]!;
  assert.deepEqual(authority.values, ["law", "coordinator", "batch", "term"]);
  for (const predicate of ["a.status = 'ACTIVE'", "a.assigned_at <= clock_timestamp()", "a.expires_at > clock_timestamp()",
    "a.unassigned_at IS NULL", "a.archived_at IS NULL", "d.status = 'ACTIVE'", "u.status = 'ACTIVE'",
    "u.deleted_at IS NULL", "b.archived_at IS NULL", "t.archived_at IS NULL", "p.archived_at IS NULL", "s.archived_at IS NULL", "FOR SHARE OF a"]) {
    assert.ok(authority.sql.includes(predicate), predicate);
  }
  assert.deepEqual(queries[2]!.values, ["enrollment", "law", "offering", "term"]);
});
for (const missing of ["offering", "assignment", "enrollment"]) {
  test(`missing or out-of-scope ${missing} yields safe not found before student evidence is read`, async () => {
    let count = 0;
    const tx = { $queryRaw: async () => {
      count++;
      if (count === 1) return missing === "offering" ? [] : [{ studentBatchId: "batch", academicTermId: "term" }];
      if (count === 2) return missing === "assignment" ? [] : [{ id: "assignment" }];
      return [];
    } };
    await assert.rejects(new AttendanceAcademicContextService().lock(tx as any, "law", "actor", "offering", "enrollment"), NotFoundException);
  });
}
