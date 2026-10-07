import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { Prisma, PrismaClient, type FormativeActivity } from "@prisma/client";
import type { PrincipalContext } from "@lexora/types";
import { AuthorizationService } from "../src/modules/authorization/services/authorization.service";
import { FormativeAssessmentService } from "../src/modules/assessment/application/services/formative-assessment.service";
import { FormativeActivitiesFinalisationService } from "../src/modules/assessment/application/services/formative-activities-finalisation.service";
import { FormativeActivitiesFinalisationAuthorizerService } from "../src/modules/assessment/application/services/formative-activities-finalisation-authorizer.service";

const url = process.env.LEXORA_FORMATIVE_FINALISATION_TEST_DATABASE_URL;
const enabled = !!url && process.env.LEXORA_FORMATIVE_FINALISATION_DISPOSABLE_DB_CONFIRM === "YES_DISPOSABLE";
function statements(sql: string) {
  const result: string[] = []; let start = 0, quote = false, dollar = false, comment = false;
  for (let i = 0; i < sql.length; i++) {
    if (comment) { if (sql[i] === "\n") comment = false; continue; }
    if (!quote && !dollar && sql.slice(i, i + 2) === "--") { comment = true; i++; continue; }
    if (!quote && sql.slice(i, i + 2) === "$$") { dollar = !dollar; i++; continue; }
    if (!dollar && sql[i] === "'") { if (quote && sql[i + 1] === "'") { i++; continue; } quote = !quote; }
    if (!quote && !dollar && sql[i] === ";") { result.push(sql.slice(start, i + 1)); start = i + 1; }
  }
  if (sql.slice(start).trim()) result.push(sql.slice(start));
  return result.filter((part) => !/^\s*(BEGIN|COMMIT);\s*$/.test(part.replace(/--[^\n]*/g, "")));
}


test("Step 4B production migration splitter retains complete function bodies and transaction boundaries", () => {
  const sql = readFileSync("prisma/migrations/202610020001_chairman_activities_finalisation/migration.sql", "utf8");
  assert.match(sql, /^BEGIN;/); assert.match(sql, /COMMIT;\s*$/);
  const bodies = [...sql.matchAll(/CREATE FUNCTION\b[^$]*\$\$[\s\S]*?\$\$;/g)].map(([body]) => body);
  const parsedBodies = statements(sql).filter((part) => /\$\$/.test(part)).map((part) => part.slice(part.indexOf("CREATE FUNCTION")));
  assert.ok(bodies.length > 10); assert.deepEqual(parsedBodies, bodies);
  assert.ok(statements(sql).every((part) => part.trimEnd().endsWith(";")));
});

