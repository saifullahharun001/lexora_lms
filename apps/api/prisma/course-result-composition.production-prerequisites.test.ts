import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { maintenanceDatabaseCommand, productionOptions, validateLedger } from "./fixtures/course-composition-production-harness";
import { COMPOSITION_MIGRATION, PRE_COMPOSITION_MIGRATIONS, PRODUCTION_CASES } from "./fixtures/course-composition-production-baseline";

const env = { LEXORA_CRC_PRODUCTION_TEST_DATABASE_URL: "postgresql://fixture@127.0.0.1:55432/crc_baseline_test",
  LEXORA_CRC_MAINTENANCE_DATABASE_URL: "postgresql://fixture@127.0.0.1:55432/crc_maintenance_test",
  LEXORA_CRC_MAINTENANCE_EXPECTED_DATABASE: "crc_maintenance_test",
  LEXORA_CRC_PRODUCTION_EXPECTED_DATABASE: "crc_baseline_test", LEXORA_CRC_PRODUCTION_CONFIRM: "YES_DISPOSABLE_SANITIZED_BASELINE",
  LEXORA_CRC_BASELINE_SHA256: "a".repeat(64) };
test("production campaign requires explicit independently approved disposable baseline", () => {
  assert.equal(productionOptions(env).database, "crc_baseline_test");
  for (const key of Object.keys(env)) assert.throws(() => productionOptions({ ...env, [key]: undefined }));
  for (const raw of ["bad", "postgresql://fixture@remote.invalid/crc_baseline_test",
    "postgresql://fixture@localhost/lexora_lms", `${env.LEXORA_CRC_PRODUCTION_TEST_DATABASE_URL}?host=remote.invalid`,
    `${env.LEXORA_CRC_PRODUCTION_TEST_DATABASE_URL}?schema=other`, `${env.LEXORA_CRC_PRODUCTION_TEST_DATABASE_URL}?schema=public&schema=public`])
    assert.throws(() => productionOptions({ ...env, LEXORA_CRC_PRODUCTION_TEST_DATABASE_URL: raw }));
});
test("maintenance connection rejects baseline, clone, canonical and alternate server targets", () => {
  const clone = `crc_${"a".repeat(32)}_test`;
  for (const database of ["crc_baseline_test", clone, "lexora_lms", "postgres"]) {
    assert.throws(() => productionOptions({ ...env,
      LEXORA_CRC_MAINTENANCE_DATABASE_URL: `postgresql://fixture@127.0.0.1:55432/${database}`,
      LEXORA_CRC_MAINTENANCE_EXPECTED_DATABASE: database }));
  }
  for (const raw of ["bad", env.LEXORA_CRC_MAINTENANCE_DATABASE_URL.replace("127.0.0.1", "remote.invalid"),
    env.LEXORA_CRC_MAINTENANCE_DATABASE_URL.replace("55432", "55433"),
    env.LEXORA_CRC_MAINTENANCE_DATABASE_URL.replace("fixture@", "other@"),
    `${env.LEXORA_CRC_MAINTENANCE_DATABASE_URL}?host=remote.invalid`,
    `${env.LEXORA_CRC_MAINTENANCE_DATABASE_URL}?schema=private`,
    `${env.LEXORA_CRC_MAINTENANCE_DATABASE_URL}?schema=public&schema=public`,
    `${env.LEXORA_CRC_MAINTENANCE_DATABASE_URL}#fragment`])
    assert.throws(() => productionOptions({ ...env, LEXORA_CRC_MAINTENANCE_DATABASE_URL: raw }));
  assert.equal(productionOptions(env).maintenanceDatabase, "crc_maintenance_test");
});

test("database DDL uses maintenance only and validates its actual identity before every operation", async () => {
  const queries: string[] = [];
  let actualDatabase = "crc_maintenance_test";
  const maintenance = {
    $queryRaw: async () => [{ database: actualDatabase, version: "180006" }],
    $executeRawUnsafe: async (sql: string) => { queries.push(sql); return 1; },
  } as unknown as Parameters<typeof maintenanceDatabaseCommand>[0];
  const clone = `crc_${"a".repeat(32)}_test`;
  const child = `crc_${"b".repeat(32)}_test`;
  await maintenanceDatabaseCommand(maintenance, actualDatabase, "CREATE", clone, "crc_baseline_test");
  await maintenanceDatabaseCommand(maintenance, actualDatabase, "CREATE", child, clone);
  await maintenanceDatabaseCommand(maintenance, actualDatabase, "DROP", child);
  assert.deepEqual(queries, [`CREATE DATABASE "${clone}" TEMPLATE "crc_baseline_test"`,
    `CREATE DATABASE "${child}" TEMPLATE "${clone}"`, `DROP DATABASE "${child}"`]);
  await assert.rejects(maintenanceDatabaseCommand(maintenance, actualDatabase, "CREATE", clone, actualDatabase));
  await assert.rejects(maintenanceDatabaseCommand(maintenance, actualDatabase, "DROP", "crc_baseline_test"));
  for (const wrongDatabase of ["crc_baseline_test", clone, "lexora_lms"]) {
    actualDatabase = wrongDatabase;
    await assert.rejects(maintenanceDatabaseCommand(maintenance, "crc_maintenance_test", "CREATE", child, wrongDatabase));
    await assert.rejects(maintenanceDatabaseCommand(maintenance, "crc_maintenance_test", "DROP", child));
  }
  assert.equal(queries.length, 3, "Rejected operations must never execute DDL");
});

