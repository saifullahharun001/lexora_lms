import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const schema = readFileSync(path.resolve("prisma/schema.prisma"), "utf8");
const sql = readFileSync(path.resolve("prisma/migrations/202610010001_add_formative_activity_submission/migration.sql"), "utf8");
const service = readFileSync(path.resolve("src/modules/assessment/application/services/formative-assessment.service.ts"), "utf8");

test("activity submission schema is scoped, append-only and separate from legacy evidence", () => {
  for (const model of ["FormativeActivitySubmission", "FormativeActivitySubmissionItem", "FormativeTeacherSubmission", "FormativeSubmissionItem"]) {
    assert.ok(schema.includes(`model ${model} {`));
  }
  for (const table of ["formative_activity_submissions", "formative_activity_submission_items"]) {
    assert.ok(sql.includes(`BEFORE UPDATE OR DELETE ON ${table}`));
  }
  assert.doesNotMatch(sql, /ON DELETE (CASCADE|SET NULL)|DROP (TABLE|TRIGGER|FUNCTION)|CREATE OR REPLACE/);
  for (const constraint of ["fa_submission_activity_fk", "fa_submission_assignment_fk", "fa_submission_previous_fk",
    "fa_submission_version_uq", "fa_item_submission_fk", "fa_item_enrollment_fk", "fa_item_mark_fk", "fa_item_enrollment_uq"]) {
    assert.ok(sql.includes(constraint)); assert.ok(schema.includes(constraint));
  }
});

test("migration validates complete current packages at commit and independently enforces cutover/correction guards", () => {
  assert.equal((sql.match(/DEFERRABLE INITIALLY DEFERRED/g) ?? []).length, 2);
  assert.match(sql, /BEFORE INSERT ON formative_teacher_submissions/);
  assert.match(sql, /BEFORE INSERT ON formative_mark_evidence/);
  assert.match(sql, /NEW\.reason !~ '\[\^\[:space:\]\]'/);
  assert.match(sql, /p\.resource = 'formative.mark' AND p\.action = 'adjust'/);
  assert.match(sql, /NEW\.previous_id IS DISTINCT FROM previous.id/);
  assert.match(sql, /later\.revision > m.revision/);
  assert.match(sql, /round\(m.raw_mark \/ p.raw_maximum \* p.assigned_weight, 2\)/);
  assert.match(sql, /source_snapshot_json IS DISTINCT FROM/);
  assert.match(sql, /xmin = pg_current_xact_id\(\)::xid/);
});

test("budget guard uses offering mutex and replacement sum; configuration is independently rebuilt for deferred validation", () => {
  assert.match(sql, /formative_activity_weight_budget_guard BEFORE INSERT OR UPDATE ON formative_activities/);
  assert.match(sql, /UPDATE course_offerings SET id = id/);
  assert.match(sql, /coalesce\(sum\(assigned_weight\), 0\)[\s\S]*AND id <> NEW.id/);
  assert.match(sql, /total \+ NEW.assigned_weight > 30.00/);
  assert.match(sql, /configuration := formative_activity_configuration\(package.department_id, package.course_offering_id\)/);
  assert.match(sql, /FOR SHARE OF cc, t, c/);
  assert.match(sql, /WHEN 'FORMATIVE_ACTIVITIES' THEN 30::NUMERIC/);
  assert.match(sql, /formative_configuration_fingerprint_tokens\(configuration\) \|\| fingerprint/);
  assert.match(sql, /jsonb_build_object\('configuration', configuration, 'activity'/);
});

test("migration preflight checks all existing offering totals inside its transaction before installing Step 4A", () => {
  const preflight = sql.slice(0, sql.indexOf("CREATE FUNCTION"));
  assert.match(preflight, /BEGIN;[\s\S]*LOCK TABLE formative_activities IN SHARE ROW EXCLUSIVE MODE;[\s\S]*DO \$\$/);
  assert.match(preflight, /FROM formative_activities\s+GROUP BY department_id, course_offering_id\s+HAVING sum\(assigned_weight\) > 30.00/);
  assert.match(preflight, /Existing Formative activity configuration exceeds the \/30 budget; controlled review is required before migration/);
  assert.match(preflight, /USING ERRCODE = '23514'/);
  assert.doesNotMatch(preflight, /\b(UPDATE|DELETE|INSERT)\b/);
  assert.match(sql, /COMMIT;\s*$/);
});

test("submission and deferred package independently validate current budget after offering authorization/mutex", () => {
  const submit = service.slice(service.indexOf("  submitActivity("), service.indexOf("  readActivitySubmissions("));
  assert.match(submit, /withOffering\(courseOfferingId, FORMATIVE_POLICIES.SUBMIT/);
  const currentCheck = submit.indexOf("await this.assertCurrentWeightBudget(tx, departmentId, courseOfferingId)");
  assert.ok(currentCheck >= 0 && currentCheck < submit.indexOf("formativeActivitySubmission.create"));
  const helper = service.slice(service.indexOf("private async assertCurrentWeightBudget"), service.indexOf("private async assertWeightBudget"));
  assert.match(helper, /new Prisma.Decimal\(0\)[\s\S]*total.gt\(FORMATIVE_RULE.maximum\)/);
  const deferred = sql.slice(sql.indexOf("CREATE FUNCTION formative_activity_submission_complete()"));
  assert.match(deferred, /FROM course_offerings[\s\S]*FOR UPDATE;\s+IF \(SELECT coalesce\(sum\(assigned_weight\), 0\) FROM formative_activities\s+WHERE department_id = package.department_id AND course_offering_id = package.course_offering_id\) > 30.00 THEN/);
  assert.match(deferred, /Current Formative activity configuration exceeds the \/30 budget/);
});