test("Step 4B disposable PostgreSQL migration, authority, packages, freeze and Serializable races", { skip: !enabled }, async (t) => {
  const parsed = new URL(url!);
  assert.ok(["postgres:", "postgresql:"].includes(parsed.protocol));
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname));
  assert.match(decodeURIComponent(parsed.pathname), /_test$/);
  assert.notEqual(decodeURIComponent(parsed.pathname).toLowerCase(), "/lexora_lms");
  // Reject alternate libpq transport targets; only the explicitly confirmed loopback host is admissible.
  for (const key of ["host", "hostaddr", "service", "options"]) assert.equal(parsed.searchParams.has(key), false);
  const schema = `formative_final_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new PrismaClient({ datasourceUrl: url }); parsed.searchParams.set("schema", schema);
  const client = new PrismaClient({ datasourceUrl: parsed.toString() });
  const execute = async (sql: string, tx: Prisma.TransactionClient = client) => {
    for (const statement of statements(sql)) await tx.$executeRawUnsafe(statement);
  };
  const migration = readFileSync("prisma/migrations/202610020001_chairman_activities_finalisation/migration.sql", "utf8");
  let sequence = 0;
  const markInput = { rawMark: "1", feedback: "Reviewed written evidence", feedbackCompleted: true, integrityStatus: "CLEAR" as const };
  async function fixture(weight = "15") {
    const d = `f${++sequence}`;
    await execute(`
      INSERT INTO departments(id) VALUES ('${d}');
      INSERT INTO users(id,department_id) VALUES ('${d}-chair','${d}'),('${d}-s1','${d}'),('${d}-s2','${d}'),('${d}-s3','${d}');
      INSERT INTO roles(id,department_id,code) VALUES ('${d}-role','${d}','teacher');
      INSERT INTO user_roles(id,user_id,department_id,role_id) VALUES ('${d}-ur','${d}-chair','${d}','${d}-role');
      INSERT INTO permissions VALUES ('${d}-p','formative.activities.finalise_department','formative.activities','finalise','DEPARTMENT'),
        ('${d}-adjust','formative.mark.adjust','formative.mark','adjust','DEPARTMENT');
      INSERT INTO role_permissions VALUES ('${d}-rp','${d}-role','${d}-p'),('${d}-arp','${d}-role','${d}-adjust');
      INSERT INTO examinations VALUES ('${d}-exam','${d}','program','session','term',NULL);
      INSERT INTO examination_committees VALUES ('${d}-committee','${d}','${d}-exam',NULL);
      INSERT INTO examination_committee_assignments(id,department_id,examination_id,committee_id,assigned_user_id,seat,assigned_at)
        VALUES ('${d}-chairman','${d}','${d}-exam','${d}-committee','${d}-chair','CHAIRMAN','2026-01-01');
      INSERT INTO curriculum_versions VALUES ('${d}-cv','${d}','program');
      INSERT INTO course_assessment_templates VALUES ('${d}-template','${d}',1,100,NULL);
      INSERT INTO assessment_template_components VALUES
        ('${d}-a','${d}','${d}-template','FORMATIVE_ACTIVITIES',30,true),('${d}-b','${d}','${d}-template','ATTENDANCE',5,true),
        ('${d}-c','${d}','${d}-template','COMPREHENSIVE_EXAMINATION',5,true),('${d}-d','${d}','${d}-template','SUMMATIVE_EXAMINATION',60,true);
      INSERT INTO curriculum_courses VALUES ('${d}-cc','${d}','${d}-course','${d}-cv','${d}-template');
      INSERT INTO syllabus_versions VALUES ('${d}-sv','${d}','${d}-cc');
      INSERT INTO course_offerings(id,department_id,course_id,curriculum_course_id,syllabus_version_id,academic_term_id)
        VALUES ('${d}-o','${d}','${d}-course','${d}-cc','${d}-sv','term');
      INSERT INTO examination_courses(id,department_id,examination_id,academic_program_id,academic_session_id,academic_term_id,
        course_offering_id,curriculum_version_id,curriculum_course_id,syllabus_version_id,assessment_template_id)
        VALUES ('${d}-ec','${d}','${d}-exam','program','session','term','${d}-o','${d}-cv','${d}-cc','${d}-sv','${d}-template');
      INSERT INTO teacher_course_assignments(id,department_id,course_offering_id,teacher_user_id,assigned_at)
        VALUES ('${d}-teacher','${d}','${d}-o','${d}-chair','2026-01-01');
      INSERT INTO enrollments(id,department_id,course_offering_id,student_user_id)
        VALUES ('${d}-e1','${d}','${d}-o','${d}-s1'),('${d}-e2','${d}','${d}-o','${d}-s2');
    `);
    const source = { departmentId: d, roleId: `${d}-role`, userRoleId: `${d}-ur` };
    const principal: PrincipalContext = { actorId: `${d}-chair`, actorType: "user", isAuthenticated: true, activeDepartmentId: d,
      roleAssignments: [{ ...source, role: "teacher" }], permissions: [
        { id: `${d}-p`, rolePermissionId: `${d}-rp`, code: "formative.activities.finalise_department", resource: "formative.activities", action: "finalise", scope: "department", source },
        { resource: "formative.mark", action: "adjust", scope: "department", source },
      ] };
    const context = { get: () => ({ principal, departmentId: "forged", audit: {} }) };
    const teacher = new FormativeAssessmentService(client as never, context as never, new AuthorizationService());
    const authorizer = new FormativeActivitiesFinalisationAuthorizerService(client as never, context as never);
    const finalService = (db: unknown = client, auth: unknown = authorizer) => new FormativeActivitiesFinalisationService(db as never, context as never, auth as never, { reconcileInTransaction: async () => [] } as never);
    const activities: FormativeActivity[] = [];
    for (let n = 0; n < 2; n++) {
      const a = await teacher.createActivity(`${d}-o`, { title: `Activity ${n}`, method: "QUIZ", rawMaximum: "8", assignedWeight: weight });
      await teacher.startMarking(`${d}-o`, a.id);
      for (let e = 1; e <= 2; e++) await teacher.saveMark(`${d}-o`, a.id, `${d}-e${e}`, markInput);
      await teacher.submitActivity(`${d}-o`, a.id); activities.push(a);
    }
    return { d, teacher, context, authorizer, finalService, activities, finalise: () => finalService().finalise(`${d}-ec`),
      adjust: () => teacher.adjustMark(`${d}-o`, activities[0]!.id, `${d}-e1`, { ...markInput, rawMark: "2", reason: "Script rechecked" }) };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  // Exercise raw SQL/Prisma forgery through the real production validators, not a weakened migration.
  function intercepted(f: Fixture, change: (key: string, args: any, tx: Prisma.TransactionClient) => any) {
    const db = { $transaction: (work: any, options: any) => client.$transaction((tx) => work(new Proxy(tx, {
      get(target, key) {
        const value = Reflect.get(target, key);
        if (["formativeActivitiesFinalisation", "formativeActivitiesFinalResult", "formativeActivitiesFinalSourceItem", "auditLog"].includes(String(key)))
          return new Proxy(value, { get(model, method) { const fn = Reflect.get(model, method); if (method === "create" || method === "createMany")
            return async (args: any) => { if (key === "formativeActivitiesFinalSourceItem" && args.data[0]?.resultId === "omitted-result") return {};
            const changed = await change(String(key), args, target); return changed === null ? { id: "omitted-result" } : fn.call(model, changed); };
            return typeof fn === "function" ? fn.bind(model) : fn; } });
        return typeof value === "function" ? value.bind(target) : value;
      },
    })), options) };
    return f.finalService(db);
  }
  async function rejectedBatch(f: Fixture, mutate: (key: string, args: any, tx: Prisma.TransactionClient) => any) {
    await assert.rejects(intercepted(f, mutate).finalise(`${f.d}-ec`));
    assert.equal(await client.formativeActivitiesFinalisation.count({ where: { courseOfferingId: `${f.d}-o` } }), 0);
    assert.equal(await client.formativeActivitiesFinalResult.count({ where: { enrollmentId: `${f.d}-e1` } }), 0);
  }
  const subtest = async (name: string, body: () => Promise<void>) => {
    let passed = false; await t.test(name, async () => { await body(); passed = true; });
    assert.ok(passed, `Stopped after failed PostgreSQL subtest: ${name}`);
  };
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await execute(readFileSync("prisma/test-fixtures/attendance-generation.sql", "utf8"));
    for (const name of ["202609210001_add_formative_teacher_submission", "202610010001_add_formative_activity_submission"])
      await client.$transaction((tx) => execute(readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8"), tx));
    await subtest("production migration rolls back all DDL and then installs unmodified", async () => {
      await client.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SAVEPOINT migration_attempt"); await execute(migration, tx);
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT migration_attempt");
        const rows = await tx.$queryRaw<Array<{ relation: string | null }>>`SELECT to_regclass('formative_activities_finalisations')::TEXT AS relation`;
        assert.equal(rows[0]!.relation, null);
      }, { timeout: 30000 });
      await client.$transaction((tx) => execute(migration, tx), { timeout: 30000 });
    });
    await subtest("Asia/Dhaka authority revalidation preserves exact UTC snapshots and assignment/UserRole windows", async () => {
      const f = await fixture();
      const authority = await f.authorizer.authorize(`${f.d}-ec`);
      assert.equal(authority.assignmentAssignedAt.toISOString(), "2026-01-01T00:00:00.000Z");
      const evaluatedAt = new Date("2026-01-01T12:00:00.000Z");
      for (const lock of [true, false]) {
        await client.$transaction(async (tx) => {
          // Explicit non-UTC coverage, scoped to this test transaction only.
          await tx.$executeRaw`SET LOCAL TIME ZONE 'Asia/Dhaka'`;
          const [zone] = await tx.$queryRaw<Array<{ zone: string }>>`SELECT current_setting('TimeZone') AS zone`;
          assert.equal(zone!.zone, "Asia/Dhaka");
          await tx.$executeRaw`UPDATE examination_committee_assignments SET expires_at=TIMESTAMP '2026-01-01 12:01:00'
            WHERE id=${authority.committeeAssignmentId}`;
          await tx.$executeRaw`UPDATE user_roles SET expires_at=TIMESTAMP '2026-01-01 12:01:00' WHERE id=${authority.userRoleId}`;
          await f.authorizer.assertCurrentAuthority(tx, authority, evaluatedAt, lock);
          await assert.rejects(f.authorizer.assertCurrentAuthority(tx,
            { ...authority, assignmentAssignedAt: new Date("2026-01-01T00:00:00.001Z") }, evaluatedAt, lock), ForbiddenException);
          const rejectMutation = async (sql: string, snapshot = authority) => {
            await tx.$executeRaw`SAVEPOINT authority_case`;
            await execute(sql, tx);
            await assert.rejects(f.authorizer.assertCurrentAuthority(tx, snapshot, evaluatedAt, lock), ForbiddenException);
            await tx.$executeRaw`ROLLBACK TO SAVEPOINT authority_case`;
            await tx.$executeRaw`RELEASE SAVEPOINT authority_case`;
          };
          // Within the six-hour offset: equality-only fixes must still reject a future start.
          await rejectMutation(`UPDATE examination_committee_assignments SET assigned_at=TIMESTAMP '2026-01-01 12:01:00' WHERE id='${f.d}-chairman'`,
            { ...authority, assignmentAssignedAt: new Date("2026-01-01T12:01:00.000Z") });
          for (const expiresAt of ["2026-01-01 11:59:00", "2026-01-01 12:00:00"]) {
            await rejectMutation(`UPDATE examination_committee_assignments SET expires_at=TIMESTAMP '${expiresAt}' WHERE id='${f.d}-chairman'`);
            await rejectMutation(`UPDATE user_roles SET expires_at=TIMESTAMP '${expiresAt}' WHERE id='${f.d}-ur'`);
          }
          await rejectMutation(`DELETE FROM role_permissions WHERE id='${f.d}-rp'`);
          await rejectMutation(`UPDATE examination_committee_assignments SET seat='MEMBER_1' WHERE id='${f.d}-chairman'`);
          await rejectMutation(`UPDATE examination_committee_assignments SET status='INACTIVE' WHERE id='${f.d}-chairman'`);
          await f.authorizer.assertCurrentAuthority(tx, authority, evaluatedAt, lock);
        }, { isolationLevel: "Serializable", timeout: 30000 });
      }
    });
    await subtest("exact /30 full batch and immutable source bindings; no active historical Teacher duty needed", async () => {
      const f = await fixture(); await execute(`UPDATE teacher_course_assignments SET status='INACTIVE',unassigned_at=now() WHERE id='${f.d}-teacher'`);
      const result: any = await f.finalise(); assert.equal(result.resultCount, 2); assert.equal(result.activityCount, 2);
      const children = await client.formativeActivitiesFinalResult.findMany({ where: { finalisationId: result.finalisationId } });
      assert.deepEqual(children.map((c) => c.mark.toFixed(2)), ["3.76", "3.76"]);
      assert.equal(await client.formativeActivitiesFinalSourceItem.count({ where: { resultId: { in: children.map((c) => c.id) } } }), 4);
      await assert.rejects(f.finalise());
    });
    await subtest("readiness rejects below/above 30, corrected marks, stale roster and missing/DRAFT activities", async () => {
      const low = await fixture("14"); assert.equal((await low.finalService().workspace(`${low.d}-ec`) as any).ready, false); await assert.rejects(low.finalise());
      await assert.rejects(fixture("16"));
      const corrected = await fixture(); await corrected.adjust(); await assert.rejects(corrected.finalise());
      await corrected.teacher.submitActivity(`${corrected.d}-o`, corrected.activities[0]!.id); await corrected.finalise();
      const expanded = await fixture(); await execute(`INSERT INTO enrollments(id,department_id,course_offering_id,student_user_id) VALUES ('${expanded.d}-e3','${expanded.d}','${expanded.d}-o','${expanded.d}-s3')`);
      await assert.rejects(expanded.finalise());
      const partial = await fixture("10"); const a = await partial.teacher.createActivity(`${partial.d}-o`, { title: "Pending", method: "QUIZ", rawMaximum: "10", assignedWeight: "10" });
      assert.ok((await partial.finalService().workspace(`${partial.d}-ec`) as any).blockers.some((b: any) => b.code === "ACTIVITY_NOT_MARKING"));
      await partial.teacher.startMarking(`${partial.d}-o`, a.id);
      assert.ok((await partial.finalService().workspace(`${partial.d}-ec`) as any).blockers.some((b: any) => b.code === "MISSING_SUBMISSION"));
    });
    await subtest("DB authority guard rejects changed, expired, inactive, unassigned and forged exact authority", async () => {
      for (const mutation of ["status='INACTIVE'", "expires_at=(clock_timestamp() AT TIME ZONE 'UTC')-interval '1 minute'", "unassigned_at=(clock_timestamp() AT TIME ZONE 'UTC')", "assigned_at='2026-02-01'", "external_member_name='forged'"]) {
        const f = await fixture(); const authority = await f.authorizer.authorize(`${f.d}-ec`);
        await execute(`UPDATE examination_committee_assignments SET ${mutation} WHERE id='${f.d}-chairman'`);
        // Bypass only application preflight/revalidation, forcing the actual database authority guard to reject.
        await assert.rejects(f.finalService(client, { authorize: async () => authority, assertCurrentAuthority: async () => undefined }).finalise(`${f.d}-ec`));
      }
      const f = await fixture();
      await rejectedBatch(f, (key, args) => { if (key === "formativeActivitiesFinalisation") args.data.rolePermissionId = `${f.d}-arp`; return args; });
      const authority = await f.authorizer.authorize(`${f.d}-ec`);
      await execute(`DELETE FROM role_permissions WHERE id='${f.d}-rp'`);
      await assert.rejects(f.finalService(client, { authorize: async () => authority, assertCurrentAuthority: async () => undefined }).finalise(`${f.d}-ec`));
    });
    await subtest("forged fingerprint/snapshot/arithmetic/source version and incomplete result/source sets roll back", async () => {
      const f = await fixture();
      for (const [model, field, value] of [
        ["formativeActivitiesFinalisation", "sourceFingerprint", "f".repeat(64)],
        ["formativeActivitiesFinalisation", "scopeJson", {}],
        ["formativeActivitiesFinalisation", "authoritySnapshotJson", {}],
        ["formativeActivitiesFinalisation", "resultCount", 1],
        ["formativeActivitiesFinalResult", "mark", "30.00"],
        ["formativeActivitiesFinalResult", "sourceFingerprint", "f".repeat(64)],
        ["formativeActivitiesFinalResult", "fullMark", "40.00"],
      ] as const) await rejectedBatch(f, (key, args) => { if (key === model) args.data[field] = value; return args; });
      for (const field of ["submissionVersion", "weightedMark", "submissionFingerprint", "markEvidenceId"])
        await rejectedBatch(f, (key, args) => { if (key === "formativeActivitiesFinalSourceItem")
          args.data[0][field] = field === "submissionVersion" ? 99 : field === "weightedMark" ? "30.00" : "forged"; return args; });
      await rejectedBatch(f, (key, args) => { if (key === "formativeActivitiesFinalSourceItem") args.data.pop(); return args; });
      await rejectedBatch(f, (key, args) => key === "formativeActivitiesFinalResult" && args.data.enrollmentId.endsWith("e2") ? null : args);
    });
    await subtest("exactly one same-transaction success audit required; audit failures are atomic", async () => {
      const f = await fixture();
      await rejectedBatch(f, (key, args) => key === "auditLog" ? null : args);
      await rejectedBatch(f, (key, args) => { if (key === "auditLog") args.data.contextJson.resultCount = "2"; return args; });
      await rejectedBatch(f, (key, args) => { if (key === "auditLog") throw Error("audit unavailable"); return args; });
      await f.finalise();
    });
    await subtest("an unrelated historical audit cannot be UPDATE-converted into the batch success audit", async () => {
      const f = await fixture();
      const unrelated = await client.auditLog.create({ data: { departmentId: f.d, actorUserId: `${f.d}-chair`,
        actorType: "USER", action: "test.unrelated", targetType: "test", targetId: `${f.d}-history`,
        outcome: "SUCCESS", contextJson: { historical: true } } });
      // The narrow academic guard does not change ordinary unrelated audit behavior.
      const before = await client.auditLog.update({ where: { id: unrelated.id }, data: { action: "test.unrelated.updated" } });
      const sourceCount = await client.formativeActivitiesFinalSourceItem.count();
      let attemptedFinalisationId = "";
      let conversionRejection: unknown;
      await assert.rejects(intercepted(f, async (key, args, tx) => {
        if (key !== "auditLog") return args;
        attemptedFinalisationId = args.data.targetId;
        assert.equal(await tx.formativeActivitiesFinalisation.count({ where: { id: attemptedFinalisationId } }), 1);
        assert.equal(await tx.formativeActivitiesFinalResult.count({ where: { finalisationId: attemptedFinalisationId } }), 2);
        assert.equal(await tx.formativeActivitiesFinalSourceItem.count(), sourceCount + 4);
        // Supply the exact intended success payload, replacing INSERT with UPDATE of committed history.
        try {
          await tx.auditLog.update({ where: { id: unrelated.id }, data: args.data });
        } catch (error) {
          conversionRejection = error;
          throw error;
        }
        return null;
      }).finalise(`${f.d}-ec`));
      assert.match(`${String(conversionRejection)} ${JSON.stringify(conversionRejection)}`, /Activities finalisation audit must be inserted/);
      assert.ok(attemptedFinalisationId);
      assert.equal(await client.formativeActivitiesFinalisation.count({ where: { courseOfferingId: `${f.d}-o` } }), 0);
      assert.equal(await client.formativeActivitiesFinalResult.count({ where: { finalisationId: attemptedFinalisationId } }), 0);
      assert.equal(await client.formativeActivitiesFinalSourceItem.count(), sourceCount);
      assert.equal(await client.auditLog.count({ where: { departmentId: f.d, action: "formative.activities.chairman-finalised" } }), 0);
      assert.deepEqual(await client.auditLog.findUniqueOrThrow({ where: { id: unrelated.id } }), before);
      await client.auditLog.delete({ where: { id: unrelated.id } });
      await f.finalise();
    });
    await subtest("final package and sources immutable; ordinary saves/adjustments/submits and roster expansion/reactivation denied", async () => {
      const f = await fixture(); const parent: any = await f.finalise();
      const result = await client.formativeActivitiesFinalResult.findFirstOrThrow({ where: { finalisationId: parent.finalisationId } });
      const source = await client.formativeActivitiesFinalSourceItem.findFirstOrThrow({ where: { resultId: result.id } });
      for (const table of ["formative_activities_finalisations", "formative_activities_final_results", "formative_activities_final_source_items"])
        for (const operation of ["UPDATE", "DELETE"]) await assert.rejects(execute(operation === "UPDATE" ? `UPDATE ${table} SET id=id` : `DELETE FROM ${table}`));
      await assert.rejects(client.formativeActivitiesFinalSourceItem.create({ data: { ...source, id: randomUUID() } }));
      await assert.rejects(f.adjust());
      await assert.rejects(f.teacher.saveMark(`${f.d}-o`, f.activities[0]!.id, `${f.d}-e1`, markInput));
      await assert.rejects(f.teacher.submitActivity(`${f.d}-o`, f.activities[0]!.id));
      const mark = await client.formativeMarkEvidence.findUniqueOrThrow({ where: { id: source.markEvidenceId } });
      await assert.rejects(client.formativeMarkEvidence.create({ data: { ...mark, id: randomUUID(), revision: mark.revision+1, previousId: mark.id, reason: "SQL correction" } }));
      for (const sql of [
        `UPDATE formative_activities SET title='Changed' WHERE id='${f.activities[0]!.id}'`,
        `DELETE FROM formative_activities WHERE id='${f.activities[0]!.id}'`,
        `INSERT INTO formative_activities(id,department_id,course_offering_id,title,method,raw_maximum,assigned_weight,updated_at) VALUES ('new-${f.d}','${f.d}','${f.d}-o','new','QUIZ',1,1,now())`,
        `INSERT INTO enrollments(id,department_id,course_offering_id,student_user_id) VALUES ('${f.d}-e3','${f.d}','${f.d}-o','${f.d}-s3')`,
        `UPDATE course_offerings SET curriculum_course_id=NULL WHERE id='${f.d}-o'`,
        `UPDATE examination_courses SET assessment_template_id='other' WHERE id='${f.d}-ec'`,
        `UPDATE assessment_template_components SET maximum_marks=29 WHERE id='${f.d}-a'`,
        `UPDATE course_assessment_templates SET version_number=2 WHERE id='${f.d}-template'`,
        `UPDATE examination_committee_assignments SET assigned_at='2026-02-01' WHERE id='${f.d}-chairman'`,
        `UPDATE teacher_course_assignments SET assigned_at='2026-02-01' WHERE id='${f.d}-teacher'`,
        `DELETE FROM audit_logs WHERE target_id='${parent.finalisationId}'`,
        `UPDATE audit_logs SET action='test.unrelated' WHERE target_id='${parent.finalisationId}'`,
      ]) await assert.rejects(execute(sql));
      await execute(`UPDATE teacher_course_assignments SET status='INACTIVE',unassigned_at=now() WHERE id='${f.d}-teacher';
        UPDATE examination_committee_assignments SET status='INACTIVE',unassigned_at=now() WHERE id='${f.d}-chairman';
        UPDATE enrollments SET status='DROPPED',archived_at=now() WHERE id='${f.d}-e1';
        UPDATE examination_courses SET locked_question_configuration_id='later-summative' WHERE id='${f.d}-ec';`);
      await assert.rejects(execute(`UPDATE enrollments SET status='APPROVED',archived_at=NULL WHERE id='${f.d}-e1'`));
      assert.equal((await client.formativeActivitiesFinalResult.findUniqueOrThrow({ where: { id: result.id } })).mark.toString(), result.mark.toString());
    });

    await subtest("workspace is PostgreSQL READ ONLY, preserves row versions, and creates no academic evidence", async () => {
      const f = await fixture();
      const versions = () => client.$queryRaw<Array<{ id: string; version: string }>>`
        SELECT id,xmin::TEXT AS version FROM course_offerings WHERE id=${`${f.d}-o`}
        UNION ALL SELECT id,xmin::TEXT FROM examinations WHERE id=${`${f.d}-exam`}
        UNION ALL SELECT id,xmin::TEXT FROM examination_courses WHERE id=${`${f.d}-ec`} ORDER BY id`;
      const before = await versions();
      const workspace: any = await f.finalService().workspace(`${f.d}-ec`);
      assert.equal(workspace.ready, true); assert.equal(workspace.preview.length, 2);
      assert.deepEqual(await versions(), before);
      assert.equal(await client.formativeActivitiesFinalisation.count({ where: { courseOfferingId: `${f.d}-o` } }), 0);
      assert.equal(await client.formativeActivitiesFinalResult.count({ where: { enrollmentId: `${f.d}-e1` } }), 0);
      assert.equal(await client.auditLog.count({ where: { departmentId: f.d, action: "formative.activities.chairman-finalised" } }), 0);
    });
    await subtest("canonical finalised Enrollment departures/archive preserve evidence; pre-approval regression and reactivation fail", async () => {
      for (const departure of ["DROPPED", "WITHDRAWN", "ARCHIVED", "ARCHIVE_TIMESTAMP"]) {
        const f = await fixture(); const final: any = await f.finalise();
        const before = await client.formativeActivitiesFinalResult.findMany({ where: { finalisationId: final.finalisationId }, orderBy: { id: "asc" } });
        for (const regression of ["PENDING", "WAITLISTED", "REJECTED"])
          await assert.rejects(execute(`UPDATE enrollments SET status='${regression}' WHERE id='${f.d}-e1'`), /lifecycle cannot regress/);
        const state = departure === "ARCHIVE_TIMESTAMP" ? "APPROVED" : departure;
        const extra = ["ARCHIVED", "ARCHIVE_TIMESTAMP"].includes(departure) ? ",archived_at=now()" : ",dropped_at=now()";
        await execute(`UPDATE enrollments SET status='${state}'${extra} WHERE id='${f.d}-e1'`);
        for (const regression of ["PENDING", "WAITLISTED", "REJECTED"])
          await assert.rejects(execute(`UPDATE enrollments SET status='${regression}' WHERE id='${f.d}-e1'`), /lifecycle cannot regress/);
        await assert.rejects(execute(`UPDATE enrollments SET status='APPROVED',archived_at=NULL WHERE id='${f.d}-e1'`));
        // Departures can still be archived; ordinary operational timestamps can be maintained.
        await execute(`UPDATE enrollments SET archived_at=now(),dropped_at=now() WHERE id='${f.d}-e1'`);
        assert.deepEqual(await client.formativeActivitiesFinalResult.findMany({ where: { finalisationId: final.finalisationId }, orderBy: { id: "asc" } }), before);
      }
    });
    await subtest("authorization grants can be removed later while immutable exact authority snapshots survive", async () => {
      const f = await fixture(); const final: any = await f.finalise();
      const before = await client.formativeActivitiesFinalisation.findUniqueOrThrow({ where: { id: final.finalisationId } });
      await execute(`DELETE FROM role_permissions WHERE id='${f.d}-rp'; DELETE FROM permissions WHERE id='${f.d}-p';
        UPDATE user_roles SET revoked_at=now() WHERE id='${f.d}-ur'`);
      assert.deepEqual(await client.formativeActivitiesFinalisation.findUniqueOrThrow({ where: { id: final.finalisationId } }), before);
      assert.equal(before.permissionId, `${f.d}-p`); assert.equal(before.rolePermissionId, `${f.d}-rp`);
      assert.deepEqual(before.authoritySnapshotJson, { roleCode: "teacher", permissionCode: "formative.activities.finalise_department",
        resource: "formative.activities", action: "finalise", scope: "DEPARTMENT" });
      await assert.rejects(f.finalService().workspace(`${f.d}-ec`));
      const during = await fixture();
      await rejectedBatch(during, async (key, args, tx) => {
        if (key === "auditLog") await tx.$executeRaw`DELETE FROM role_permissions WHERE id=${`${during.d}-rp`}`;
        return args;
      });
    });
    await subtest("concurrent duplicate finalisation yields exactly one offering-wide authoritative batch", async () => {
      const f = await fixture(); const attempts = await Promise.allSettled([f.finalise(), f.finalise()]);
      assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(await client.formativeActivitiesFinalisation.count({ where: { courseOfferingId: `${f.d}-o` } }), 1);
    });
    await subtest("correction, configuration and enrollment expansion lose to a locked finalisation", async () => {
      for (const kind of ["correction", "configuration", "enrollment", "activity"]) {
        const f = await fixture(); let release!: () => void; let entered!: () => void;
        const held = new Promise<void>((r) => { release = r; }); const ready = new Promise<void>((r) => { entered = r; });
        const final = intercepted(f, async (key, args) => { if (key === "auditLog") { entered(); await held; } return args; }).finalise(`${f.d}-ec`);
        await ready;
        const source = kind === "correction" ? f.adjust() : execute(kind === "configuration"
          ? `UPDATE course_assessment_templates SET version_number=2 WHERE id='${f.d}-template'`
          : kind === "enrollment" ? `INSERT INTO enrollments(id,department_id,course_offering_id,student_user_id) VALUES ('${f.d}-e3','${f.d}','${f.d}-o','${f.d}-s3')`
          : `UPDATE formative_activities SET title='Changed' WHERE id='${f.activities[0]!.id}'`);
        const settled = Promise.allSettled([final, source]); release(); const outcomes = await settled;
        assert.equal(outcomes[0]!.status, "fulfilled"); assert.equal(outcomes[1]!.status, "rejected");
      }
    });
    await subtest("source change holding the offering mutex wins; finalisation retries and rejects stale evidence", async () => {
      for (const kind of ["correction", "configuration", "enrollment"]) {
        const f = await fixture(); let release!: () => void; let entered!: () => void;
        const held = new Promise<void>((r) => { release = r; }); const ready = new Promise<void>((r) => { entered = r; });
        const change = client.$transaction(async (tx) => {
          await tx.$executeRaw`UPDATE course_offerings SET id=id WHERE id=${`${f.d}-o`}`;
          if (kind === "configuration") await tx.$executeRaw`UPDATE course_assessment_templates SET version_number=2 WHERE id=${`${f.d}-template`}`;
          else if (kind === "enrollment") await tx.$executeRaw`INSERT INTO enrollments(id,department_id,course_offering_id,student_user_id) VALUES (${`${f.d}-e3`},${f.d},${`${f.d}-o`},${`${f.d}-s3`})`;
          else {
            const previous = await tx.formativeMarkEvidence.findFirstOrThrow({ where: { activityId: f.activities[0]!.id, enrollmentId: `${f.d}-e1` } });
            await tx.formativeMarkEvidence.create({ data: { ...previous, id: randomUUID(), previousId: previous.id, revision: previous.revision+1, feedback: "Rechecked", reason: "Correction" } });
          }
          entered(); await held;
        }, { isolationLevel: "Serializable", timeout: 30000 });
        await ready; const final = f.finalise(); const settled = Promise.allSettled([change, final]); release();
        const outcomes = await settled; assert.equal(outcomes[0]!.status, "fulfilled"); assert.equal(outcomes[1]!.status, "rejected");
      }
    });
  } finally {
    t.diagnostic(`Disposable evidence schema retained: ${schema}`);
    await client.$disconnect(); await admin.$disconnect();
  }
});
