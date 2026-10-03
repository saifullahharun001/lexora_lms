import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AUTHORIZATION_PROVISIONING_DEFINITIONS, FORMATIVE_ACTIVITIES_FINALISE_PROVISIONING } from "./authorization/authorization-provisioning.definition";
const sql = readFileSync("prisma/migrations/202610020001_chairman_activities_finalisation/migration.sql", "utf8");
const schema = readFileSync("prisma/schema.prisma", "utf8");
test("exact Teacher coarse permission is provisioned once", () => {
  const entries = AUTHORIZATION_PROVISIONING_DEFINITIONS.filter((d) => d.permission.code === "formative.activities.finalise_department");
  assert.deepEqual(entries, [FORMATIVE_ACTIVITIES_FINALISE_PROVISIONING]);
  assert.equal(entries[0]!.targetRoleCode, "teacher");
  assert.equal(entries[0]!.permission.resource, "formative.activities");
  assert.equal(entries[0]!.permission.action, "finalise");
  assert.equal(entries[0]!.permission.scope, "DEPARTMENT");
});
test("additive immutable batch/result/source evidence has restrictive relational bindings", () => {
  for (const model of ["FormativeActivitiesFinalisation", "FormativeActivitiesFinalResult", "FormativeActivitiesFinalSourceItem"])
    assert.ok(schema.includes(`model ${model} {`));
  for (const table of ["formative_activities_finalisations", "formative_activities_final_results", "formative_activities_final_source_items"])
    assert.ok(sql.includes(`BEFORE UPDATE OR DELETE ON ${table}`));
  assert.match(sql, /fa_final_offering_uq UNIQUE/);
  assert.match(sql, /FOREIGN KEY \(submission_id,activity_id,submission_version,submission_fingerprint\)/);
  assert.match(sql, /FOREIGN KEY \(submission_item_id,submission_id,activity_id,mark_evidence_id\)/);
  assert.doesNotMatch(sql, /ON DELETE (CASCADE|SET NULL)|DROP (TABLE|TRIGGER|FUNCTION)|DISABLE TRIGGER|CREATE OR REPLACE/);
});
test("independent deferred validation covers current authority, complete roster/results/sources, arithmetic and audit", () => {
  for (const token of ["DEFERRABLE INITIALLY DEFERRED", "formative_activity_submission_is_current(submission_row.id)",
    "formative_activity_configuration(dept,offering)", "g.scope_json IS DISTINCT FROM scope", "weights<>30",
    "result_row.mark IS DISTINCT FROM", "result_row.source_fingerprint IS DISTINCT FROM", "pg_current_xact_id()::xid",
    "context_json = jsonb_build_object", "g.role_permission_id", "g.permission_id", "g.chairman_assigned_at_snapshot",
    "FORMATIVE_ACTIVITIES_FINAL_30_SUM_V1", "formative_fingerprint_token(v)", 'ORDER BY id COLLATE "C"']) assert.ok(sql.includes(token), token);
  assert.doesNotMatch(sql, /eligibility_status|dropped_at IS NULL|formative_teacher_submissions/);
});
test("academic source freeze is additive and permits historical neutralisation", () => {
  for (const token of ["BEFORE INSERT ON formative_mark_evidence", "BEFORE INSERT ON formative_activity_submissions",
    "BEFORE INSERT OR UPDATE OR DELETE ON formative_activities", "BEFORE INSERT OR UPDATE OR DELETE ON enrollments",
    "roster cannot expand or reactivate", "UPDATE course_offerings SET id=id", "academic identity is frozen"])
    assert.ok(sql.includes(token), token);
  const appointments = sql.slice(sql.indexOf("CREATE FUNCTION formative_final_appointment_identity"));
  assert.doesNotMatch(appointments, /unassigned_at|expires_at|archived_at|status/);
  const identity = sql.slice(sql.indexOf("CREATE FUNCTION formative_final_identity_freeze"), sql.indexOf("CREATE FUNCTION formative_final_appointment_identity"));
  assert.doesNotMatch(identity, /marking_deadline|locked_question_configuration_id|capacity/);
});