test("baseline readers disconnect before cloning and are never reused for DDL", () => {
  const harness = readFileSync("prisma/fixtures/course-composition-production-harness.ts", "utf8");
  assert.match(harness, /baseline\.\$transaction\(async \(admin\) => \{\s*await admin\.\$executeRaw`SET TRANSACTION READ ONLY`/);
  assert.ok(harness.indexOf("await baseline.$disconnect();") < harness.indexOf("const template = await clone(options.database)"));
  assert.doesNotMatch(harness, /(?:baseline|admin)\.\$executeRawUnsafe/);
  assert.equal((harness.match(/maintenanceDatabaseCommand\(maintenance, options\.maintenanceDatabase/g) || []).length, 2);
  assert.match(harness, /does not independently prove archive integrity/);
});

test("historical migration allowlist excludes ignored duplicate and requires real source migrations", () => {
  assert.equal(new Set(PRE_COMPOSITION_MIGRATIONS).size, PRE_COMPOSITION_MIGRATIONS.length);
  assert.ok(!PRE_COMPOSITION_MIGRATIONS.includes("202608290001_add_external_committee_member" as never));
  for (const name of ["202608290004_add_summative_examiner_marks", "202609020002_add_summative_calculated_committee_approval",
    "202610060001_automatic_final_formative"]) assert.ok(PRE_COMPOSITION_MIGRATIONS.includes(name as never));
  assert.equal(PRODUCTION_CASES.length, 6);
});
test("migration ledger accepts 41 applied plus two known rollbacks and EOL equivalence", () => {
  const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
  type Row = { migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null };
  const applied = (name: string): Row => ({ migration_name: name,
    checksum: hash(readFileSync(`prisma/migrations/${name}/migration.sql`)),
    finished_at: new Date("2026-10-07"), rolled_back_at: null });
  const rollback = (name: string): Row => ({ migration_name: name, checksum: "a".repeat(64),
    finished_at: null, rolled_back_at: new Date("2026-09-01") });
  const rows: Row[] = PRE_COMPOSITION_MIGRATIONS.map(applied);
  rows.push(rollback("202608210001_add_course_offering_student_batch_binding_foundation"));
  rows.push(rollback("202609020001_fix_summative_third_referral_integrity_trigger"));
  validateLedger(rows, false);
  assert.throws(() => validateLedger(rows.slice(1), false));
  assert.throws(() => validateLedger([...rows, applied(rows[0]!.migration_name)], false));
  assert.throws(() => validateLedger([...rows.slice(0, -1), rollback("unrecognized")], false));
  const invalidRollback = rows.map((r) => ({ ...r }));
  invalidRollback[invalidRollback.length - 1]!.rolled_back_at = null;
  assert.throws(() => validateLedger(invalidRollback, false));
  const wrong = rows.map((r) => ({ ...r })); wrong[0]!.checksum = "f".repeat(64);
  assert.throws(() => validateLedger(wrong, false));
  const failed = rows.map((r) => ({ ...r })); failed[0]!.finished_at = null;
  assert.throws(() => validateLedger(failed, false));
  const source = readFileSync(`prisma/migrations/${rows[0]!.migration_name}/migration.sql`, "utf8");
  const lf = source.replace(/\r\n/g, "\n");
  for (const normalized of [lf, lf.replace(/\n/g, "\r\n")]) {
    const equivalent = rows.map((r) => ({ ...r })); equivalent[0]!.checksum = hash(normalized);
    validateLedger(equivalent, false);
  }
  assert.throws(() => validateLedger(rows, true));
  validateLedger([...rows, applied(COMPOSITION_MIGRATION)], true);
});

test("production suite uses actual principal, authority, calculation and Chairman service with no schema substitute", () => {
  const suite = readFileSync("prisma/course-result-composition.production.test.ts", "utf8");
  for (const name of ["new PrincipalLoaderService", "new SummativeCommitteeWorkflowAuthorizerService",
    "new SummativeCalculatedMarkService", "new SummativeCommitteeWorkflowService", ".approveAndFinalLock", ".submitMemberReview"])
    assert.ok(suite.includes(name), name);
  const harness = readFileSync("prisma/fixtures/course-composition-production-harness.ts", "utf8");
  assert.doesNotMatch(suite + harness, /DISABLE TRIGGER|session_replication_role|"db",\s*"push"|"migrate",\s*"resolve"|CREATE TABLE summative_/i);
  assert.match(harness, /Second deployment must leave the ledger byte-for-byte unchanged/);
  assert.match(harness, /Actual database function body must match the real migration/);
  assert.match(harness, /180006/);
});
