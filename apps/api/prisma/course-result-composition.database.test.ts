import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import { evidenceTransaction } from "../src/common/academic-evidence/transaction";
import { FinalFormativeService } from "../src/modules/final-formative/final-formative.service";
import { CourseResultCompositionService } from "../src/modules/course-result-composition/course-result-composition.service";

// No .env loading, canonical URL fallback, remote host, or destructive database reset.
const url = process.env.LEXORA_COURSE_COMPOSITION_TEST_DATABASE_URL;
const enabled = !!url && process.env.LEXORA_COURSE_COMPOSITION_DISPOSABLE_DB_CONFIRM === "YES_DISPOSABLE";
function statements(sql: string) {
  const parts: string[] = []; let start = 0, quote = false, dollar = false, comment = false;
  for (let i = 0; i < sql.length; i++) {
    if (comment) { if (sql[i] === "\n") comment = false; continue; }
    if (!quote && !dollar && sql.slice(i, i + 2) === "--") { comment = true; i++; continue; }
    if (!quote && sql.slice(i, i + 2) === "$$") { dollar = !dollar; i++; continue; }
    if (!dollar && sql[i] === "'") { if (quote && sql[i + 1] === "'") { i++; continue; } quote = !quote; }
    if (!quote && !dollar && sql[i] === ";") { parts.push(sql.slice(start, i + 1)); start = i + 1; }
  }
  return parts.filter((s) => !/^\s*(BEGIN|COMMIT);\s*$/.test(s));
}
const migrationPath = "prisma/migrations/202610080001_authoritative_course_composition/migration.sql";
test("composition SQL splitter preserves complete production functions", () => {
  const sql = readFileSync(migrationPath, "utf8");
  const bodies = [...sql.matchAll(/CREATE FUNCTION\b[^$]*\$\$[\s\S]*?\$\$;/g)].map(([body]) => body);
  assert.equal(bodies.length, 6);
  assert.deepEqual(statements(sql).filter((s) => s.includes("$$")).map((s) => s.slice(s.indexOf("CREATE FUNCTION"))), bodies);
});

