import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import { FinalFormativeService } from "../src/modules/final-formative/final-formative.service";

const url = process.env.LEXORA_FINAL_FORMATIVE_TEST_DATABASE_URL;
const enabled = !!url && process.env.LEXORA_FINAL_FORMATIVE_DISPOSABLE_DB_CONFIRM === "YES_DISPOSABLE";
export function statements(sql: string) {
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

test("Final Formative splitter preserves all six complete production function bodies", () => {
  const sql = readFileSync("prisma/migrations/202610060001_automatic_final_formative/migration.sql", "utf8");
  const bodies = [...sql.matchAll(/CREATE FUNCTION\b[^$]*\$\$[\s\S]*?\$\$;/g)].map(([body]) => body);
  const parsed = statements(sql);
  const parsedBodies = parsed.filter((part) => part.includes("$$")).map((part) => part.slice(part.indexOf("CREATE FUNCTION")));
  assert.equal(bodies.length, 6);
  assert.deepEqual(parsedBodies, bodies);
  assert.equal(parsed.length, 13);
  assert.ok(parsed.every((part) => part.trimEnd().endsWith(";")));
  assert.ok(parsed.every((part) => !/^\s*(BEGIN|COMMIT);\s*$/.test(part)));
});

test("Final Formative PostgreSQL 18.6 additive migration and authoritative convergence", { skip: !enabled }, async (t) => {
  const parsed = new URL(url!);
  assert.ok(["postgres:", "postgresql:"].includes(parsed.protocol));
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname));
  assert.match(decodeURIComponent(parsed.pathname), /_test$/);
  assert.notEqual(decodeURIComponent(parsed.pathname).toLowerCase(), "/lexora_lms");
  for (const key of ["host", "hostaddr", "service", "options"]) assert.equal(parsed.searchParams.has(key), false);
  const admin = new PrismaClient({ datasourceUrl: url });
  const migration = readFileSync("prisma/migrations/202610060001_automatic_final_formative/migration.sql", "utf8");
  const parents = readFileSync("prisma/fixtures/final-formative.parents.sql", "utf8");
  const ready = readFileSync("prisma/fixtures/final-formative.ready.sql", "utf8");
  const execute = async (tx: Prisma.TransactionClient, sql: string) => {
    for (const statement of statements(sql)) await tx.$executeRawUnsafe(statement);
  };
  async function fixture(work: (db: PrismaClient, service: FinalFormativeService) => Promise<void>) {
    const schema = `final_formative_test_${randomUUID().replaceAll("-", "")}`;
    const target = new URL(url!); target.searchParams.set("schema", schema);
    const db = new PrismaClient({ datasourceUrl: target.toString() });
    let created = false;
    try {
      await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      created = true;
      await db.$transaction(async (tx) => { await execute(tx, parents); await execute(tx, migration); await execute(tx, ready); }, { timeout: 30000 });
      await work(db, new FinalFormativeService(db as never));
    } finally {
      try { await db.$disconnect(); } finally {
        // Remove only a schema this invocation successfully created, even if setup failed.
        if (created) {
          await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
          const remaining = await admin.$queryRaw<Array<{ schema_name: string }>>`
            SELECT schema_name FROM information_schema.schemata WHERE schema_name=${schema}`;
          assert.equal(remaining.length, 0, "Disposable schema cleanup must be verified");
        }
      }
    }
  }
  try {
    const [version] = await admin.$queryRaw<Array<{ version: string }>>`SELECT current_setting('server_version') AS version`;
    assert.match(version!.version, /^18\.6(?:\D|$)/);
    for (const [name, missing] of [
      ["no authoritative sources", ["formative_activities_finalisations", "formative_attendance_generations", "comprehensive_finalisations"]],
      ["Activities only", ["formative_attendance_generations", "comprehensive_finalisations"]],
      ["Attendance only", ["formative_activities_finalisations", "comprehensive_finalisations"]],
      ["Comprehensive only", ["formative_activities_finalisations", "formative_attendance_generations"]],
      ["Activities + Attendance", ["comprehensive_finalisations"]],
      ["Activities + Comprehensive", ["formative_attendance_generations"]],
      ["Attendance + Comprehensive", ["formative_activities_finalisations"]],
    ] as const) await t.test(name, () => fixture(async (db, service) => {
      for (const table of missing) await db.$executeRawUnsafe(`DELETE FROM ${table}`);
      if (missing.includes("formative_attendance_generations" as never)) {
        await db.$executeRawUnsafe("DELETE FROM formative_attendance_source_items");
        await db.$executeRawUnsafe("DELETE FROM formative_attendance_versions");
      }
      if (missing.includes("comprehensive_finalisations" as never)) await db.$executeRawUnsafe("UPDATE comprehensive_examinations SET status='MARKING',finalised_at=NULL");
      assert.equal((await service.reconcile("d", "x"))[0]?.status, "NOT_READY");
      assert.equal(await db.formativeFinalResult.count(), 0); assert.equal(await db.auditLog.count(), 0);
    }));
    await t.test("complete source triple, Decimal arithmetic, exact binding and repeated idempotency", () => fixture(async (db, service) => {
      for (let i = 0; i < 3; i++) await service.reconcile("d", "x");
      const rows = await db.formativeFinalResult.findMany(); assert.equal(rows.length, 1);
      const row = rows[0]!; assert.equal(row.mark.toFixed(2), "31.50"); assert.equal(row.fullMark.toFixed(2), "40.00");
      assert.deepEqual([row.activitiesFinalisationId, row.activitiesResultId, row.attendanceGenerationId, row.attendanceVersionId,
        row.comprehensiveFinalisationId, row.comprehensiveResultId], ["af", "ar", "ag", "av", "cf", "cr"]);
      assert.equal(await db.auditLog.count(), 1);
    }));
    await t.test("six-decimal source precision is preserved", () => fixture(async (db, service) => {
      await db.$executeRawUnsafe("UPDATE comprehensive_final_results SET mark=4.123425");
      await service.reconcile("d", "x"); assert.equal((await db.formativeFinalResult.findFirstOrThrow()).mark.toFixed(6), "31.623425");
    }));
    for (const order of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]])
      await t.test(`source arrival order ${order.join("-")} creates only after the third boundary`, () => fixture(async (db, service) => {
        const tables = ["formative_activities_finalisations", "formative_attendance_generations", "comprehensive_finalisations"];
        const snapshots: unknown[] = [];
        for (const table of tables) {
          const [row] = await db.$queryRawUnsafe<Array<{ data: unknown }>>(`SELECT row_to_json(t) AS data FROM ${table} t`);
          snapshots.push(row!.data); await db.$executeRawUnsafe(`DELETE FROM ${table}`);
        }
        const [attendance] = await db.$queryRaw<Array<{ data: unknown }>>`SELECT row_to_json(v) AS data FROM formative_attendance_versions v`;
        await db.$executeRawUnsafe("DELETE FROM formative_attendance_source_items");
        await db.$executeRawUnsafe("DELETE FROM formative_attendance_versions");
        await db.$executeRawUnsafe("UPDATE comprehensive_examinations SET status='MARKING',finalised_at=NULL");
        for (const [position, index] of order.entries()) {
          await db.$transaction(async (tx) => {
            const table = tables[index]!;
            await tx.$executeRawUnsafe(`INSERT INTO ${table} SELECT * FROM json_populate_record(NULL::${table},$1::json)`, JSON.stringify(snapshots[index]));
            if (index === 1) {
              await tx.$executeRaw`INSERT INTO formative_attendance_versions SELECT * FROM json_populate_record(NULL::formative_attendance_versions,${JSON.stringify(attendance!.data)}::json)`;
              await tx.$executeRawUnsafe("INSERT INTO formative_attendance_source_items VALUES ('avs','av')");
            }
            if (index === 2) await tx.$executeRawUnsafe("UPDATE comprehensive_examinations SET status='FINALISED',finalised_at='2026-01-01'");
            await service.reconcileInTransaction(tx, "d", "x");
          }, { isolationLevel: "Serializable" });
          assert.equal(await db.formativeFinalResult.count(), position === 2 ? 1 : 0);
          assert.equal(await db.auditLog.count(), position === 2 ? 1 : 0);
        }
      }));
    for (const [a, b, c, total] of [[0, 0, 0, "0"], [30, 5, 5, "40"]] as const)
      await t.test(`boundary total ${total}`, () => fixture(async (db, service) => {
        await db.$executeRaw`UPDATE formative_activities_final_results SET mark=${a}`;
        await db.$executeRaw`UPDATE formative_attendance_versions SET mark=${b}`;
        await db.$executeRaw`UPDATE comprehensive_final_results SET mark=${c}`;
        await service.reconcile("d", "x"); assert.equal((await db.formativeFinalResult.findFirstOrThrow()).mark.toString(), total);
      }));
    const corruptions: Array<[string, string]> = [
      ["wrong department", "UPDATE formative_activities_finalisations SET department_id='foreign'"],
      ["wrong student", "UPDATE formative_activities_final_results SET student_user_id='foreign'"],
      ["wrong enrollment", "UPDATE formative_activities_final_results SET enrollment_id='foreign'"],
      ["wrong candidate enrollment", "UPDATE examination_candidate_courses SET enrollment_id='foreign'"],
      ["wrong offering", "UPDATE formative_attendance_versions SET course_offering_id='foreign'"],
      ["misbound Activities offering", "UPDATE formative_activities_finalisations SET course_offering_id='foreign'"],
      ["wrong term", "UPDATE formative_attendance_versions SET academic_term_id='foreign'"],
      ["wrong Examination", "UPDATE formative_activities_finalisations SET examination_id='foreign'"],
      ["misbound generation Examination", "UPDATE formative_attendance_generations SET examination_id='foreign'"],
      ["misbound Comprehensive Examination", "UPDATE comprehensive_examinations SET examination_id='foreign'"],
      ["wrong ExaminationCourse", "UPDATE formative_attendance_versions SET examination_course_id='foreign'"],
      ["wrong programme", "UPDATE formative_attendance_generations SET academic_program_id='foreign'"],
      ["wrong session", "UPDATE examination_candidate_lists SET academic_session_id='foreign'"],
      ["foreign direct source", "UPDATE comprehensive_final_results SET finalisation_id='foreign'"],
      ["missing final child", "DELETE FROM formative_activities_final_results"],
      ["duplicate final child", "INSERT INTO formative_activities_final_results SELECT 'duplicate',finalisation_id,enrollment_id,student_user_id,mark,full_mark,source_fingerprint FROM formative_activities_final_results"],
      ["duplicate authoritative parent", "INSERT INTO formative_activities_finalisations SELECT 'duplicate',department_id,examination_id,examination_course_id,course_offering_id,rule_version_code,activity_count,result_count,source_fingerprint FROM formative_activities_finalisations"],
      ["non-final Activities provenance", "UPDATE formative_activities_finalisations SET rule_version_code='TEACHER_SUBMISSION'"],
      ["stale Activities package", "INSERT INTO formative_activity_submissions SELECT 'newer',department_id,course_offering_id,activity_id,2,source_fingerprint FROM formative_activity_submissions"],
      ["malformed Activities package", "DELETE FROM formative_activities_final_source_items"],
      ["non-generated Attendance", "UPDATE formative_attendance_versions SET generation_id=NULL"],
      ["non-frozen Attendance", "INSERT INTO formative_attendance_transitions VALUES ('reopened','av')"],
      ["stale Attendance", "UPDATE formative_attendance_versions SET status='BLOCKED'"],
      ["superseded Attendance version", "INSERT INTO formative_attendance_versions SELECT 'newer',department_id,NULL,enrollment_id,student_user_id,course_offering_id,examination_id,examination_course_id,academic_term_id,student_batch_id,rule_version_code,status,mark,diagnostics_json,actor_user_id,coordinator_assignment_id,conducted_count,2,source_fingerprint FROM formative_attendance_versions"],
      ["malformed Attendance package", "DELETE FROM formative_attendance_source_items"],
      ["non-final Comprehensive", "UPDATE comprehensive_examinations SET status='MARKING'"],
      ["stale registration", "UPDATE examination_candidate_registrations SET version=2"],
      ["non-submitted Comprehensive source", "UPDATE comprehensive_marks SET status='DRAFT'"],
      ["wrong Comprehensive seat", "UPDATE comprehensive_marks SET seat='MEMBER_1'"],
      ["malformed Comprehensive package", "DELETE FROM comprehensive_final_sources"],
      ["Activities below zero", "UPDATE formative_activities_final_results SET mark=-0.01"],
      ["Activities above 30", "UPDATE formative_activities_final_results SET mark=30.01"],
      ["Attendance below zero", "UPDATE formative_attendance_versions SET mark=-0.1"],
      ["Attendance above 5", "UPDATE formative_attendance_versions SET mark=5.1"],
      ["Comprehensive below zero", "UPDATE comprehensive_final_results SET mark=-0.000001"],
      ["Comprehensive above 5 / derived total above 40", "UPDATE formative_activities_final_results SET mark=30; UPDATE formative_attendance_versions SET mark=5; UPDATE comprehensive_final_results SET mark=5.000001;"],
    ];
    for (const [name, sql] of corruptions) await t.test(name, () => fixture(async (db, service) => {
      await execute(db, sql.endsWith(";") ? sql : `${sql};`);
      await assert.rejects(service.reconcile("d", "x"));
      assert.equal(await db.formativeFinalResult.count(), 0); assert.equal(await db.auditLog.count(), 0);
    }));
    await t.test("foreign scope objects fail safely", () => fixture(async (db, service) => {
      await assert.rejects(service.reconcile("foreign", "x"));
      await assert.rejects(db.$transaction((tx) => service.materialiseInTransaction(tx, "d", "foreign", "e")));
      await assert.rejects(db.$transaction((tx) => service.materialiseInTransaction(tx, "d", "ec", "foreign")));
      assert.equal(await db.formativeFinalResult.count(), 0);
    }));
    await t.test("conflicting resolved source tuple cannot replace immutable evidence", () => fixture(async (db, service) => {
      await service.reconcile("d", "x"); const old = await db.formativeFinalResult.findFirstOrThrow();
      // Synthetic parents permit corruption: retain the referenced row while resolving a
      // different, otherwise complete generated version with the same numerical value.
      await db.$executeRawUnsafe("UPDATE formative_attendance_versions SET enrollment_id='other' WHERE id='av'");
      await db.$executeRawUnsafe("INSERT INTO formative_attendance_versions SELECT 'replacement',department_id,generation_id,'e',student_user_id,course_offering_id,examination_id,examination_course_id,academic_term_id,student_batch_id,rule_version_code,status,mark,diagnostics_json,actor_user_id,coordinator_assignment_id,conducted_count,revision,source_fingerprint FROM formative_attendance_versions WHERE id='av'");
      await db.$executeRawUnsafe("INSERT INTO formative_attendance_source_items VALUES ('replacement-item','replacement')");
      await db.$executeRawUnsafe("UPDATE formative_attendance_generations SET result_count=2");
      await assert.rejects(service.reconcile("d", "x"), /source package changed/);
      assert.equal((await db.formativeFinalResult.findFirstOrThrow()).id, old.id); assert.equal(await db.auditLog.count(), 1);
    }));
    await t.test("real simultaneous Serializable attempts retry and converge to one row/package/audit", () => fixture(async (db) => {
      let entered = 0, attempts = 0, release!: () => void;
      const barrier = new Promise<void>((resolve) => { release = resolve; });
      const proxy = { $transaction: (work: any, options: any) => db.$transaction(async (tx) => {
        const attempt = ++attempts;
        if (attempt <= 2) {
          await tx.$queryRaw`SELECT id FROM examinations WHERE id='x'`;
          if (++entered === 2) release(); await barrier;
        }
        return work(tx);
      }, options) };
      const service = new FinalFormativeService(proxy as never);
      await Promise.all([service.reconcile("d", "x"), service.reconcile("d", "x")]);
      assert.ok(attempts >= 3); assert.equal(await db.formativeFinalResult.count(), 1); assert.equal(await db.auditLog.count(), 1);
    }));
    for (const operation of ["UPDATE formative_final_results SET mark=mark", "DELETE FROM formative_final_results",
      "UPDATE audit_logs SET action=action", "DELETE FROM audit_logs"]) await t.test(`blocks ${operation}`, () => fixture(async (db, service) => {
      await service.reconcile("d", "x"); await assert.rejects(db.$executeRawUnsafe(operation));
      assert.equal(await db.formativeFinalResult.count(), 1); assert.equal(await db.auditLog.count(), 1);
    }));
    await t.test("historical audit UPDATE conversion cannot satisfy materialisation and rolls back", () => fixture(async (db) => {
      const historical = await db.auditLog.create({ data: {
        departmentId: "d", actorType: "SERVICE", action: "historical.unrelated",
        targetType: "examination", targetId: "x", outcome: "SUCCESS",
        contextJson: { historical: true }, occurredAt: new Date("2025-01-01T00:00:00.000Z"),
      } });
      let attemptedConversion = false;
      const proxy = { $transaction: (work: any, options: any) => db.$transaction((tx) => work(new Proxy(tx, {
        get(target, key) {
          if (key === "auditLog") return { create: async (args: Prisma.AuditLogCreateArgs) => {
            // The real aggregate already exists in this Serializable transaction. Supply
            // the exact success payload by UPDATE instead of inserting a fresh audit.
            assert.equal(await target.formativeFinalResult.count({ where: { id: args.data.targetId! } }), 1);
            attemptedConversion = true;
            return target.auditLog.update({ where: { id: historical.id }, data: args.data });
          } };
          const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
        },
      })), options) };
      await assert.rejects(new FinalFormativeService(proxy as never).reconcile("d", "x"), /Final Formative audit is immutable/);
      assert.equal(attemptedConversion, true);
      assert.equal(await db.formativeFinalResult.count(), 0);
      assert.deepEqual(await db.auditLog.findUniqueOrThrow({ where: { id: historical.id } }), historical);
      assert.equal(await db.auditLog.count(), 1);
      assert.equal(await db.auditLog.count({ where: { action: "formative.final.materialised" } }), 0);
    }));
    await t.test("unrelated audit INSERT UPDATE and DELETE remain allowed", () => fixture(async (db) => {
      const historical = await db.auditLog.create({ data: {
        departmentId: "d", actorType: "SERVICE", action: "historical.unrelated",
        targetType: "examination", targetId: "x", outcome: "SUCCESS",
      } });
      const updated = await db.auditLog.update({ where: { id: historical.id }, data: { action: "historical.updated" } });
      assert.equal(updated.action, "historical.updated");
      await db.auditLog.delete({ where: { id: historical.id } });
      assert.equal(await db.auditLog.count(), 0);
    }));
    for (const fault of ["throw", "omit", "malformed", "after"]) await t.test(`protected transaction/audit failure: ${fault}`, () => fixture(async (db) => {
      const proxy = { $transaction: (work: any, options: any) => db.$transaction(async (tx) => {
        const value = await work(new Proxy(tx, { get(target, key) {
          if (key === "auditLog") return { create: async (args: any) => {
            if (fault === "throw") throw Error("controlled required audit failure");
            if (fault === "omit") return {};
            if (fault === "malformed") args.data.contextJson.mark = "40.000000";
            return target.auditLog.create(args);
          } };
          const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
        } }));
        if (fault === "after") throw Error("controlled transaction failure"); return value;
      }, options) };
      await assert.rejects(new FinalFormativeService(proxy as never).reconcile("d", "x"));
      assert.equal(await db.formativeFinalResult.count(), 0); assert.equal(await db.auditLog.count(), 0);
    }));
    await t.test("native constraints and all restrictive foreign keys are installed", () => fixture(async (db) => {
      const rows = await db.$queryRaw<Array<{ conname: string; confdeltype: string; confupdtype: string }>>`
        SELECT conname,confdeltype::text,confupdtype::text FROM pg_constraint WHERE conrelid='formative_final_results'::regclass AND contype='f'`;
      assert.equal(rows.length, 10); assert.ok(rows.every((r) => r.confdeltype === "r" && r.confupdtype === "r"));
      const triggers = await db.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM pg_trigger WHERE tgrelid='formative_final_results'::regclass AND NOT tgisinternal`;
      assert.equal(Number(triggers[0]!.n), 3);
    }));
    for (const field of ["activitiesFinalisationId", "activitiesResultId", "attendanceGenerationId", "attendanceVersionId",
      "comprehensiveFinalisationId", "comprehensiveResultId", "mark", "activitiesMark", "provenanceJson"])
      await t.test(`database rejects forged persisted ${field}`, () => fixture(async (db) => {
        const proxy = { $transaction: (work: any, options: any) => db.$transaction((tx) => work(new Proxy(tx, {
          get(target, key) {
            if (key === "formativeFinalResult") return new Proxy(target.formativeFinalResult, {
              get(model, method) {
                if (method === "create") return (args: any) => {
                  args.data[field] = field === "provenanceJson" ? {} : field.endsWith("Id") ? "foreign" : "41";
                  return model.create(args);
                };
                const value = Reflect.get(model, method); return typeof value === "function" ? value.bind(model) : value;
              },
            });
            const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
          },
        })), options) };
        await assert.rejects(new FinalFormativeService(proxy as never).reconcile("d", "x"));
        assert.equal(await db.formativeFinalResult.count(), 0); assert.equal(await db.auditLog.count(), 0);
      }));
  } finally { await admin.$disconnect(); }
});
