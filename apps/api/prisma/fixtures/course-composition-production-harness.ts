import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Prisma, PrismaClient } from "@prisma/client";
import { COMPOSITION_MIGRATION, PRE_COMPOSITION_MIGRATIONS, PRODUCTION_CASES } from "./course-composition-production-baseline";
import { resolveLiveFixtureIds } from "./course-composition-fixture-resolver";
import { composeFinalFormative } from "../../src/modules/final-formative/domain/final-formative.rules";

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
export function productionOptions(env: NodeJS.ProcessEnv) {
  if (env.LEXORA_CRC_PRODUCTION_CONFIRM !== "YES_DISPOSABLE_SANITIZED_BASELINE") throw Error("Explicit disposable baseline approval is required");
  const raw = env.LEXORA_CRC_PRODUCTION_TEST_DATABASE_URL;
  if (!raw) throw Error("Dedicated production-shaped test connection is required");
  let url: URL;
  try { url = new URL(raw); } catch { throw Error("Invalid disposable connection"); }
  let database: string;
  try { database = decodeURIComponent(url.pathname.slice(1)); } catch { throw Error("Invalid disposable database identity"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^[a-zA-Z0-9_]+_test$/.test(database) || database !== env.LEXORA_CRC_PRODUCTION_EXPECTED_DATABASE ||
    database.toLowerCase() === "lexora_lms" || url.hash ||
    [...url.searchParams.keys()].some((key) => key !== "schema") ||
    url.searchParams.getAll("schema").length > 1 || (url.searchParams.get("schema") || "public") !== "public")
    throw Error("Production-shaped tests require exact dedicated loopback test infrastructure");
  const digest = env.LEXORA_CRC_BASELINE_SHA256;
  if (!digest || !/^[a-f0-9]{64}$/.test(digest)) throw Error("Independently approved sanitized archive digest is required");
  const maintenanceRaw = env.LEXORA_CRC_MAINTENANCE_DATABASE_URL;
  if (!maintenanceRaw) throw Error("Explicit dedicated maintenance connection is required");
  let maintenanceUrl: URL;
  let maintenanceDatabase: string;
  try { maintenanceUrl = new URL(maintenanceRaw); maintenanceDatabase = decodeURIComponent(maintenanceUrl.pathname.slice(1)); }
  catch { throw Error("Invalid maintenance connection"); }
  if (!["postgres:", "postgresql:"].includes(maintenanceUrl.protocol) ||
    maintenanceUrl.hostname !== url.hostname || (maintenanceUrl.port || "5432") !== (url.port || "5432") ||
    maintenanceUrl.username !== url.username || maintenanceUrl.hash ||
    !/^[a-zA-Z0-9_]+_test$/.test(maintenanceDatabase) || /^crc_[a-f0-9]{32}_test$/.test(maintenanceDatabase) ||
    maintenanceDatabase === database || maintenanceDatabase !== env.LEXORA_CRC_MAINTENANCE_EXPECTED_DATABASE ||
    [...maintenanceUrl.searchParams.keys()].some((key) => key !== "schema") ||
    maintenanceUrl.searchParams.getAll("schema").length > 1 || (maintenanceUrl.searchParams.get("schema") || "public") !== "public")
    throw Error("Maintenance must use a separate exact dedicated database on the same loopback server and role");
  return { raw, database, digest, maintenanceRaw, maintenanceDatabase };
}

/** Every database DDL operation checks the actual connection, not just its URL. */
export async function maintenanceDatabaseCommand(
  maintenance: Pick<PrismaClient, "$queryRaw" | "$executeRawUnsafe">,
  expectedDatabase: string, operation: "CREATE" | "DROP", name: string, template?: string,
) {
  assert.match(expectedDatabase, /^[a-zA-Z0-9_]+_test$/);
  assert.doesNotMatch(expectedDatabase, /^crc_[a-f0-9]{32}_test$/);
  assert.match(name, /^crc_[a-f0-9]{32}_test$/);
  assert.notEqual(expectedDatabase, name);
  if (operation === "CREATE") {
    assert.match(template!, /^[a-zA-Z0-9_]+_test$/);
    assert.notEqual(expectedDatabase, template, "Maintenance must never connect to the template database");
  } else { assert.equal(operation, "DROP"); assert.equal(template, undefined); }
  const [identity] = await maintenance.$queryRaw<Array<{ database: string; version: string }>>`
    SELECT current_database() AS database, current_setting('server_version_num') AS version`;
  assert.equal(identity?.database, expectedDatabase, "Actual maintenance database must match its validated identity");
  assert.equal(identity?.version, "180006");
  await maintenance.$executeRawUnsafe(operation === "CREATE"
    ? `CREATE DATABASE "${name}" TEMPLATE "${template}"` : `DROP DATABASE "${name}"`);
}

type Ledger = { migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null };
const ledger = (db: Prisma.TransactionClient) => db.$queryRaw<Ledger[]>`
  SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name`;
const ledgerDigest = (db: PrismaClient) => db.$queryRaw<Array<{ digest: string }>>`
  SELECT md5(COALESCE(string_agg(to_jsonb(m)::text, '' ORDER BY migration_name),'')) AS digest FROM _prisma_migrations m`;
/** Accept only the verified 41 applied plus two explicit historical rollbacks.
 * LF/CRLF checksum equivalence is restricted to APPLIED migration bytes.
 * This is NOT an attestation of baseline archive content or synthetic fixtures.
 */
export function validateLedger(rows: Ledger[], includeComposition: boolean) {
  const expected = includeComposition
    ? [...PRE_COMPOSITION_MIGRATIONS, COMPOSITION_MIGRATION]
    : [...PRE_COMPOSITION_MIGRATIONS];
  const expectedNames = new Set<string>(expected);
  const historicalRollbacks = new Set([
    "202608210001_add_course_offering_student_batch_binding_foundation",
    "202609020001_fix_summative_third_referral_integrity_trigger",
  ]);
  assert.equal(expectedNames.size, expected.length, "Migration allowlist duplicates");
  assert.equal(rows.length, expected.length + historicalRollbacks.size,
    "Unexpected migration history count");
  for (const row of rows) {
    assert.ok(expectedNames.has(row.migration_name), "Unknown migration history entry");
  }
  for (const name of expected) {
    const entries = rows.filter((row) => row.migration_name === name);
    const applied = entries.filter((row) => row.finished_at !== null && row.rolled_back_at === null);
    const rolledBack = entries.filter((row) => row.finished_at === null && row.rolled_back_at !== null);
    assert.equal(applied.length, 1, "Expected exactly one applied migration");
    assert.equal(rolledBack.length, historicalRollbacks.has(name) ? 1 : 0,
      "Unexpected rollback attempt");
    assert.equal(entries.length, applied.length + rolledBack.length,
      "Unresolved or contradictory migration state");
    const bytes = readFileSync(`prisma/migrations/${name}/migration.sql`);
    const text = bytes.toString("utf8");
    const lf = text.replace(/\r\n/g, "\n");
    const equivalentChecksums = new Set([
      sha256(bytes), sha256(Buffer.from(lf, "utf8")),
      sha256(Buffer.from(lf.replace(/\n/g, "\r\n"), "utf8")),
    ]);
    assert.ok(equivalentChecksums.has(applied[0]!.checksum.toLowerCase()),
      "Applied migration checksum differs beyond line endings");
  }
}

async function sourceDigest(db: Prisma.TransactionClient) {
  // Compare hashes only; never return raw academic rows to the test logger.
  return db.$queryRaw<Array<{ digest: string }>>`
    SELECT md5(COALESCE(string_agg(item, '' ORDER BY item COLLATE "C"),'')) AS digest FROM (
      SELECT 'calculated:' || to_jsonb(m)::text AS item FROM summative_calculated_marks m
      UNION ALL SELECT 'approval:' || to_jsonb(a)::text FROM summative_chairman_approvals a
      UNION ALL SELECT 'formative:' || to_jsonb(f)::text FROM formative_final_results f
      UNION ALL SELECT 'activities:' || to_jsonb(ar)::text FROM formative_activities_final_results ar
      UNION ALL SELECT 'attendance:' || to_jsonb(av)::text FROM formative_attendance_versions av
      UNION ALL SELECT 'comprehensive:' || to_jsonb(cr)::text FROM comprehensive_final_results cr
    ) source_rows`;
}
async function verifyRealProtections(db: Prisma.TransactionClient) {
  const rows = await db.$queryRaw<Array<{ name: string; enabled: string }>>`
    SELECT tgname AS name, tgenabled AS enabled FROM pg_trigger WHERE NOT tgisinternal`;
  for (const name of ["summative_candidate_identity_immutable_trg", "summative_chairman_approval_validate_trg",
    "summative_calculated_mark_validate_trg", "summative_member_review_validate_trg",
    "ff_insert", "ff_immutable", "ff_package_validate", "ff_audit_guard"])
    assert.ok(rows.some((row) => row.name === name && ["O", "A"].includes(row.enabled)), `Real enabled source protection required: ${name}`);
  const functions = await db.$queryRaw<Array<{ name: string; body: string }>>`
    SELECT p.proname AS name, p.prosrc AS body FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'`;
  for (const [name, migration] of [
    ["lexora_validate_summative_chairman_approval", "202609020002_add_summative_calculated_committee_approval"],
    ["lexora_validate_summative_calculated_mark", "202609020002_add_summative_calculated_committee_approval"],
    ["lexora_validate_summative_member_review", "202609020002_add_summative_calculated_committee_approval"],
    ["lexora_guard_summative_candidate_identity", "202608290004_add_summative_examiner_marks"],
    ["final_formative_sources", "202610060001_automatic_final_formative"],
    ["final_formative_validate", "202610060001_automatic_final_formative"],
    ["final_formative_audit_guard", "202610060001_automatic_final_formative"],
  ]) {
    const sql = readFileSync(`prisma/migrations/${migration}/migration.sql`, "utf8");
    const match = sql.match(new RegExp(`CREATE FUNCTION "?${name}"?\\([\\s\\S]*?\\bAS (\\$[a-zA-Z_]*\\$)([\\s\\S]*?)\\1`));
    assert.ok(match, "Real function must be present in its historical migration");
    const rows = functions.filter((row) => row.name === name); assert.equal(rows.length, 1);
    assert.equal(sha256(rows[0]!.body.replaceAll("\r\n", "\n").trim()), sha256(match[2]!.replaceAll("\r\n", "\n").trim()),
      "Actual database function body must match the real migration, not a permissive substitute");
  }
}

/** Never changes baseline data or its migration ledger. No restore/reset/db-push. */
export async function productionCampaign(options: ReturnType<typeof productionOptions>) {
  const baseline = new PrismaClient({ datasourceUrl: options.raw });
  const maintenanceUrl = new URL(options.maintenanceRaw); maintenanceUrl.searchParams.set("connection_limit", "1");
  const maintenance = new PrismaClient({ datasourceUrl: maintenanceUrl.toString() });
  const created = new Set<string>();
  let migrationDirectory: string | undefined;
  const removeTemporaryMigrations = () => {
    if (!migrationDirectory) return;
    const resolved = path.resolve(migrationDirectory);
    assert.equal(path.dirname(resolved).toLowerCase(), path.resolve(tmpdir()).toLowerCase());
    assert.ok(path.basename(resolved).startsWith("lexora-crc-migrations-"));
    rmSync(resolved, { recursive: true });
  };
  const targetUrl = (name: string) => { const url = new URL(options.raw); url.pathname = `/${name}`; return url.toString(); };
  async function clone(template: string) {
    const name = `crc_${randomUUID().replaceAll("-", "")}_test`;
    assert.ok(template === options.database || created.has(template), "Template must be the baseline or an owned clone");
    await maintenanceDatabaseCommand(maintenance, options.maintenanceDatabase, "CREATE", name, template);
    created.add(name); return name;
  }
  async function drop(name: string) {
    if (!created.has(name)) throw Error("Refusing to remove a database not created by this invocation");
    await maintenanceDatabaseCommand(maintenance, options.maintenanceDatabase, "DROP", name); created.delete(name);
    const remaining = await maintenance.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM pg_database WHERE datname=${name}`;
    assert.equal(remaining[0]?.n, 0n);
  }
  async function deploy(name: string) {
    const schema = path.join(migrationDirectory!, "schema.prisma");
    try {
      // Exact allowlisted historical chain, excluding ignored duplicate/scratch files.
      // Outputs are deliberately captured and never printed: Prisma errors can contain URLs.
      await promisify(execFile)(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "deploy", "--schema", schema], {
        cwd: migrationDirectory, windowsHide: true, timeout: 120000,
        env: { ...process.env, DATABASE_URL: targetUrl(name), DATABASE_DIRECT_URL: targetUrl(name) }, maxBuffer: 4 * 1024 * 1024,
      });
    } catch { throw Error("Disposable migration deployment failed; no child output or connection details were logged"); }
  }
  try {
    // All baseline inspection is read only; this client is never used for database DDL.
    const before = await baseline.$transaction(async (admin) => {
      await admin.$executeRaw`SET TRANSACTION READ ONLY`;
      const [identity] = await admin.$queryRaw<Array<{ database: string; version: string; approval: string | null }>>`
        SELECT current_database() AS database, current_setting('server_version_num') AS version,
          shobj_description(oid,'pg_database') AS approval FROM pg_database WHERE datname=current_database()`;
      assert.equal(identity?.database, options.database); assert.equal(identity?.version, "180006");
      // This COMMENT is only an approval marker. Separate documented verification of
      // the actual sanitized archive bytes and restoration is required; a matching
      // marker does not independently prove archive integrity.
      assert.equal(identity?.approval, `LEXORA_CRC_APPROVED_SYNTHETIC:${options.digest}`, "Independent baseline approval marker required");
      validateLedger(await ledger(admin), false);
      await verifyRealProtections(admin);
      assert.equal(await admin.user.count({ where: { OR: [
        { id: { not: { startsWith: "crc_fixture_" } } }, { normalizedEmail: { not: { endsWith: "@crc-fixture.invalid" } } },
        { passwordHash: { not: null } },
      ] } }), 0, "Baseline must contain only non-sensitive synthetic users without credentials");
      for (const count of [await admin.session.count(), await admin.emailVerification.count(), await admin.passwordReset.count(),
        await admin.twoFactorMethod.count(), await admin.transcriptVerificationToken.count()])
        assert.equal(count, 0, "Baseline must contain no authentication, recovery, 2FA or verification secrets");
      assert.equal(await admin.formativeFinalResult.count(), 0, "Baseline must precede both terminal owners");
      assert.equal(await admin.summativeChairmanApproval.count(), 0);
      assert.equal(await admin.summativeCommitteeMemberReview.count(), 0);
      const chairmen = new Set<string>();
      for (const scenario of PRODUCTION_CASES) {
        const ids = await resolveLiveFixtureIds(admin as unknown as PrismaClient, scenario.key);
        const [f] = await admin.$queryRaw<Array<{ sources: { activitiesMark: string; attendanceMark: string; comprehensiveMark: string } | null }>>`
          SELECT final_formative_sources(${ids.departmentId},${ids.examinationCourseId},${ids.enrollmentId}) AS sources`;
        assert.ok(f?.sources, "Synthetic fixture must contain all valid REAL Formative source parents");
        assert.equal(composeFinalFormative(f.sources.activitiesMark, f.sources.attendanceMark, f.sources.comprehensiveMark).toString(), scenario.formative);
        const m = await admin.summativeCalculatedMark.findUniqueOrThrow({ where: { id: ids.calculatedMarkId } });
        assert.equal(m.departmentId, ids.departmentId); assert.equal(m.examinationId, ids.examinationId);
        assert.equal(m.examinationCourseId, ids.examinationCourseId); assert.equal(m.candidateId, ids.candidateId);
        assert.equal(m.derivedSummativeValue.toString(), scenario.summative); assert.equal(m.summativeFullMarkSnapshot.toString(), "60");
        const chair = await admin.examinationCommitteeAssignment.findMany({ where: { examinationId: ids.examinationId,
          departmentId: ids.departmentId, seat: "CHAIRMAN", status: "ACTIVE" }, select: { assignedUserId: true } });
        assert.equal(chair.length, 1); assert.ok(chair[0]?.assignedUserId);
        assert.equal(chairmen.has(chair[0].assignedUserId), false, "Fixtures must use a distinct Chairman per examination for wrong-object authorization probes");
        chairmen.add(chair[0].assignedUserId);
      }
      return sourceDigest(admin);
    }, { timeout: 60000 });
    await baseline.$disconnect();
    migrationDirectory = mkdtempSync(path.join(tmpdir(), "lexora-crc-migrations-"));
    copyFileSync("prisma/schema.prisma", path.join(migrationDirectory, "schema.prisma"));
    mkdirSync(path.join(migrationDirectory, "migrations"));
    writeFileSync(path.join(migrationDirectory, "migrations/migration_lock.toml"), 'provider = "postgresql"\n');
    for (const name of [...PRE_COMPOSITION_MIGRATIONS, COMPOSITION_MIGRATION]) {
      const directory = path.join(migrationDirectory, "migrations", name); mkdirSync(directory);
      copyFileSync(`prisma/migrations/${name}/migration.sql`, path.join(directory, "migration.sql"));
    }
    // PostgreSQL cannot clone a template with active sessions. Disconnect this harness's
    // baseline reader; it never terminates someone else's session or forces a DROP.
    const template = await clone(options.database);
    const migrated = new PrismaClient({ datasourceUrl: targetUrl(template) });
    try {
      await deploy(template); validateLedger(await ledger(migrated), true);
      const first = await ledgerDigest(migrated);
      await deploy(template); assert.deepEqual(await ledgerDigest(migrated), first, "Second deployment must leave the ledger byte-for-byte unchanged");
      assert.deepEqual(await sourceDigest(migrated), before, "Migration must preserve all existing academic evidence");
      await verifyRealProtections(migrated);
      const fks = await migrated.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*) AS n FROM pg_constraint WHERE conrelid='course_result_compositions'::regclass AND contype='f' AND convalidated`;
      assert.equal(fks[0]?.n, 12n);
    } finally { await migrated.$disconnect(); }
    return {
      async fixture(work: (db: PrismaClient, raw: string) => Promise<void>) {
        const name = await clone(template); const db = new PrismaClient({ datasourceUrl: targetUrl(name) });
        try { await work(db, targetUrl(name)); }
        finally { await db.$disconnect(); await drop(name); }
      },
      async close() {
        try { for (const name of [...created].reverse()) await drop(name); }
        finally { await maintenance.$disconnect(); removeTemporaryMigrations(); }
      },
    };
  } catch (error) {
    try { for (const name of [...created].reverse()) await drop(name); }
    finally { await baseline.$disconnect(); await maintenance.$disconnect(); removeTemporaryMigrations(); }
    throw error;
  }
}
