import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const prismaRoot = join(process.cwd(), "prisma");
const schema = readFileSync(join(prismaRoot, "schema.prisma"), "utf8");
const migrationBytes = readFileSync(
  join(
    prismaRoot,
    "migrations",
    "202609010002_add_summative_third_examination_referrals",
    "migration.sql",
  ),
);
const migration = migrationBytes.toString("utf8");
const correctiveMigration = readFileSync(
  join(
    prismaRoot,
    "migrations",
    "202609020001_fix_summative_third_referral_integrity_trigger",
    "migration.sql",
  ),
  "utf8",
);
const calculationMigration = readFileSync(
  join(
    prismaRoot,
    "migrations",
    "202609010004_add_summative_three_total_calculations",
    "migration.sql",
  ),
  "utf8",
);
const referral =
  schema.match(/model SummativeThirdExaminationReferral \{[\s\S]*?\n\}/)?.[0] ?? "";

test("Third referral has the exact mapped candidate/comparison/configuration identity", () => {
  assert.match(referral, /@@map\("summative_third_examination_referrals"\)/);
  for (const field of [
    "departmentId",
    "examinationId",
    "examinationCourseId",
    "candidateId",
    "comparisonId",
    "thirdExaminerUserId",
    "questionConfigurationId",
    "comparisonVersionSnapshot",
    "ruleVersionCode",
    "assignmentVersion",
    "assignedAt",
  ]) {
    assert.match(referral, new RegExp(`\\b${field}\\b`));
  }
});

test("owning migration uses restrictive composite academic foreign keys", () => {
  for (const constraint of [
    "summative_third_referral_examination_fkey",
    "summative_third_referral_exam_course_fkey",
    "summative_third_referral_candidate_fkey",
    "summative_third_referral_comparison_fkey",
    "summative_third_referral_config_fkey",
  ]) {
    assert.match(migration, new RegExp(`ADD CONSTRAINT "${constraint}"`));
  }
  assert.doesNotMatch(migration, /ON (?:DELETE|UPDATE) CASCADE/i);
});

test("database trigger requires Third and excludes the exact First/Second Examiners", () => {
  assert.match(migration, /v_decision != 'THIRD_EXAMINATION_REQUIRED'/);
  assert.match(
    migration,
    /NEW\."third_examiner_user_id" IN \(v_first_examiner_id, v_second_examiner_id\)/,
  );
  assert.match(
    migration,
    /JOIN "summative_examiner_mark_submissions" s1[\s\S]*?JOIN "examination_course_examiner_assignments" a1/,
  );
});

test("active referral and candidate assignment versions are independently unique", () => {
  assert.match(migration, /CREATE UNIQUE INDEX "summative_third_referral_candidate_version_uq"/);
  assert.match(migration, /CREATE UNIQUE INDEX "summative_third_referral_active_uq"/);
  assert.match(
    migration,
    /WHERE "status" = 'ASSIGNED'/,
  );
});

test("identity/evidence and positive assignment version are database protected", () => {
  assert.match(migration, /Immutable identity\/evidence fields cannot be modified/);
  assert.match(migration, /NEW\."assignment_version" <= 0/);
  assert.match(
    migration,
    /CREATE TRIGGER "trg_summative_third_referral_integrity"[\s\S]*?BEFORE INSERT OR UPDATE/,
  );
});

test("calculation migration adds the smallest exact referral identity and archived-state reconciliation", () => {
  assert.match(
    calculationMigration,
    /ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP\(3\)/,
  );
  assert.match(
    referral,
    /@@unique\(\[id, departmentId, examinationId, examinationCourseId, candidateId, comparisonId, questionConfigurationId\], map: "summative_third_referral_calc_scope_uq"\)/,
  );
  assert.match(
    calculationMigration,
    /CREATE UNIQUE INDEX "summative_third_referral_calc_scope_uq"/,
  );
});

test("committed Third-referral migration remains byte-for-byte unchanged", () => {
  assert.equal(
    createHash("sha256").update(migrationBytes).digest("hex"),
    "c2c7e68f03f016926068eaa23c5e72cff5cc5d675222691630d03fba5770c601",
  );
});

test("corrective migration replaces only the Third-referral function with real assignment columns", () => {
  const functionPattern =
    /CREATE OR REPLACE FUNCTION "summative_third_referral_integrity_check"\(\)[\s\S]*?\$\$ LANGUAGE plpgsql;/;
  const historicalFunction = migration.match(functionPattern)?.[0];
  const correctiveFunction = correctiveMigration.match(functionPattern)?.[0];
  assert.ok(historicalFunction);
  assert.ok(correctiveFunction);
  const expectedCorrectiveFunction = historicalFunction
    .replace('a1."assignee_user_id"', 'a1."assigned_user_id"')
    .replace('a2."assignee_user_id"', 'a2."assigned_user_id"');
  const normalizeLineEndings = (sql: string) => sql.replace(/\r\n?/g, "\n");
  assert.equal(
    normalizeLineEndings(correctiveFunction),
    normalizeLineEndings(expectedCorrectiveFunction),
  );
  assert.match(
    correctiveMigration,
    /CREATE OR REPLACE FUNCTION "summative_third_referral_integrity_check"\(\)/,
  );
  assert.match(correctiveMigration, /a1\."assigned_user_id"/);
  assert.match(correctiveMigration, /a2\."assigned_user_id"/);
  assert.doesNotMatch(correctiveMigration, /assignee_user_id/);
  assert.match(
    migration,
    /CREATE TRIGGER "trg_summative_third_referral_integrity"[\s\S]*?EXECUTE FUNCTION "summative_third_referral_integrity_check"\(\)/,
  );
  assert.doesNotMatch(correctiveMigration, /(?:DROP|CREATE)\s+TRIGGER/i);
  assert.doesNotMatch(
    correctiveMigration,
    /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?summative_third_examination_referrals"?/i,
  );
});

test("all explicit owning and additive identifiers fit PostgreSQL's 63-byte limit", () => {
  const identifiers = Array.from(
    `${migration}\n${calculationMigration}`.matchAll(
      /(?:INDEX|CONSTRAINT|TRIGGER|FUNCTION) "([^"]+)"/g,
    ),
  ).map((match) => match[1]!);
  assert.ok(identifiers.length > 0);
  for (const identifier of identifiers) {
    assert.ok(Buffer.byteLength(identifier, "utf8") <= 63, identifier);
  }
});
test("Prisma Third-referral native types and assigned-at mapping match migration 0002", () => {
  assert.match(
    referral,
    /comparisonVersionSnapshot\s+Int[\s\S]*?@map\("comparison_version_snapshot"\)\s+@db\.SmallInt/,
  );
  assert.match(
    referral,
    /ruleVersionCode\s+String[\s\S]*?@map\("rule_version_code"\)\s+@db\.VarChar\(64\)/,
  );
  assert.match(
    referral,
    /assignmentVersion\s+Int[\s\S]*?@map\("assignment_version"\)\s+@db\.SmallInt/,
  );
  assert.match(
    referral,
    /assignedAt\s+DateTime[\s\S]*?@default\(now\(\)\)[\s\S]*?@map\("assigned_at"\)/,
  );

  assert.match(migration, /"comparison_version_snapshot"\s+SMALLINT/);
  assert.match(migration, /"rule_version_code"\s+VARCHAR\(64\)/);
  assert.match(migration, /"assignment_version"\s+SMALLINT/);
  assert.match(
    migration,
    /"assigned_at"\s+TIMESTAMP\(3\)\s+NOT NULL\s+DEFAULT CURRENT_TIMESTAMP/,
  );
});
