import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import type { PrincipalContext } from "@lexora/types";
import { FormativeAssessmentService } from "../src/modules/assessment/application/services/formative-assessment.service";
import { AuthorizationService } from "../src/modules/authorization/services/authorization.service";
import { deriveActivitySubmission, type FormativeConfiguration } from "../src/modules/assessment/domain/formative.rules";

// Same opt-in local disposable schema pattern as the Attendance database harness.
// Never fall back to DATABASE_URL or connect to the ordinary runtime database.
const url = process.env.LEXORA_FORMATIVE_TEST_DATABASE_URL;
const enabled = !!url && process.env.LEXORA_FORMATIVE_DISPOSABLE_DB_CONFIRM === "YES_DISPOSABLE";
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

test("migration splitter preserves quoted semicolons and every complete Step 4A function body", () => {
  const quoted = "SELECT 'ordinary; -- text', 'escaped ''quote;'' text';";
  const body = "DO $$ BEGIN PERFORM 'text;'; -- a comment;\n PERFORM 1; END; $$;";
  assert.deepEqual(statements(`BEGIN;\n${quoted}\n${body}\nCOMMIT;`).map((part) => part.trim()), [quoted, body]);
  assert.deepEqual(statements("-- comment; ' $$\nSELECT 1;"), ["-- comment; ' $$\nSELECT 1;"]);
  const sql = readFileSync(path.resolve("prisma/migrations/202610010001_add_formative_activity_submission/migration.sql"), "utf8");
  // Compare complete source bodies to what the actual executor will send, not a rewritten migration.
  const bodies = [...sql.matchAll(/(?:DO|CREATE FUNCTION)\b[^$]*\$\$[\s\S]*?\$\$;/g)].map(([body]) => body);
  const parsedBodies = statements(sql).filter((part) => /\$\$/.test(part))
    .map((part) => part.slice(part.search(/\b(?:DO|CREATE FUNCTION)\b/)));
  assert.ok(bodies.length > 1);
  assert.deepEqual(parsedBodies, bodies);
});