test("course-result composition disposable PostgreSQL matrix", { skip: !enabled }, async (t) => {
  const parsed = new URL(url!);
  assert.ok(["postgres:", "postgresql:"].includes(parsed.protocol));
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname));
  assert.match(decodeURIComponent(parsed.pathname), /_test$/);
  assert.notEqual(decodeURIComponent(parsed.pathname).toLowerCase(), "/lexora_lms");
  for (const key of parsed.searchParams.keys()) assert.ok(!["host", "hostaddr", "service", "options"].includes(key.toLowerCase()));
  const admin = new PrismaClient({ datasourceUrl: url });
  const service = new CourseResultCompositionService();
  const execute = async (db: Prisma.TransactionClient, sql: string) => {
    for (const part of statements(sql)) await db.$executeRawUnsafe(part);
  };
  async function fixture(work: (db: PrismaClient) => Promise<void>, seedFormative = true) {
    const schema = `course_composition_test_${randomUUID().replaceAll("-", "")}`;
    const target = new URL(url!); target.searchParams.set("schema", schema);
    const db = new PrismaClient({ datasourceUrl: target.toString() }); let created = false;
    try {
      await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
      await db.$transaction(async (tx) => {
        for (const file of ["prisma/fixtures/final-formative.parents.sql",
          "prisma/migrations/202610060001_automatic_final_formative/migration.sql",
          "prisma/fixtures/final-formative.ready.sql", "prisma/fixtures/course-result-composition.parents.sql", migrationPath])
          await execute(tx, readFileSync(file, "utf8"));
      }, { timeout: 30000 });
      if (seedFormative) await new FinalFormativeService(db as never,
        { reconcileInTransaction: async () => ({ status: "NOT_READY" as const }) }).reconcile("d", "x");
      await work(db);
    } finally {
      await db.$disconnect();
      if (created) {
        await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
        const rows = await admin.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM information_schema.schemata WHERE schema_name=${schema}`;
        assert.equal(rows[0]?.n, 0n);
      }
    }
  }
  const reconcile = (db: PrismaClient) => evidenceTransaction(db as never,
    (tx) => service.reconcileInTransaction(tx, "d", "x", "ec", "e"));
  const count = async (db: PrismaClient, expected: number) => {
    assert.equal(await db.courseResultComposition.count(), expected);
    assert.equal(await db.auditLog.count({ where: { action: "course-result.composed" } }), expected);
  };
  try {
    await t.test("exact approved version, Decimal sum, one audit and repeat", () => fixture(async (db) => {
      assert.equal((await reconcile(db)).status, "CREATED"); assert.equal((await reconcile(db)).status, "EXISTING");
      const row = await db.courseResultComposition.findFirstOrThrow();
      assert.equal(row.totalMark.toString(), "77.625"); assert.equal(row.calculatedMarkVersion, 2);
      assert.equal(row.coursePassed, true); await count(db, 1);
    }));
    await t.test("Formative terminal owner creates both aggregates atomically when Summative arrived first", () => fixture(async (db) => {
      await new FinalFormativeService(db as never, service).reconcile("d", "x"); await count(db, 1);
      assert.equal(await db.formativeFinalResult.count(), 1);
      await new FinalFormativeService(db as never, service).reconcile("d", "x"); await count(db, 1);
    }, false));
    await t.test("Summative source transaction composes when Formative arrived first", () => fixture(async (db) => {
      await db.$executeRawUnsafe("DELETE FROM summative_chairman_approvals");
      assert.equal((await reconcile(db)).status, "NOT_READY"); await count(db, 0);
      await evidenceTransaction(db as never, async (tx) => {
        await tx.$executeRawUnsafe("INSERT INTO summative_chairman_approvals (id,department_id,examination_id,examination_course_id,candidate_id,calculated_mark_id,calculated_mark_version_snapshot,approved_summative_value_snapshot,summative_full_mark_snapshot,approval_version,approved_at,locked_at,created_at) VALUES ('a','d','x','ec','sc','m',2,46.125,60,1,'2026-01-03','2026-01-03','2026-01-03')");
        await service.reconcileInTransaction(tx, "d", "x", "ec", "e");
      }); await count(db, 1);
    }));
    await t.test("absent Formative is a no-op", () => fixture(async (db) => {
      assert.equal((await reconcile(db)).status, "NOT_READY"); await count(db, 0);
    }, false));
    for (const [name, sql] of [
      ["wrong approved version", "UPDATE summative_chairman_approvals SET calculated_mark_version_snapshot=1"],
      ["missing calculated parent", "DELETE FROM summative_calculated_marks"],
      ["forged approved mark", "UPDATE summative_chairman_approvals SET approved_summative_value_snapshot=50"],
      ["wrong summative full mark", "UPDATE summative_chairman_approvals SET summative_full_mark_snapshot=100"],
      ["unlocked approval", "UPDATE summative_chairman_approvals SET locked_at=NULL"],
      ["foreign approval", "UPDATE summative_chairman_approvals SET department_id='foreign'"],
      ["foreign calculated source", "UPDATE summative_calculated_marks SET department_id='foreign'"],
      ["unsupported rule", "UPDATE summative_calculated_marks SET rule_version_code='UNVERIFIED'"],
      ["wrong offering", "UPDATE summative_examination_candidates SET course_offering_id='other'"],
      ["wrong enrollment with same student", "UPDATE summative_examination_candidates SET enrollment_id='other'"],
      ["wrong student", "UPDATE summative_examination_candidates SET student_user_id='other'"],
      ["foreign candidate", "UPDATE summative_examination_candidates SET department_id='other'"],
      ["multiple candidates", "INSERT INTO summative_examination_candidates (id,department_id,examination_id,examination_course_id,course_offering_id,enrollment_id,student_user_id) VALUES ('sc2','d','x','ec','o','e','s')"],
      ["competing approvals", "INSERT INTO summative_chairman_approvals (id,department_id,examination_id,examination_course_id,candidate_id,calculated_mark_id,calculated_mark_version_snapshot,approved_summative_value_snapshot,summative_full_mark_snapshot,approval_version,approved_at,locked_at,created_at) SELECT 'a2',department_id,examination_id,examination_course_id,candidate_id,calculated_mark_id,calculated_mark_version_snapshot,approved_summative_value_snapshot,summative_full_mark_snapshot,2,approved_at,locked_at,created_at FROM summative_chairman_approvals"],
      ["non-Regular", "UPDATE examination_candidate_registrations SET category='IMPROVEMENT'"],
      ["uncertified", "UPDATE examination_candidate_lists SET status='DRAFT'"],
      ["missing certification", "UPDATE examination_candidate_lists SET certified_at=NULL"],
      ["stale registration", "UPDATE examination_candidate_registrations SET version=2"],
      ["wrong registered student", "UPDATE examination_candidate_registrations SET student_user_id='other'"],
      ["wrong registration assignment", "UPDATE examination_candidate_registrations SET curriculum_assignment_id='other'"],
      ["wrong programme", "UPDATE examination_candidate_lists SET academic_program_id='other'"],
      ["wrong session", "UPDATE examination_candidate_lists SET academic_session_id='other'"],
      ["wrong term", "UPDATE examination_candidate_lists SET academic_term_id='other'"],
      ["wrong curriculum", "UPDATE student_curriculum_assignments SET curriculum_version_id='other'"],
      ["missing certified edge", "DELETE FROM examination_candidate_courses"],
      ["ambiguous certified edge", "INSERT INTO examination_candidate_courses VALUES ('duplicate','d','ec','e','reg')"],
      ["wrong roster lineage", "UPDATE comprehensive_roster_entries SET registration_version=2"],
    ]) await t.test(name!, () => fixture(async (db) => {
      await db.$executeRawUnsafe(sql!); await assert.rejects(reconcile(db)); await count(db, 0);
    }));
    for (const [f, s, total, fp, sp] of [
      ["0", "0", "0", false, false], ["16", "24", "40", true, true],
      ["15.999999", "60", "75.999999", false, true], ["40", "23.999", "63.999", true, false],
      ["40", "60", "100", true, true], ["31.123456", "46.125", "77.248456", true, true],
    ] as const) await t.test(`Decimal and pass boundaries ${f}+${s}`, () => fixture(async (db) => {
      const mark = new Prisma.Decimal(f), base = Prisma.Decimal.min(mark.floor(), 30), remaining = mark.minus(base);
      const attendance = Prisma.Decimal.min(remaining.floor(), 5), comprehensive = remaining.minus(attendance);
      await db.$executeRaw`UPDATE formative_activities_final_results SET mark=${base}`;
      await db.$executeRaw`UPDATE formative_attendance_versions SET mark=${attendance}`;
      await db.$executeRaw`UPDATE comprehensive_final_results SET mark=${comprehensive}`;
      await db.$executeRaw`UPDATE summative_calculated_marks SET derived_summative_value=${new Prisma.Decimal(s)}`;
      await db.$executeRaw`UPDATE summative_chairman_approvals SET approved_summative_value_snapshot=${new Prisma.Decimal(s)}`;
      await new FinalFormativeService(db as never, service).reconcile("d", "x");
      const row = await db.courseResultComposition.findFirstOrThrow();
      assert.equal(row.totalMark.toString(), total); assert.equal(row.formativePassed, fp);
      assert.equal(row.summativePassed, sp); assert.equal(row.coursePassed, fp && sp);
    }, false));
    await t.test("concurrent Serializable attempts converge to one package", () => fixture(async (db) => {
      let attempts = 0, release!: () => void;
      const barrier = new Promise<void>((resolve) => { release = resolve; });
      const work = () => evidenceTransaction(db as never, async (tx) => {
        await tx.$queryRaw`SELECT id FROM examinations WHERE id='x'`;
        attempts++; if (attempts <= 2) { if (attempts === 2) release(); await barrier; }
        return service.reconcileInTransaction(tx, "d", "x", "ec", "e");
      });
      const results = await Promise.all([work(), work()]);
      assert.deepEqual(results.map((r) => r.status).sort(), ["CREATED", "EXISTING"]);
      assert.ok(attempts >= 3); await count(db, 1);
    }));
    for (const sql of ["UPDATE course_result_compositions SET total_mark=0", "DELETE FROM course_result_compositions",
      "UPDATE audit_logs SET context_json='{}' WHERE action='course-result.composed'",
      "UPDATE audit_logs SET action='unprotected' WHERE action='course-result.composed'",
      "DELETE FROM audit_logs WHERE action='course-result.composed'"])
      await t.test(`immutable ${sql}`, () => fixture(async (db) => {
        await reconcile(db); await assert.rejects(db.$executeRawUnsafe(sql)); await count(db, 1);
      }));
    await t.test("missing success audit fails deferred validation and rolls back", () => fixture(async (db) => {
      await assert.rejects(evidenceTransaction(db as never, (tx) => service.reconcileInTransaction(
        new Proxy(tx, { get: (target, key) => key === "auditLog" ? { create: async () => ({}) } : Reflect.get(target, key) }),
        "d", "x", "ec", "e"))); await count(db, 0);
    }));
    for (const [field, value] of [["formativeMark", "20"], ["formativeFullMark", "100"],
      ["summativeMark", "50"], ["summativeFullMark", "100"], ["totalMark", "90"],
      ["totalFullMark", "101"], ["formativePassed", false], ["summativePassed", false],
      ["coursePassed", false], ["calculatedMarkVersion", 1], ["chairmanApprovalId", "forged"],
      ["formativeResultId", "missing"], ["registrationVersion", 2], ["ruleVersionCode", "UNVERIFIED"]] as const)
      await t.test(`direct insertion cannot forge ${field}`, () => fixture(async (db) => {
        await assert.rejects(evidenceTransaction(db as never, (tx) => service.reconcileInTransaction(
          new Proxy(tx, { get: (target, key) => key === "courseResultComposition" ? {
            findUnique: tx.courseResultComposition.findUnique.bind(tx.courseResultComposition),
            create: ({ data }: { data: Prisma.CourseResultCompositionUncheckedCreateInput }) =>
              tx.courseResultComposition.create({ data: { ...data, [field]: value } }),
          } : Reflect.get(target, key) }), "d", "x", "ec", "e")));
        await count(db, 0);
      }));
    for (const change of ["wrong actor", "wrong payload", "duplicate"] as const)
      await t.test(`rejects ${change} success audit`, () => fixture(async (db) => {
        await assert.rejects(evidenceTransaction(db as never, (tx) => service.reconcileInTransaction(
          new Proxy(tx, { get: (target, key) => key === "auditLog" ? {
            create: async ({ data }: { data: Prisma.AuditLogUncheckedCreateInput }) => {
              if (change === "duplicate") await tx.auditLog.create({ data });
              return tx.auditLog.create({ data: { ...data,
                ...(change === "wrong actor" ? { actorType: "USER" as const } : {}),
                ...(change === "wrong payload" ? { contextJson: {} } : {}),
              } });
            },
          } : Reflect.get(target, key) }), "d", "x", "ec", "e")));
        await count(db, 0);
      }));
    await t.test("audit cannot attach in a later transaction or be converted from an ordinary event", () => fixture(async (db) => {
      await reconcile(db);
      const row = await db.courseResultComposition.findFirstOrThrow();
      const data = { departmentId: "d", actorType: "SERVICE" as const, action: "course-result.composed",
        targetId: row.id, targetType: "course_result_composition", outcome: "SUCCESS" as const, contextJson: {} };
      await assert.rejects(db.auditLog.create({ data }));
      const ordinary = await db.auditLog.create({ data: { ...data, action: "ordinary.fixture" } });
      await assert.rejects(db.auditLog.update({ where: { id: ordinary.id }, data: { action: "course-result.composed" } }));
      await count(db, 1);
    }));
    await t.test("new unapproved calculated version is never selected", () => fixture(async (db) => {
      await db.$executeRawUnsafe("INSERT INTO summative_calculated_marks SELECT 'm3',department_id,examination_id,examination_course_id,candidate_id,3,59,summative_full_mark_snapshot,rule_version_code,created_at FROM summative_calculated_marks");
      await reconcile(db); const row = await db.courseResultComposition.findFirstOrThrow();
      assert.equal(row.calculatedMarkId, "m"); assert.equal(row.calculatedMarkVersion, 2);
      assert.equal(row.summativeMark.toString(), "46.125");
    }));
    await t.test("interrupted terminal transaction rolls back source, both aggregates and audits", () => fixture(async (db) => {
      await assert.rejects(evidenceTransaction(db as never, async (tx) => {
        await new FinalFormativeService(db as never, service).reconcileInTransaction(tx, "d", "x");
        throw Error("interrupted");
      })); await count(db, 0); assert.equal(await db.formativeFinalResult.count(), 0);
      assert.equal(await db.auditLog.count(), 0);
    }, false));
    await t.test("Read Committed insertion fails", () => fixture(async (db) => {
      await assert.rejects(db.$transaction((tx) => service.reconcileInTransaction(tx, "d", "x", "ec", "e")));
      await count(db, 0);
    }));
    await t.test("unexpected sensitive provenance cannot be persisted even through direct aggregate creation", () => fixture(async (db) => {
      await assert.rejects(evidenceTransaction(db as never, (tx) => service.reconcileInTransaction(
        new Proxy(tx, { get: (target, key) => key === "courseResultComposition" ? {
          findUnique: tx.courseResultComposition.findUnique.bind(tx.courseResultComposition),
          create: ({ data }: { data: Prisma.CourseResultCompositionUncheckedCreateInput }) =>
            tx.courseResultComposition.create({ data: { ...data, provenanceJson: {
              ...(data.provenanceJson as Prisma.InputJsonObject), unrelatedProfile: "must-not-persist",
            } } }),
        } : Reflect.get(target, key) }), "d", "x", "ec", "e")));
      await count(db, 0);
    }));
    await t.test("permitted candidate metadata is not captured and does not create false drift", () => fixture(async (db) => {
      await reconcile(db);
      const before = await db.courseResultComposition.findFirstOrThrow();
      assert.equal(JSON.stringify(before.provenanceJson).includes("created_at"), false);
      const audit = await db.auditLog.findFirstOrThrow({ where: { action: "course-result.composed" } });
      assert.equal(Object.hasOwn(audit.contextJson as object, "provenanceJson"), false);
      await db.$executeRawUnsafe("UPDATE summative_examination_candidates SET created_at='2025-01-01',updated_at=statement_timestamp()");
      assert.equal((await reconcile(db)).status, "EXISTING");
      assert.deepEqual(await db.courseResultComposition.findFirstOrThrow(), before); await count(db, 1);
    }));
    await t.test("foreign scope fails safely", () => fixture(async (db) => {
      await assert.rejects(evidenceTransaction(db as never, (tx) => service.reconcileInTransaction(tx, "foreign", "x", "ec", "e")));
      await assert.rejects(evidenceTransaction(db as never, (tx) => service.reconcileInTransaction(tx, "d", "x", "other", "e")));
      await count(db, 0);
    }));
  } finally { await admin.$disconnect(); }
});
