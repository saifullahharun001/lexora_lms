import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const path = "prisma/migrations/202610080001_authoritative_course_composition/migration.sql";
const sql = readFileSync(path, "utf8");
test("composition migration is additive, restrictive, immutable and audited", () => {
  assert.match(sql, /^BEGIN;/); assert.match(sql, /COMMIT;\s*$/);
  assert.equal((sql.match(/CREATE TABLE /g) ?? []).length, 1);
  assert.equal((sql.match(/ON DELETE RESTRICT ON UPDATE RESTRICT/g) ?? []).length, 12);
  assert.doesNotMatch(sql, /DROP |DISABLE TRIGGER|CREATE OR REPLACE|ON DELETE CASCADE|INSERT INTO course_result_compositions/);
  for (const token of ["crc_context_uq", "DECIMAL(10,6)", "total_mark=formative_mark+summative_mark",
    "formative_passed=(formative_mark>=16)", "summative_passed=(summative_mark>=24)", "course_passed=(formative_passed AND summative_passed)",
    "BEFORE UPDATE OR DELETE ON course_result_compositions", "DEFERRABLE INITIALLY DEFERRED", "xmin=pg_current_xact_id()::xid",
    "OLD.action='course-result.composed' OR NEW.action='course-result.composed'", "transaction_isolation", "serializable"])
    assert.ok(sql.includes(token), token);
  assert.ok(readFileSync("../../.gitattributes", "utf8").includes(`apps/api/${path} -text`));
  assert.ok(readFileSync("../../.gitignore", "utf8").includes(`!apps/api/${path}`));
});
test("shared projection binds exact approved version and independently proves REGULAR lineage", () => {
  for (const token of ["WHERE id=a.calculated_mark_id", "a.calculated_mark_version_snapshot IS DISTINCT FROM m.calculated_mark_version",
    "Competing Chairman approvals", "examination_candidate_courses", "examination_candidate_registrations", "examination_candidate_lists",
    "IS DISTINCT FROM 'CERTIFIED'", "IS DISTINCT FROM 'REGULAR'", "registrationVersion", "curriculumAssignmentId", "rosterEntryId"])
    assert.ok(sql.includes(token), token);
  assert.doesNotMatch(sql, /MAX\(|AVG\(|SUM\(|ORDER BY.*version|expires_at|unassigned_at|attendance_records|question_marks|final_formative_sources\(/);
});
test("source-owner hooks stay inside existing transaction after source audit; no composition HTTP API", () => {
  const f = readFileSync("src/modules/final-formative/final-formative.service.ts", "utf8");
  const s = readFileSync("src/modules/summative-examination/application/services/summative-committee-workflow.service.ts", "utf8");
  assert.equal((f.match(/this.composition.reconcileInTransaction/g) ?? []).length, 2);
  assert.ok(s.indexOf("await this.composition.reconcileInTransaction") > s.indexOf("await this.writeApprovalAudit"));
  assert.ok(s.indexOf("already Chairman-approved") < s.indexOf("await this.composition.reconcileInTransaction"));
  for (const file of ["course-result-composition.module.ts", "course-result-composition.service.ts"])
    assert.doesNotMatch(readFileSync(`src/modules/course-result-composition/${file}`, "utf8"), /@Controller|@Post|ResultRecord|gradePoint|publish\(/);
});

test("source and audit contracts use an explicit privacy allowlist; no full source-row snapshots", () => {
  const projection = sql.slice(sql.indexOf("CREATE FUNCTION course_composition_sources"), sql.indexOf("CREATE FUNCTION course_composition_matches"));
  assert.doesNotMatch(projection, /to_jsonb\(/);
  assert.match(projection, /COURSE_COMPOSITION_PROVENANCE_V1/);
  assert.match(sql, /sources - ARRAY\['provenanceJson','studentUserId'/);
  const contract = readFileSync("src/modules/course-result-composition/course-result-composition.contract.ts", "utf8");
  assert.doesNotMatch(contract, /registeredByUserId|sourceReference|createdAt|updatedAt|email|displayName/);
  const candidateGuard = readFileSync("prisma/migrations/202608290004_add_summative_examiner_marks/migration.sql", "utf8")
    .split('CREATE FUNCTION "lexora_guard_summative_candidate_identity"')[1]!.split('CREATE TRIGGER')[0]!;
  assert.match(candidateGuard, /registered_at/);
  assert.doesNotMatch(candidateGuard, /created_at|updated_at/);
  const certificationGuard = readFileSync("prisma/migrations/202609210002_add_regular_comprehensive_workflow/migration.sql", "utf8");
  assert.match(certificationGuard, /OLD.status='CERTIFIED'.*Candidate list is protected evidence/);
  assert.match(certificationGuard, /Certified classification and enrollment sources are immutable/);
});