test("Activity submission PostgreSQL migration, packages, correction, cutover, atomicity and concurrency", { skip: !enabled }, async (t) => {
  // Stop at the first real failure; dependent tests must not obscure its cause.
  const subtest = async (name: string, body: () => Promise<void>) => {
    let passed = false;
    await t.test(name, async () => { await body(); passed = true; });
    assert.ok(passed, `Stopped after failed PostgreSQL subtest: ${name}`);
  };
  const parsed = new URL(url!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname));
  assert.match(parsed.pathname, /_test$/); assert.notEqual(parsed.pathname, "/lexora_lms");
  const schema = `formative_activity_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new PrismaClient({ datasourceUrl: url }); parsed.searchParams.set("schema", schema);
  const client = new PrismaClient({ datasourceUrl: parsed.toString() });
  const execute = async (sql: string, tx: Prisma.TransactionClient = client) => {
    const parts = statements(sql);
    for (const [index, statement] of parts.entries()) {
      try {
        await tx.$executeRawUnsafe(statement);
      } catch (error) {
        const firstLine = statement.split(/\r?\n/).find((line) => line.trim() && !line.trimStart().startsWith("--"));
        const meta = error instanceof Prisma.PrismaClientKnownRequestError ? error.meta : undefined;
        t.diagnostic(`SQL statement ${index + 1}/${parts.length}: ${firstLine?.trim().slice(0, 180)}; PostgreSQL ${meta?.code}: ${String(meta?.message).slice(0, 300)}`);
        throw error;
      }
    }
  };
  const migrate = (name: string) => client.$transaction((tx) => execute(readFileSync(path.resolve(`prisma/migrations/${name}/migration.sql`), "utf8"), tx));
  let sequence = 0;
  const markInput = { rawMark: "1", feedback: "Written feedback ✓", feedbackCompleted: true, integrityStatus: "CLEAR" as const };
  const configurationFor = (d: string): FormativeConfiguration => ({ templateId: `${d}-template`, templateVersion: 1, components: [
    { id: `${d}-b`, code: "ATTENDANCE", maximum: "5.00" },
    { id: `${d}-c`, code: "COMPREHENSIVE_EXAMINATION", maximum: "5.00" },
    { id: `${d}-a`, code: "FORMATIVE_ACTIVITIES", maximum: "30.00" },
    { id: `${d}-d`, code: "SUMMATIVE_EXAMINATION", maximum: "60.00" },
  ] });
  async function fixture(weight = "1") {
    const d = `f${++sequence}`;
    await execute(`
      INSERT INTO departments(id) VALUES ('${d}');
      INSERT INTO users(id,department_id) VALUES ('${d}-teacher','${d}');
      INSERT INTO roles VALUES ('${d}-role','${d}','teacher',NULL);
      INSERT INTO user_roles(id,user_id,department_id,role_id) VALUES ('${d}-ur','${d}-teacher','${d}','${d}-role');
      INSERT INTO permissions VALUES ('${d}-p','formative.mark','adjust','DEPARTMENT');
      INSERT INTO role_permissions VALUES ('${d}-role','${d}-p');
      INSERT INTO course_assessment_templates VALUES ('${d}-template','${d}',1,100,NULL);
      INSERT INTO assessment_template_components VALUES
        ('${d}-a','${d}','${d}-template','FORMATIVE_ACTIVITIES',30,true),('${d}-b','${d}','${d}-template','ATTENDANCE',5,true),
        ('${d}-c','${d}','${d}-template','COMPREHENSIVE_EXAMINATION',5,true),('${d}-d','${d}','${d}-template','SUMMATIVE_EXAMINATION',60,true);
      INSERT INTO curriculum_courses VALUES ('${d}-cc','${d}','${d}-course','${d}-template');
      INSERT INTO course_offerings(id,department_id,course_id,curriculum_course_id) VALUES ('${d}-o','${d}','${d}-course','${d}-cc');
      INSERT INTO teacher_course_assignments(id,department_id,course_offering_id,teacher_user_id,assigned_at)
        VALUES ('${d}-assignment','${d}','${d}-o','${d}-teacher','2026-01-01');
      INSERT INTO enrollments(id,department_id,course_offering_id) VALUES ('${d}-e1','${d}','${d}-o'),('${d}-e2','${d}','${d}-o');
    `);
    const principal: PrincipalContext = { actorId: `${d}-teacher`, actorType: "user", isAuthenticated: true, activeDepartmentId: d,
      roleAssignments: [{ departmentId: d, role: "teacher", userRoleId: `${d}-ur`, roleId: `${d}-role` }],
      permissions: [{ resource: "formative.mark", action: "adjust", scope: "department", source: { departmentId: d, userRoleId: `${d}-ur`, roleId: `${d}-role` } }] };
    const context = { get: () => ({ principal, department: { departmentId: "forged" }, audit: {} }) };
    const service = new FormativeAssessmentService(client as never, context as never, new AuthorizationService());
    const activity = await service.createActivity(`${d}-o`, { title: "Test", method: "QUIZ", rawMaximum: "8", assignedWeight: weight });
    await service.startMarking(`${d}-o`, activity.id);
    for (const e of [1, 2]) await service.saveMark(`${d}-o`, activity.id, `${d}-e${e}`, markInput);
    return { d, activity, service, context, submit: () => service.submitActivity(`${d}-o`, activity.id),
      adjust: () => service.adjustMark(`${d}-o`, activity.id, `${d}-e1`, { ...markInput, rawMark: "2", reason: "Rechecked script" }) };
  }
  async function rawPackage(f: Awaited<ReturnType<typeof fixture>>, tx: Prisma.TransactionClient, options: {
    omitItem?: boolean; stale?: boolean; fingerprint?: boolean; snapshot?: boolean; version?: boolean; scope?: boolean;
    configuration?: FormativeConfiguration; configurationSnapshot?: boolean; configurationFingerprint?: boolean;
  } = {}) {
    const activity = await tx.formativeActivity.findUniqueOrThrow({ where: { id: f.activity.id } });
    const sources = await Promise.all([1, 2].map(async (e) => ({ enrollmentId: `${f.d}-e${e}`,
      mark: await tx.formativeMarkEvidence.findFirstOrThrow({ where: { activityId: activity.id, enrollmentId: `${f.d}-e${e}` }, orderBy: { revision: options.stale ? "asc" : "desc" } }) })));
    const derived = deriveActivitySubmission(activity, sources, configurationFor(f.d));
    const forged = deriveActivitySubmission(activity, sources, options.configuration ?? configurationFor(f.d));
    const previous = await tx.formativeActivitySubmission.findFirst({ where: { activityId: activity.id }, orderBy: { version: "desc" } });
    const parent = await tx.formativeActivitySubmission.create({ data: {
      departmentId: f.d, courseOfferingId: `${f.d}-o`, activityId: activity.id, version: (previous?.version ?? 0) + (options.version ? 2 : 1), previousId: previous?.id,
      activityVersion: activity.version, rawMaximum: activity.rawMaximum, assignedWeight: activity.assignedWeight, ...derived,
      ...(options.fingerprint ? { sourceFingerprint: "a".repeat(64) } : {}), ...(options.snapshot ? { sourceSnapshotJson: {} } : {}),
      ...(options.configurationSnapshot ? { sourceSnapshotJson: forged.sourceSnapshotJson } : {}),
      ...(options.configurationFingerprint ? { sourceFingerprint: forged.sourceFingerprint } : {}),
      actorUserId: `${f.d}-teacher`, teacherAssignmentId: `${f.d}-assignment`, assignmentAssignedAt: new Date("2026-01-01T00:00:00Z"),
    } });
    for (const source of sources.slice(0, options.omitItem ? 1 : 2)) {
      await tx.formativeActivitySubmissionItem.create({ data: { departmentId: options.scope ? "other" : f.d, courseOfferingId: `${f.d}-o`,
        activityId: activity.id, enrollmentId: source.enrollmentId, submissionId: parent.id, markEvidenceId: source.mark.id } });
    }
    return parent;
  }
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    // Only external dependencies are minimal fixtures; both Formative migrations run unmodified.
    await execute(`
      CREATE TABLE departments(id TEXT PRIMARY KEY, status TEXT DEFAULT 'ACTIVE', archived_at TIMESTAMP, deleted_at TIMESTAMP);
      CREATE TABLE users(id TEXT PRIMARY KEY, department_id TEXT, status TEXT DEFAULT 'ACTIVE', archived_at TIMESTAMP, deleted_at TIMESTAMP);
      CREATE TABLE roles(id TEXT PRIMARY KEY, department_id TEXT, code TEXT, archived_at TIMESTAMP);
      CREATE TABLE user_roles(id TEXT PRIMARY KEY, user_id TEXT, department_id TEXT, role_id TEXT, revoked_at TIMESTAMP, expires_at TIMESTAMP);
      CREATE TABLE permissions(id TEXT PRIMARY KEY, resource TEXT, action TEXT, scope TEXT);
      CREATE TABLE role_permissions(role_id TEXT, permission_id TEXT);
      CREATE TABLE course_offerings(id TEXT PRIMARY KEY, department_id TEXT, course_id TEXT, curriculum_course_id TEXT, status TEXT DEFAULT 'ACTIVE', archived_at TIMESTAMP);
      CREATE TABLE teacher_course_assignments(id TEXT PRIMARY KEY, department_id TEXT, course_offering_id TEXT, teacher_user_id TEXT,
        status TEXT DEFAULT 'ACTIVE', assigned_at TIMESTAMP(3), unassigned_at TIMESTAMP, archived_at TIMESTAMP);
      CREATE TABLE enrollments(id TEXT PRIMARY KEY, department_id TEXT, course_offering_id TEXT, status TEXT DEFAULT 'APPROVED', archived_at TIMESTAMP);
      CREATE TABLE course_assessment_templates(id TEXT PRIMARY KEY, department_id TEXT, version_number INTEGER, total_marks NUMERIC, archived_at TIMESTAMP);
      CREATE TABLE assessment_template_components(id TEXT PRIMARY KEY, department_id TEXT, assessment_template_id TEXT, code TEXT, maximum_marks NUMERIC, is_required BOOLEAN);
      CREATE TABLE curriculum_courses(id TEXT PRIMARY KEY, department_id TEXT, course_id TEXT, assessment_template_id TEXT);
      CREATE TYPE "AuditActorType" AS ENUM ('USER','SERVICE','ANONYMOUS');
      CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS','FAILURE','DENIED');
      CREATE TABLE audit_logs(id TEXT PRIMARY KEY, request_id TEXT, actor_user_id TEXT, actor_type "AuditActorType", department_id TEXT,
        action TEXT, target_type TEXT, target_id TEXT, outcome "AuditOutcome", ip_address TEXT, user_agent TEXT, context_json JSONB, occurred_at TIMESTAMP DEFAULT now());
    `);
    await migrate("202609210001_add_formative_teacher_submission");
    // Insert historical evidence before cutover; never disable a trigger to seed legacy data.
    // The legacy SQL fixture exercises the old package contract independently.
    await execute(`
      INSERT INTO course_offerings(id,department_id) VALUES ('legacy-o','legacy');
      INSERT INTO enrollments(id,department_id,course_offering_id) VALUES ('legacy-e','legacy','legacy-o');
      INSERT INTO teacher_course_assignments(id,department_id,course_offering_id,teacher_user_id,assigned_at)
        VALUES ('legacy-t','legacy','legacy-o','legacy-user','2026-01-01');
      INSERT INTO formative_activities(id,department_id,course_offering_id,title,method,raw_maximum,assigned_weight,status,updated_at)
        VALUES ('legacy-a','legacy','legacy-o','Historical','QUIZ',100,30,'MARKING',now());
      INSERT INTO formative_mark_evidence(id,department_id,course_offering_id,activity_id,enrollment_id,revision,raw_maximum,assigned_weight,
        raw_mark,weighted_mark,feedback,feedback_completed,integrity_status,actor_user_id,teacher_assignment_id,assignment_assigned_at)
        VALUES ('legacy-m','legacy','legacy-o','legacy-a','legacy-e',1,100,30,80,24,'Historical feedback',true,'CLEAR','legacy-user','legacy-t','2026-01-01');
    `);
    const legacyInsert = `INSERT INTO formative_teacher_submissions(id,department_id,course_offering_id,enrollment_id,total_weighted_mark,total_weight,
      rule_version_code,source_snapshot_json,actor_user_id,teacher_assignment_id,assignment_assigned_at)
      VALUES ('legacy-p','legacy','legacy-o','legacy-e',24,30,'FORMATIVE_ACTIVITIES_30_HALF_UP_2DP_V1','{}','legacy-user','legacy-t','2026-01-01')`;
    await client.$transaction(async (tx) => {
      await execute(legacyInsert, tx);
      await execute(`INSERT INTO formative_submission_items VALUES ('legacy-i','legacy','legacy-o','legacy-e','legacy-a','legacy-p','legacy-m')`, tx);
    });
    const legacyBefore = await client.formativeTeacherSubmission.findUniqueOrThrow({ where: { id: "legacy-p" }, include: { items: true } });
    // Valid pre-existing totals must survive unchanged alongside historical evidence.
    await execute(`
      INSERT INTO course_offerings(id,department_id) VALUES ('partial-o','preflight'),('exact-o','preflight');
      INSERT INTO formative_activities(id,department_id,course_offering_id,title,method,raw_maximum,assigned_weight,status,updated_at) VALUES
        ('partial-a','preflight','partial-o','Partial draft','QUIZ',100,12,'DRAFT',now()),
        ('partial-b','preflight','partial-o','Partial marking','QUIZ',100,7,'MARKING',now()),
        ('exact-a','preflight','exact-o','Exact draft','QUIZ',100,15,'DRAFT',now()),
        ('exact-b','preflight','exact-o','Exact marking','QUIZ',100,15,'MARKING',now());
    `);
    const activitiesBefore = await client.formativeActivity.findMany({ orderBy: { id: "asc" } });
    const catalog = (tx: Prisma.TransactionClient = client) => tx.$queryRaw<Array<{ kind: string; name: string }>>(Prisma.sql`
      SELECT 'relation' AS kind, c.relname::TEXT AS name FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema()
      UNION ALL SELECT 'function', p.proname::TEXT FROM pg_proc p
        JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=current_schema()
      UNION ALL SELECT 'trigger', c.relname::TEXT || '.' || t.tgname::TEXT FROM pg_trigger t
        JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema()
      ORDER BY kind, name
    `);
    const catalogBefore = await catalog();
    const step4aSql = readFileSync(path.resolve("prisma/migrations/202610010001_add_formative_activity_submission/migration.sql"), "utf8");
    for (const status of ["DRAFT", "MARKING"]) await subtest(`migration rejects pre-existing ${status} total above /30 atomically`, async () => {
      await client.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SAVEPOINT disposable_invalid_fixture");
        await execute(`
          INSERT INTO course_offerings(id,department_id) VALUES ('invalid-o','preflight');
          INSERT INTO formative_activities(id,department_id,course_offering_id,title,method,raw_maximum,assigned_weight,status,updated_at) VALUES
            ('invalid-a','preflight','invalid-o','Invalid fixture A','QUIZ',100,20,'${status}',now()),
            ('invalid-b','preflight','invalid-o','Invalid fixture B','QUIZ',100,11,'${status}',now());
        `, tx);
        const invalidBefore = await tx.formativeActivity.findMany({ where: { courseOfferingId: "invalid-o" }, orderBy: { id: "asc" } });
        assert.equal(invalidBefore.reduce((sum, a) => sum.add(a.assignedWeight), new Prisma.Decimal(0)).toFixed(2), "31.00");
        // A savepoint gives the migration a real PostgreSQL subtransaction: on
        // failure all of its DDL rolls back, while the invalid fixture remains.
        await tx.$executeRawUnsafe("SAVEPOINT step4a_migration_attempt");
        await assert.rejects(execute(step4aSql, tx), (error: unknown) =>
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2010" && error.meta?.code === "23514"
            && /Existing Formative activity configuration exceeds the \/30 budget; controlled review is required before migration/.test(error.message));
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT step4a_migration_attempt");
        assert.deepEqual(await catalog(tx), catalogBefore, "No partial Step 4A tables, indexes, functions or triggers survive");
        assert.deepEqual(await tx.formativeActivity.findMany({ where: { courseOfferingId: "invalid-o" }, orderBy: { id: "asc" } }), invalidBefore);
        // Remove only this disposable fixture by rolling back its creation.
        // Never disable the academic no-delete trigger or rewrite a mark/weight.
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT disposable_invalid_fixture");
        assert.equal(await tx.formativeActivity.count({ where: { courseOfferingId: "invalid-o" } }), 0);
        assert.deepEqual(await tx.formativeActivity.findMany({ orderBy: { id: "asc" } }), activitiesBefore);
      }, { timeout: 20000 });
      assert.deepEqual(await catalog(), catalogBefore);
    });
    await subtest("same migration succeeds after fixture rollback; existing partial/exact totals and legacy evidence survive", async () => {
      await migrate("202610010001_add_formative_activity_submission");
      assert.deepEqual(await client.formativeActivity.findMany({ orderBy: { id: "asc" } }), activitiesBefore);
      assert.deepEqual(await client.formativeTeacherSubmission.findUniqueOrThrow({ where: { id: "legacy-p" }, include: { items: true } }), legacyBefore);
      assert.ok((await catalog()).some((entry) => entry.name === "formative_activity_submissions"));
    });

    await subtest("installed configuration function compiles its CASE expression and enforces component maxima", async () => {
      // Exercise the function installed by migrate() above, through the unmodified production file.
      await execute(`
        INSERT INTO course_assessment_templates VALUES ('case-template','case-dept',1,100,NULL);
        INSERT INTO assessment_template_components VALUES
          ('case-a','case-dept','case-template','FORMATIVE_ACTIVITIES',30,true),
          ('case-b','case-dept','case-template','ATTENDANCE',5,true),
          ('case-c','case-dept','case-template','COMPREHENSIVE_EXAMINATION',5,true),
          ('case-d','case-dept','case-template','SUMMATIVE_EXAMINATION',60,true);
        INSERT INTO curriculum_courses VALUES ('case-cc','case-dept','case-course','case-template');
        INSERT INTO course_offerings(id,department_id,course_id,curriculum_course_id)
          VALUES ('case-o','case-dept','case-course','case-cc');
      `);
      const configuration = () => client.$queryRaw<Array<{ value: FormativeConfiguration }>>`
        SELECT formative_activity_configuration('case-dept', 'case-o') AS value`;
      assert.deepEqual((await configuration())[0]!.value, configurationFor("case"));
      await execute("UPDATE assessment_template_components SET maximum_marks=29 WHERE id='case-a'");
      await assert.rejects(configuration(), (error: unknown) =>
        error instanceof Prisma.PrismaClientKnownRequestError && error.meta?.code === "23514"
          && /A bound standard 30\/5\/5\/60 assessment template is required/.test(error.message));
    });

    await subtest("legacy rows survive; cutover, historical revisions and whole-offering configuration freeze remain enforced", async () => {
      assert.deepEqual(await client.formativeTeacherSubmission.findUniqueOrThrow({ where: { id: "legacy-p" }, include: { items: true } }), legacyBefore);
      await assert.rejects(execute(legacyInsert.replace("'legacy-p'", "'new-legacy'")), /retired/);
      await assert.rejects(execute(`INSERT INTO formative_mark_evidence SELECT 'legacy-m2', department_id, course_offering_id, activity_id,
        enrollment_id, 2, id, raw_maximum, assigned_weight, raw_mark, weighted_mark, feedback, feedback_completed, integrity_status,
        'Correction', actor_user_id, teacher_assignment_id, assignment_assigned_at, now() FROM formative_mark_evidence WHERE id='legacy-m'`), /cannot be revised/);
      await assert.rejects(execute(`INSERT INTO formative_activities(id,department_id,course_offering_id,title,method,raw_maximum,assigned_weight,updated_at)
        VALUES ('legacy-extra','legacy','legacy-o','Extra','QUIZ',100,1,now())`), /frozen/);
    });
    await subtest("complete assigned Teacher package uses all enrollments, correct HALF_UP and exact snapshots", async () => {
      const f = await fixture(); const p = await f.submit();
      assert.equal(p.enrollmentCount, 2); assert.equal(p.departmentId, f.d);
      assert.equal((p.sourceSnapshotJson as any).sources[0].weightedMark, "0.13");
      assert.deepEqual((p.sourceSnapshotJson as any).configuration, configurationFor(f.d));
      const [reconstructed] = await client.$queryRaw<Array<{ fingerprint: string; configuration: unknown }>>(Prisma.sql`
        SELECT formative_activity_configuration(p.department_id, p.course_offering_id) AS configuration,
          encode(sha256(convert_to(formative_fingerprint_token(p.department_id) || formative_fingerprint_token(p.course_offering_id)
            || formative_fingerprint_token(p.activity_id) || formative_fingerprint_token(p.activity_version::TEXT)
            || formative_fingerprint_token(p.raw_maximum::TEXT) || formative_fingerprint_token(p.assigned_weight::TEXT)
            || formative_fingerprint_token(p.rule_version_code)
            || formative_configuration_fingerprint_tokens(formative_activity_configuration(p.department_id, p.course_offering_id))
            || (SELECT string_agg(formative_fingerprint_token(i.enrollment_id) || formative_fingerprint_token(m.id)
              || formative_fingerprint_token(m.revision::TEXT), '' ORDER BY i.enrollment_id COLLATE "C")
              FROM formative_activity_submission_items i JOIN formative_mark_evidence m ON m.id = i.mark_evidence_id
              WHERE i.submission_id = p.id), 'UTF8')), 'hex') AS fingerprint
        FROM formative_activity_submissions p WHERE p.id = ${p.id}
      `);
      assert.deepEqual(reconstructed!.configuration, (p.sourceSnapshotJson as any).configuration);
      assert.equal(reconstructed!.fingerprint, p.sourceFingerprint);
      assert.equal((await f.service.readActivitySubmissions(`${f.d}-o`, f.activity.id))[0]!.isCurrent, true);
      assert.equal(await client.formativeActivitySubmissionItem.count({ where: { submissionId: p.id } }), 2);
      assert.equal(await client.auditLog.count({ where: { targetId: p.id, action: "formative.activity.teacher-submitted" } }), 1);
    });
    await subtest("direct UPDATE/DELETE of parent, items and mark evidence are blocked; committed parents cannot gain children", async () => {
      const f = await fixture(); const p = await f.submit();
      const item = await client.formativeActivitySubmissionItem.findFirstOrThrow({ where: { submissionId: p.id } });
      for (const [table, id] of [["formative_activity_submissions", p.id], ["formative_activity_submission_items", item.id], ["formative_mark_evidence", item.markEvidenceId]]) {
        await assert.rejects(client.$executeRawUnsafe(`UPDATE ${table} SET id=id WHERE id=$1`, id), /immutable/);
        await assert.rejects(client.$executeRawUnsafe(`DELETE FROM ${table} WHERE id=$1`, id), /immutable/);
      }
      await assert.rejects(client.formativeActivitySubmissionItem.create({ data: { ...item, id: "late-item" } }), /with their parent/);
      await assert.rejects(client.formativeActivity.update({ where: { id: f.activity.id }, data: { title: "Changed", version: { increment: 1 } } }));
      await assert.rejects(client.formativeActivity.delete({ where: { id: f.activity.id } }), /cannot be deleted/);
      const other = await f.service.createActivity(`${f.d}-o`, { title: "Other", method: "QUIZ", rawMaximum: "10", assignedWeight: "2" });
      await f.service.updateActivity(`${f.d}-o`, other.id, { title: "Revised", method: "QUIZ", rawMaximum: "10", assignedWeight: "2" });
    });
    for (const option of ["omitItem", "fingerprint", "snapshot", "version", "scope"] as const) await subtest(`direct package rejects ${option} and rolls back all rows`, async () => {
      const f = await fixture();
      await assert.rejects(client.$transaction((tx) => rawPackage(f, tx, { [option]: true })));
      assert.equal(await client.formativeActivitySubmission.count({ where: { activityId: f.activity.id } }), 0);
      assert.equal(await client.formativeActivitySubmissionItem.count({ where: { activityId: f.activity.id } }), 0);
    });
    await subtest("forged template id/version, Activities component id/maximum fail even with a matching forged hash", async () => {
      const f = await fixture(); const configuration = configurationFor(f.d);
      for (const forged of [
        { ...configuration, templateId: "forged" }, { ...configuration, templateVersion: 2 },
        { ...configuration, components: configuration.components.map((c) => c.code === "FORMATIVE_ACTIVITIES" ? { ...c, id: "forged" } : c) },
        { ...configuration, components: configuration.components.map((c) => c.code === "FORMATIVE_ACTIVITIES" ? { ...c, maximum: "29.00" } : c) },
      ]) for (const changes of [
        { configurationSnapshot: true }, { configurationFingerprint: true },
        { configurationSnapshot: true, configurationFingerprint: true },
      ]) await assert.rejects(client.$transaction((tx) => rawPackage(f, tx, { configuration: forged, ...changes })), /snapshot\/fingerprint mismatch/);
      assert.equal(await client.formativeActivitySubmission.count({ where: { activityId: f.activity.id } }), 0);
      await assert.rejects(client.$transaction(async (tx) => {
        await rawPackage(f, tx);
        await tx.$executeRaw(Prisma.sql`UPDATE course_assessment_templates SET version_number=2 WHERE id=${f.d + "-template"}`);
      }), /snapshot\/fingerprint mismatch/);
    });
    await subtest("direct SQL enforces cumulative partial/exact/over-budget INSERT and replacement UPDATE", async () => {
      const f = await fixture(); // Existing MARKING activity counts with weight 1.
      const insert = (id: string, weight: string) => client.$executeRaw(Prisma.sql`
        INSERT INTO formative_activities(id,department_id,course_offering_id,title,method,raw_maximum,assigned_weight,updated_at)
        VALUES (${id},${f.d},${f.d + "-o"},'Budget test','QUIZ',100,${new Prisma.Decimal(weight)},now())
      `);
      await insert(`${f.d}-budget`, "28");
      await client.$executeRaw(Prisma.sql`UPDATE formative_activities SET assigned_weight=29,version=version+1 WHERE id=${f.d + "-budget"}`);
      await assert.rejects(insert(`${f.d}-excess`, "0.01"), /30.00 budget/);
      await assert.rejects(client.$executeRaw(Prisma.sql`UPDATE formative_activities SET assigned_weight=29.01,version=version+1 WHERE id=${f.d + "-budget"}`), /30.00 budget/);
      await client.$executeRaw(Prisma.sql`UPDATE formative_activities SET assigned_weight=28,version=version+1 WHERE id=${f.d + "-budget"}`);
      await insert(`${f.d}-exact`, "1");
      const total = await client.formativeActivity.aggregate({ where: { courseOfferingId: `${f.d}-o` }, _sum: { assignedWeight: true } });
      assert.equal(total._sum.assignedWeight!.toFixed(2), "30.00");
    });
    for (const isolationLevel of [Prisma.TransactionIsolationLevel.ReadCommitted, Prisma.TransactionIsolationLevel.RepeatableRead,
      Prisma.TransactionIsolationLevel.Serializable]) for (const operation of ["insert", "update"]) {
      await subtest(`concurrent ${operation} budget checks serialize under ${isolationLevel}`, async () => {
        const f = await fixture();
        if (operation === "update") for (const n of [1, 2]) await client.formativeActivity.create({ data: {
          id: `${f.d}-budget${n}`, departmentId: f.d, courseOfferingId: `${f.d}-o`, title: "Draft", method: "QUIZ", rawMaximum: 100, assignedWeight: 10,
        } });
        let arrivals = 0; let release!: () => void;
        const bothHaveSnapshots = new Promise<void>((resolve) => { release = resolve; });
        const write = (n: number) => client.$transaction(async (tx) => {
          await tx.$queryRaw(Prisma.sql`SELECT id FROM course_offerings WHERE id=${f.d + "-o"}`);
          if (++arrivals === 2) release();
          await bothHaveSnapshots;
          if (operation === "insert") return tx.formativeActivity.create({ data: {
            departmentId: f.d, courseOfferingId: `${f.d}-o`, title: "Concurrent", method: "QUIZ", rawMaximum: 100, assignedWeight: 20,
          } });
          return tx.formativeActivity.update({ where: { id: `${f.d}-budget${n}` }, data: { assignedWeight: 15, version: { increment: 1 } } });
        }, { isolationLevel, timeout: 10000 });
        const results = await Promise.allSettled([write(1), write(2)]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        const total = await client.formativeActivity.aggregate({ where: { courseOfferingId: `${f.d}-o` }, _sum: { assignedWeight: true } });
        assert.equal(total._sum.assignedWeight!.toFixed(2), operation === "insert" ? "21.00" : "26.00");
      });
    }
    await subtest("stale source selection fails at commit, and server arithmetic rejects forged weighted evidence", async () => {
      const f = await fixture(); await f.adjust();
      await assert.rejects(client.$transaction((tx) => rawPackage(f, tx, { stale: true })), /stale/);
      const m = await client.formativeMarkEvidence.findFirstOrThrow({ where: { activityId: f.activity.id, enrollmentId: `${f.d}-e1` }, orderBy: { revision: "desc" } });
      await assert.rejects(client.formativeMarkEvidence.create({ data: { ...m, id: "forged-weight", revision: m.revision + 1,
        previousId: m.id, reason: "Forged", weightedMark: new Prisma.Decimal(30) } }), /formative_mark_values_check/);
    });
    await subtest("post-submission feedback revision requires reason and exact current Teacher permission, then stales old package", async () => {
      const f = await fixture(); const p = await f.submit();
      const old = await client.formativeMarkEvidence.findFirstOrThrow({ where: { activityId: f.activity.id, enrollmentId: `${f.d}-e1` } });
      const revised = { ...old, id: "corrected-feedback", revision: 2, previousId: old.id, feedback: "Revised feedback" };
      for (const reason of [null, "", " \t\n"]) await assert.rejects(client.formativeMarkEvidence.create({ data: { ...revised, reason } }), /reason/);
      await execute(`DELETE FROM role_permissions WHERE role_id='${f.d}-role'`);
      await assert.rejects(client.formativeMarkEvidence.create({ data: { ...revised, reason: "Reviewed" } }), /authority/);
      await execute(`INSERT INTO role_permissions VALUES ('${f.d}-role','${f.d}-p')`);
      await execute(`UPDATE teacher_course_assignments SET status='INACTIVE' WHERE id='${f.d}-assignment'`);
      await assert.rejects(client.formativeMarkEvidence.create({ data: { ...revised, reason: "Reviewed" } }), /authority/);
      await execute(`UPDATE teacher_course_assignments SET status='ACTIVE' WHERE id='${f.d}-assignment'`);
      await f.service.adjustMark(`${f.d}-o`, f.activity.id, `${f.d}-e1`, { ...markInput, feedback: "Revised feedback", reason: "Reviewed script" });
      assert.deepEqual(await client.formativeMarkEvidence.findUniqueOrThrow({ where: { id: old.id } }), old);
      assert.equal((await f.service.readActivitySubmissions(`${f.d}-o`, f.activity.id))[0]!.isCurrent, false);
      const next = await f.submit(); assert.equal(next.version, 2); assert.equal(next.previousId, p.id);
      assert.deepEqual((await f.service.readActivitySubmissions(`${f.d}-o`, f.activity.id)).map((row) => row.isCurrent), [false, true]);
      await assert.rejects(f.submit(), /unchanged/);
    });
    await subtest("enrollment scope changes stale old packages without rewriting them", async () => {
      const f = await fixture(); await f.submit();
      await execute(`INSERT INTO enrollments(id,department_id,course_offering_id) VALUES ('${f.d}-e3','${f.d}','${f.d}-o')`);
      assert.equal((await f.service.readActivitySubmissions(`${f.d}-o`, f.activity.id))[0]!.isCurrent, false);
      await assert.rejects(f.submit(), /raw mark/);
      await f.service.adjustMark(`${f.d}-o`, f.activity.id, `${f.d}-e3`, { ...markInput, reason: "Enrollment approved after submission" });
      const next = await f.submit(); assert.equal(next.enrollmentCount, 3);
    });
    await subtest("audit failure rolls back submission children and corrections in the real transaction", async () => {
      const f = await fixture();
      const broken = new FormativeAssessmentService({ $transaction: (work: any, options: any) => client.$transaction((tx) =>
        work(new Proxy(tx, { get(target, key) {
          if (key === "auditLog") return { create: () => { throw Error("audit unavailable"); } };
          const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
        } })), options) } as never, f.context as never, new AuthorizationService());
      await assert.rejects(broken.submitActivity(`${f.d}-o`, f.activity.id), /audit unavailable/);
      assert.equal(await client.formativeActivitySubmission.count({ where: { activityId: f.activity.id } }), 0);
      assert.equal(await client.formativeActivitySubmissionItem.count({ where: { activityId: f.activity.id } }), 0);
      await f.submit();
      await assert.rejects(broken.adjustMark(`${f.d}-o`, f.activity.id, `${f.d}-e1`, { ...markInput, rawMark: "2", reason: "Correction" }), /audit unavailable/);
      assert.equal(await client.formativeMarkEvidence.count({ where: { activityId: f.activity.id } }), 2);
    });
    await subtest("concurrent resubmissions have exactly one successor and an unbroken version chain", async () => {
      const f = await fixture(); const first = await f.submit(); await f.adjust();
      const results = await Promise.allSettled([f.submit(), f.submit()]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const history = await client.formativeActivitySubmission.findMany({ where: { activityId: f.activity.id }, orderBy: { version: "asc" } });
      assert.deepEqual(history.map((p) => p.version), [1, 2]); assert.equal(history[1]!.previousId, first.id);
    });
  } finally {
    // Keep the isolated schema as evidence; never disable academic guards for cleanup.
    t.diagnostic(`Disposable PostgreSQL evidence schema: ${schema}`);
    await client.$disconnect(); await admin.$disconnect();
  }
});