test("protected success audits must originate from INSERT and remain immutable", () => {
  const guard = sql.slice(sql.indexOf("CREATE FUNCTION formative_final_audit_guard()"), sql.indexOf("-- Retire appointments normally"));
  assert.match(guard, /IF TG_OP='UPDATE' AND NEW.action='formative.activities.chairman-finalised' THEN\s+RAISE EXCEPTION 'Activities finalisation audit must be inserted' USING ERRCODE='23514'/);
  assert.match(guard, /IF TG_OP<>'INSERT' AND OLD.action='formative.activities.chairman-finalised' THEN\s+RAISE EXCEPTION/);
  assert.match(guard, /NEW.target_id AND xmin=pg_current_xact_id\(\)::xid/);
  assert.match(guard, /BEFORE INSERT OR UPDATE OR DELETE ON audit_logs/);
});
test("disposable DB suite has no ordinary database fallback and requires loopback/test suffix/confirmation", () => {
  const suite = readFileSync("prisma/formative-activities-finalisation.database.test.ts", "utf8");
  assert.match(suite, /LEXORA_FORMATIVE_FINALISATION_TEST_DATABASE_URL/);
  assert.match(suite, /LEXORA_FORMATIVE_FINALISATION_DISPOSABLE_DB_CONFIRM/);
  assert.match(suite, /YES_DISPOSABLE/); assert.match(suite, /127\.0\.0\.1/); assert.match(suite, /_test\$/);
  assert.doesNotMatch(suite, /process\.env\.DATABASE_URL|DISABLE TRIGGER/);
});

test("post-finalisation Enrollment states are restricted to canonical departure/archive states", () => {
  const lifecycle = sql.slice(sql.indexOf("CREATE FUNCTION formative_final_enrollment_freeze"), sql.indexOf("CREATE FUNCTION formative_final_identity_freeze"));
  assert.match(lifecycle, /NEW.status::TEXT NOT IN \('APPROVED','DROPPED','WITHDRAWN','ARCHIVED'\)/);
  assert.match(lifecycle, /OLD.status::TEXT<>'APPROVED' AND NEW.status::TEXT='APPROVED'/);
  assert.match(lifecycle, /OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL/);
  for (const state of ["APPROVED", "DROPPED", "WITHDRAWN", "ARCHIVED"])
    assert.ok(/enum EnrollmentStatus \{([^}]+)\}/.exec(schema)![1]!.includes(state));
});

test("authorization IDs and semantic snapshots are immutable evidence without lifetime live-grant FKs", () => {
  const parent = /model FormativeActivitiesFinalisation \{[\s\S]*?\n\}/.exec(schema)![0];
  for (const field of ["userRoleId", "roleId", "permissionId", "rolePermissionId"]) {
    assert.match(parent, new RegExp(`${field} String`));
    assert.doesNotMatch(parent, new RegExp(`@relation[^\\n]*fields: \\[${field}\\]`));
  }
  assert.doesNotMatch(sql, /REFERENCES (user_roles|roles|permissions|role_permissions)\(/);
  assert.match(sql, /g.authority_snapshot_json IS DISTINCT FROM jsonb_build_object/);
  assert.match(sql, /rp.id=g.role_permission_id AND p.id=g.permission_id/);
  assert.match(sql, /ur.id=g.user_role_id AND ur.role_id=g.role_id/);
});

test("read-only configuration reconstruction preserves exact Step 4A governed semantics", () => {
  const step4a = readFileSync("prisma/migrations/202610010001_add_formative_activity_submission/migration.sql", "utf8");
  const original = step4a.slice(step4a.indexOf("CREATE FUNCTION formative_activity_configuration("), step4a.indexOf("CREATE FUNCTION formative_configuration_fingerprint_tokens(")).trim();
  const readOnly = sql.slice(sql.indexOf("CREATE FUNCTION formative_final_read_configuration("), sql.indexOf("-- Bounded diagnostics")).trim();
  assert.equal(readOnly.replaceAll("\r\n", "\n"), original.replaceAll("\r\n", "\n").replace("formative_activity_configuration(", "formative_final_read_configuration(").replace(" FOR SHARE OF cc, t, c", ""));
  assert.match(sql, /formative_final_scope\(dept,exam,course,offering,true\)/);
  assert.match(sql, /formative_final_scope\(dept,exam,course,offering,false\)/);
});
