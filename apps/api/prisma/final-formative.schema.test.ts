import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "prisma/migrations/202610060001_automatic_final_formative/migration.sql";
const sql = readFileSync(migrationPath, "utf8");
test("Comprehensive cardinality CASE expressions cannot terminate the PL/pgSQL IF condition", () => {
  const start = sql.indexOf("IF co.id IS NULL");
  assert.ok(start >= 0);
  const condition = sql.slice(start, sql.indexOf("THEN RAISE EXCEPTION 'Invalid Final Formative Comprehensive result package'", start));
  // PL/pgSQL reads IF up to the first THEN at parenthesis depth zero. Bare CASE
  // exposes its internal THEN and causes SQLSTATE 42601 before any fixture assertion.
  assert.doesNotMatch(condition, /<>\s*CASE\b/);
  assert.equal((condition.match(/<>\s*\(CASE WHEN cf\.mode::text='ALL_MEMBERS_AVERAGE' THEN 4 ELSE 1 END\)/g) ?? []).length, 2);
});

test("Final Formative additive migration has complete immutable evidence, restrictive identity and exact arithmetic", () => {
  assert.match(sql, /^BEGIN;/); assert.match(sql, /COMMIT;\s*$/);
  assert.equal((sql.match(/CREATE TABLE /g) ?? []).length, 1);
  assert.equal((sql.match(/ON DELETE RESTRICT ON UPDATE RESTRICT/g) ?? []).length, 10);
  assert.doesNotMatch(sql, /ON DELETE (CASCADE|SET NULL)|DROP (TABLE|TRIGGER|FUNCTION)|DISABLE TRIGGER|CREATE OR REPLACE|INSERT INTO formative_final_results/);
  for (const token of ["ff_context_uq", "mark=activities_mark+attendance_mark+comprehensive_mark", "DECIMAL(10,6)",
    "FINAL_FORMATIVE_40_SUM_V1", "BEFORE UPDATE OR DELETE ON formative_final_results", "DEFERRABLE INITIALLY DEFERRED",
    "xmin=pg_current_xact_id()::xid", "Final Formative audit is immutable", "transaction_isolation", "serializable"])
    assert.ok(sql.includes(token), token);
});
test("protected success audits require INSERT and cannot be converted by UPDATE", () => {
  const guard = sql.match(/CREATE FUNCTION final_formative_audit_guard\(\)[\s\S]*?\$\$;/)?.[0];
  assert.ok(guard, "Final Formative audit guard must exist");
  const branches = guard.match(/IF TG_OP='INSERT' THEN([\s\S]*?)ELSIF TG_OP='UPDATE' THEN([\s\S]*?)ELSIF TG_OP='DELETE' THEN([\s\S]*?)END;\s*\$\$;/);
  assert.ok(branches, "Audit guard must explicitly separate INSERT, UPDATE and DELETE");
  const [, insert, update, deletion] = branches;
  assert.match(insert!, /IF NEW\.action='formative\.final\.materialised' THEN\s+PERFORM id FROM formative_final_results WHERE id=NEW\.target_id AND department_id=NEW\.department_id\s+AND xmin=pg_current_xact_id\(\)::xid;/);
  assert.match(insert!, /IF NOT FOUND OR EXISTS\(SELECT 1 FROM audit_logs WHERE action=NEW\.action AND target_id=NEW\.target_id\) THEN\s+RAISE EXCEPTION 'Final Formative audit requires its new aggregate' USING ERRCODE='23514'; END IF;/);
  assert.match(update!, /^\s*IF OLD\.action='formative\.final\.materialised' OR NEW\.action='formative\.final\.materialised' THEN\s+RAISE EXCEPTION 'Final Formative audit is immutable' USING ERRCODE='23514'; END IF;\s*$/);
  assert.match(deletion!, /IF OLD\.action='formative\.final\.materialised' THEN\s+RAISE EXCEPTION 'Final Formative audit is immutable' USING ERRCODE='23514'; END IF;\s+RETURN OLD;/);
  assert.doesNotMatch(update! + deletion!, /PERFORM|FROM formative_final_results/);
  assert.doesNotMatch(guard, /TG_OP\s*<>/);
  assert.match(sql, /CREATE TRIGGER ff_audit_guard BEFORE INSERT OR UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION final_formative_audit_guard\(\);/);
});

test("source contract consumes exact authoritative packages without raw evidence calculators", () => {
  for (const token of ["formative_activities_final_results", "formative_attendance_generations", "formative_attendance_versions",
    "comprehensive_finalisations", "comprehensive_final_results", "registration_version", "student_curriculum_assignments",
    "activitiesSources", "attendanceRevision", "comprehensiveSources"])
    assert.ok(sql.includes(token), token);
  assert.doesNotMatch(sql, /attendance_records|class_sessions|AVG\(|SUM\(|formative_final_sources\(|attendance_mark_for/);
});
test("new migration byte identity is protected and migration is not ignored", () => {
  const attributes = readFileSync("../../.gitattributes", "utf8");
  assert.ok(attributes.includes(`apps/api/${migrationPath} -text`));
  assert.ok(readFileSync("../../.gitignore", "utf8").includes(`!apps/api/${migrationPath}`));
});
test("internal module has no HTTP route and all source owners import the shared module", () => {
  const module = readFileSync("src/modules/final-formative/final-formative.module.ts", "utf8");
  assert.doesNotMatch(module, /controllers|AssessmentModule|AttendanceModule/);
  for (const name of ["assessment", "attendance"])
    assert.match(readFileSync(`src/modules/${name}/${name}.module.ts`, "utf8"), /FinalFormativeModule/);
});
