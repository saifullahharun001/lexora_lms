import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

// Never uses DATABASE_URL. Opt-in only on an explicitly acknowledged loopback *_test database.
// Minimal parent fixtures isolate this additive migration; this does not claim a full-chain/server test.
const url = process.env.LEXORA_COMPREHENSIVE_TEST_DATABASE_URL;
const enabled = Boolean(url && process.env.LEXORA_COMPREHENSIVE_DISPOSABLE_DB_CONFIRM === "YES_DISPOSABLE");
function statements(sql: string): string[] {
  const parts: string[] = []; let start = 0; let quoted = false; let dollar = false; let comment = false;
  for (let i = 0; i < sql.length; i++) {
    if (comment) { if (sql[i] === "\n") comment = false; continue; }
    if (!quoted && !dollar && sql.slice(i, i + 2) === "--") { comment = true; i++; continue; }
    if (!quoted && sql.slice(i, i + 2) === "$$") { dollar = !dollar; i++; continue; }
    if (!dollar && sql[i] === "'") { if (quoted && sql[i + 1] === "'") { i++; continue; } quoted = !quoted; }
    if (!dollar && !quoted && sql[i] === ";") { parts.push(sql.slice(start, i + 1)); start = i + 1; }
  }
  return parts.filter((p) => !/^\s*(BEGIN|COMMIT);\s*$/.test(p));
}

test("Comprehensive PostgreSQL constraints and immutable evidence (disposable database only)", { skip: !enabled }, async (t) => {
  const parsed = new URL(url!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname), "Only a local disposable PostgreSQL instance is permitted");
  assert.match(parsed.pathname, /_test$/);
  const client = new PrismaClient({ datasourceUrl: url });
  const schema = `comprehensive_test_${randomUUID().replaceAll("-", "")}`;
  const rollback = new Error("intentional disposable fixture rollback");
  try {
    await assert.rejects(client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      const parents = `
CREATE TYPE "ExaminationCommitteeSeat" AS ENUM ('CHAIRMAN','MEMBER_1','MEMBER_2','EXTERNAL_MEMBER');
CREATE TABLE departments(id TEXT PRIMARY KEY,status TEXT DEFAULT 'ACTIVE',archived_at TIMESTAMP,deleted_at TIMESTAMP);
CREATE TABLE users(id TEXT PRIMARY KEY,department_id TEXT REFERENCES departments(id),status TEXT DEFAULT 'ACTIVE',archived_at TIMESTAMP,deleted_at TIMESTAMP,UNIQUE(id,department_id));
CREATE TABLE roles(id TEXT PRIMARY KEY,department_id TEXT,code TEXT,archived_at TIMESTAMP);
CREATE TABLE user_roles(id TEXT PRIMARY KEY,user_id TEXT,department_id TEXT,role_id TEXT,revoked_at TIMESTAMP,expires_at TIMESTAMP);
CREATE TYPE "PermissionScope" AS ENUM ('DEPARTMENT','SELF','PUBLIC_VERIFICATION');
CREATE TABLE permissions(id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE,resource TEXT NOT NULL,action TEXT NOT NULL,scope "PermissionScope" NOT NULL);
CREATE TABLE role_permissions(id TEXT PRIMARY KEY,role_id TEXT NOT NULL REFERENCES roles(id),permission_id TEXT NOT NULL REFERENCES permissions(id),UNIQUE(role_id,permission_id));
CREATE TABLE examinations(id TEXT PRIMARY KEY,department_id TEXT,academic_program_id TEXT,academic_session_id TEXT,academic_term_id TEXT,rule_version_code TEXT,archived_at TIMESTAMP,UNIQUE(id,department_id),UNIQUE(id,department_id,academic_program_id,academic_session_id,academic_term_id));
CREATE TABLE examination_committees(id TEXT PRIMARY KEY,department_id TEXT,examination_id TEXT,archived_at TIMESTAMP);
CREATE TABLE examination_committee_assignments(id TEXT PRIMARY KEY,department_id TEXT,committee_id TEXT,examination_id TEXT,assigned_user_id TEXT,seat "ExaminationCommitteeSeat",status TEXT DEFAULT 'ACTIVE',assigned_at TIMESTAMP(3),expires_at TIMESTAMP,unassigned_at TIMESTAMP,archived_at TIMESTAMP);
CREATE TABLE student_curriculum_assignments(id TEXT PRIMARY KEY,department_id TEXT,student_user_id TEXT,academic_program_id TEXT,curriculum_version_id TEXT);
CREATE TABLE course_offerings(id TEXT PRIMARY KEY,department_id TEXT,status TEXT,archived_at TIMESTAMP);
CREATE TABLE course_assessment_templates(id TEXT PRIMARY KEY,department_id TEXT,version_number INTEGER,archived_at TIMESTAMP);
CREATE TABLE assessment_template_components(id TEXT PRIMARY KEY,department_id TEXT,assessment_template_id TEXT,code TEXT,maximum_marks NUMERIC);
CREATE TABLE examination_courses(id TEXT PRIMARY KEY,department_id TEXT,examination_id TEXT,course_offering_id TEXT,curriculum_course_id TEXT,curriculum_version_id TEXT,academic_term_id TEXT,academic_program_id TEXT,assessment_template_id TEXT,archived_at TIMESTAMP);
CREATE TABLE enrollments(id TEXT PRIMARY KEY,department_id TEXT,course_offering_id TEXT,student_user_id TEXT,student_curriculum_assignment_id TEXT,curriculum_course_id TEXT,academic_term_id TEXT,status TEXT,enrolled_at TIMESTAMP,dropped_at TIMESTAMP,archived_at TIMESTAMP);
`;
      for (const sql of statements(parents)) await tx.$executeRawUnsafe(sql);
      const migration = readFileSync(path.resolve(process.cwd(), "prisma/migrations/202609210002_add_regular_comprehensive_workflow/migration.sql"), "utf8");
      for (const sql of statements(migration)) await tx.$executeRawUnsafe(sql);
      const execute = async (sql: string) => { for (const statement of statements(sql)) await tx.$executeRawUnsafe(statement); };
      const rejects = async (sql: string, expected?: RegExp) => {
        await tx.$executeRawUnsafe("SAVEPOINT negative_probe");
        try {
          if (expected) await assert.rejects(execute(sql), expected);
          else await assert.rejects(execute(sql));
        } finally {
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT negative_probe");
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT negative_probe");
        }
      };
      const isolated = async (work: () => Promise<void>) => {
        await tx.$executeRawUnsafe("SAVEPOINT permission_fixture");
        try { await work(); } finally {
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT permission_fixture");
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT permission_fixture");
        }
      };
      const removeGrant = (role: string, permission: string) =>
        execute(`DELETE FROM role_permissions WHERE role_id='${role}' AND permission_id='${permission}';`);
      const restoreGrant = (role: string, permission: string) =>
        execute(`INSERT INTO role_permissions(id,role_id,permission_id) VALUES ('${role}-${permission}','${role}','${permission}');`);
      const permissionRequired = async (role: string, permission: string, operation: string, expected: RegExp) => {
        await isolated(async () => {
          await removeGrant(role, permission);
          await rejects(operation, expected);
          await restoreGrant(role, permission);
          await execute(operation);
        });
      };
      await execute(`
INSERT INTO departments(id) VALUES ('law');
INSERT INTO users(id,department_id) VALUES ('admin','law'),('poe','law'),('CHAIRMAN','law'),('MEMBER_1','law'),('MEMBER_2','law'),('EXTERNAL_MEMBER','law'),('student','law');
INSERT INTO roles(id,department_id,code) VALUES ('teacher','law','teacher'),('external','law','comprehensive_external'),('poe','law','poe_chairman'),('student','law','student');
INSERT INTO user_roles(id,user_id,department_id,role_id) VALUES ('c','CHAIRMAN','law','teacher'),('m1','MEMBER_1','law','teacher'),('m2','MEMBER_2','law','teacher'),('x','EXTERNAL_MEMBER','law','external'),('p','poe','law','poe'),('s','student','law','student');
INSERT INTO permissions(id,code,resource,action,scope) VALUES
 ('configure','comprehensive-examination.configuration.manage_department','comprehensive-examination.configuration','manage','DEPARTMENT'),
 ('mark','comprehensive-examination.mark.enter_department','comprehensive-examination.mark','enter','DEPARTMENT'),
 ('review','comprehensive-examination.chairman.review_department','comprehensive-examination.chairman','review','DEPARTMENT'),
 ('finalise','comprehensive-examination.chairman.finalise_department','comprehensive-examination.chairman','finalise','DEPARTMENT');
INSERT INTO role_permissions(id,role_id,permission_id) VALUES ('teacher-configure','teacher','configure'),('teacher-mark','teacher','mark'),('teacher-review','teacher','review'),('teacher-finalise','teacher','finalise'),('external-mark','external','mark');
INSERT INTO permissions(id,code,resource,action,scope) VALUES ('classify','examination-candidate.classification.manage_department','examination-candidate.classification','manage','DEPARTMENT');
INSERT INTO role_permissions(id,role_id,permission_id) VALUES ('poe-classify','poe','classify');
INSERT INTO examinations VALUES ('exam','law','program','session','term','LLB_2025',NULL);
INSERT INTO examination_committees VALUES ('committee','law','exam',NULL);
INSERT INTO examination_committee_assignments(id,department_id,committee_id,examination_id,assigned_user_id,seat,assigned_at) VALUES
 ('CHAIRMAN','law','committee','exam','CHAIRMAN','CHAIRMAN','2026-01-01'),('MEMBER_1','law','committee','exam','MEMBER_1','MEMBER_1','2026-01-01'),('MEMBER_2','law','committee','exam','MEMBER_2','MEMBER_2','2026-01-01'),('EXTERNAL_MEMBER','law','committee','exam',NULL,'EXTERNAL_MEMBER','2026-01-01');
INSERT INTO student_curriculum_assignments VALUES ('sca','law','student','program','curriculum');
INSERT INTO course_offerings VALUES ('offering','law','ACTIVE',NULL);
INSERT INTO course_assessment_templates VALUES ('template','law',1,NULL);
INSERT INTO assessment_template_components VALUES ('component','law','template','COMPREHENSIVE_EXAMINATION',5);
INSERT INTO examination_courses VALUES ('course','law','exam','offering','cc','curriculum','term','program','template',NULL);
INSERT INTO enrollments VALUES ('enrollment','law','offering','student','sca','cc','term','APPROVED',CURRENT_TIMESTAMP,NULL,NULL);
INSERT INTO poe_chairman_assignments(id,department_id,user_id,source_reference,starts_at,expires_at,recorded_by_user_id) VALUES ('poe-appointment','law','poe','Official appointment','2026-01-01','2099-01-01','admin');
INSERT INTO external_comprehensive_access(id,department_id,assignment_id,assignment_assigned_at,user_id,expires_at,recorded_by_user_id,source_reference) VALUES ('access','law','EXTERNAL_MEMBER','2026-01-01','EXTERNAL_MEMBER','2099-01-01','admin','Formal external binding');
INSERT INTO examination_candidate_lists(id,department_id,examination_id,academic_program_id,academic_session_id,academic_term_id,source_reference,rule_version_code,recorded_by_user_id,recorded_poe_assignment_id) VALUES ('list','law','exam','program','session','term','Official POE candidate list','LLB_2025','poe','poe-appointment');
INSERT INTO examination_candidate_registrations(id,department_id,list_id,examination_id,student_user_id,curriculum_assignment_id,category,recorded_by_user_id,recorded_poe_assignment_id) VALUES ('candidate','law','list','exam','student','sca','REGULAR','poe','poe-appointment');
INSERT INTO examination_candidate_courses(id,department_id,registration_id,examination_course_id,enrollment_id) VALUES ('candidate-course','law','candidate','course','enrollment');
INSERT INTO users(id,department_id) VALUES ('student-irregular','law');
INSERT INTO student_curriculum_assignments VALUES ('sca-irregular','law','student-irregular','program','curriculum');
INSERT INTO enrollments VALUES ('enrollment-irregular','law','offering','student-irregular','sca-irregular','cc','term','APPROVED',CURRENT_TIMESTAMP,NULL,NULL);
INSERT INTO examination_candidate_registrations(id,department_id,list_id,examination_id,student_user_id,curriculum_assignment_id,category,recorded_by_user_id,recorded_poe_assignment_id) VALUES ('candidate-irregular','law','list','exam','student-irregular','sca-irregular','IRREGULAR','poe','poe-appointment');
INSERT INTO examination_candidate_courses(id,department_id,registration_id,examination_course_id,enrollment_id) VALUES ('candidate-course-irregular','law','candidate-irregular','course','enrollment-irregular');
`);
      const certify = "UPDATE examination_candidate_lists SET status='CERTIFIED',certified_at=CURRENT_TIMESTAMP,certified_by_user_id='poe',chairman_assignment_id='poe-appointment' WHERE id='list';";
      const candidateRow = async () => {
        const rows = await tx.$queryRaw<Array<{ version: number; category: string; curriculum_assignment_id: string; recorded_by_user_id: string }>>`
          SELECT * FROM examination_candidate_registrations WHERE id='candidate'
        `;
        assert.equal(rows.length, 1); return rows[0]!;
      };
      const insertCandidate = (version: number, actor = "poe", appointment = "poe-appointment") =>
        `INSERT INTO examination_candidate_registrations(id,department_id,list_id,examination_id,student_user_id,curriculum_assignment_id,category,recorded_by_user_id,recorded_poe_assignment_id,version)
         VALUES ('candidate','law','list','exam','student','sca','REGULAR','${actor}','${appointment}',${version});`;
      const appointSuccessor = () => execute(`
INSERT INTO users(id,department_id) VALUES ('poe-successor','law');
INSERT INTO user_roles(id,user_id,department_id,role_id) VALUES ('p-successor','poe-successor','law','poe');
UPDATE poe_chairman_assignments SET revoked_at=CURRENT_TIMESTAMP,revoked_by_user_id='admin' WHERE id='poe-appointment';
INSERT INTO poe_chairman_assignments(id,department_id,user_id,source_reference,starts_at,expires_at,recorded_by_user_id) VALUES ('successor-appointment','law','poe-successor','Successor appointment','2026-01-01','2099-01-01','admin');
`);
      const appointmentFixture = (id: string, actor = "poe", starts = "2026-01-01", expires = "2099-01-01") =>
        // poe_chairman_current_uq includes every unrevoked appointment, even expired/future ones.
        // Use permitted revocation before replacement; the caller's SAVEPOINT restores both.
        `UPDATE poe_chairman_assignments SET revoked_at=CURRENT_TIMESTAMP,revoked_by_user_id='admin' WHERE id='poe-appointment';
         INSERT INTO poe_chairman_assignments(id,department_id,user_id,source_reference,starts_at,expires_at,recorded_by_user_id)
         VALUES ('${id}','law','${actor}','Authority test appointment','${starts}','${expires}','admin');`;
      for (const operation of ["list INSERT", "registration INSERT", "registration UPDATE"] as const) {
        const prepare = async () => {
          if (operation === "list INSERT") await execute("INSERT INTO examinations VALUES ('draft-exam','law','program','session','term','LLB_2025',NULL);");
          if (operation === "registration INSERT") await execute("DELETE FROM examination_candidate_courses WHERE registration_id='candidate'; DELETE FROM examination_candidate_registrations WHERE id='candidate';");
        };
        const record = (actor = "poe", appointment = "poe-appointment") => operation === "list INSERT" ?
          `INSERT INTO examination_candidate_lists(id,department_id,examination_id,academic_program_id,academic_session_id,academic_term_id,source_reference,rule_version_code,recorded_by_user_id,recorded_poe_assignment_id)
           VALUES ('draft-list','law','draft-exam','program','session','term','Official list','LLB_2025','${actor}','${appointment}');` :
          operation === "registration INSERT" ? insertCandidate(1, actor, appointment) :
          `UPDATE examination_candidate_registrations SET category='IRREGULAR',version=version+1,recorded_by_user_id='${actor}',recorded_poe_assignment_id='${appointment}' WHERE id='candidate';`;
        const rows = () => tx.$queryRawUnsafe<Array<{ recorded_by_user_id: string; recorded_poe_assignment_id: string }>>(
          operation === "list INSERT" ? "SELECT * FROM examination_candidate_lists WHERE id='draft-list'" : "SELECT * FROM examination_candidate_registrations WHERE id='candidate'");
        const appointmentError = /Current recorded POE Chairman appointment required/;
        const permissionError = /Exact classification permission required for draft recording/;
        for (const [name, setup, actor, appointment, expected] of [
          ["arbitrary actor", "", "admin", "poe-appointment", appointmentError],
          ["missing appointment", "", "poe", "missing", appointmentError],
          ["non-POE Committee appointment", "", "poe", "CHAIRMAN", appointmentError],
          ["appointment bound to another actor", appointmentFixture("other-appointment", "admin"), "poe", "other-appointment", appointmentError],
          ["revoked appointment", "UPDATE poe_chairman_assignments SET revoked_at=CURRENT_TIMESTAMP,revoked_by_user_id='admin' WHERE id='poe-appointment';", "poe", "poe-appointment", appointmentError],
          ["expired appointment", appointmentFixture("expired-appointment", "poe", "2019-01-01", "2020-01-01"), "poe", "expired-appointment", appointmentError],
          ["future appointment", appointmentFixture("future-appointment", "poe", "2098-01-01", "2099-01-01"), "poe", "future-appointment", appointmentError],
          ["foreign department appointment", `INSERT INTO departments(id) VALUES ('auth-foreign');
INSERT INTO users(id,department_id) VALUES ('foreign-poe','auth-foreign');
INSERT INTO poe_chairman_assignments(id,department_id,user_id,source_reference,starts_at,expires_at,recorded_by_user_id)
 VALUES ('foreign-appointment','auth-foreign','foreign-poe','Foreign appointment','2026-01-01','2099-01-01','foreign-poe');`, "foreign-poe", "foreign-appointment", appointmentError],
          ["missing permission", "DELETE FROM role_permissions WHERE role_id='poe' AND permission_id='classify';", "poe", "poe-appointment", permissionError],
          ["wrong permission code", "UPDATE permissions SET code='equivalent.classification.manage_department' WHERE id='classify';", "poe", "poe-appointment", permissionError],
          ["wildcard permission", "UPDATE permissions SET code='*',resource='*',action='*' WHERE id='classify';", "poe", "poe-appointment", permissionError],
          ["exact code but wrong resource", "UPDATE permissions SET resource='examination-authority.appointment' WHERE id='classify';", "poe", "poe-appointment", permissionError],
          ["exact code but wrong action", "UPDATE permissions SET action='read' WHERE id='classify';", "poe", "poe-appointment", permissionError],
          ["exact code but wrong scope", "UPDATE permissions SET scope='SELF' WHERE id='classify';", "poe", "poe-appointment", permissionError],
          ["revoked permission grant", "UPDATE user_roles SET revoked_at=CURRENT_TIMESTAMP WHERE id='p';", "poe", "poe-appointment", permissionError],
          ["expired permission grant", "UPDATE user_roles SET expires_at='2020-01-01' WHERE id='p';", "poe", "poe-appointment", permissionError],
          ["inactive actor", "UPDATE users SET status='INACTIVE' WHERE id='poe';", "poe", "poe-appointment", permissionError],
        ] as const) {
          await t.test(`DRAFT ${operation} rejects ${name}`, async () => {
            await isolated(async () => {
              await prepare(); await execute(setup); const before = await rows();
              await rejects(record(actor, appointment), expected);
              assert.deepEqual(await rows(), before);
            });
          });
        }
        for (const grantRole of ["poe", "teacher"]) {
          await t.test(`DRAFT ${operation} accepts exact current POE with classification granted by ${grantRole} role`, async () => {
            await isolated(async () => {
              await prepare();
              if (grantRole === "teacher") {
                await removeGrant("poe", "classify"); await restoreGrant("teacher", "classify");
                await execute("INSERT INTO user_roles(id,user_id,department_id,role_id) VALUES ('poe-draft-teacher','poe','law','teacher');");
              }
              await execute(record());
              const saved = await rows(); assert.equal(saved.length, 1);
              assert.equal(saved[0]!.recorded_by_user_id, "poe");
              assert.equal(saved[0]!.recorded_poe_assignment_id, "poe-appointment");
            });
          });
        }
      }
      for (const version of [1, 0, 2]) {
        await t.test(`DRAFT candidate INSERT version ${version} ${version === 1 ? "succeeds" : "rejects"}`, async () => {
          await isolated(async () => {
            await execute("DELETE FROM examination_candidate_courses WHERE registration_id='candidate'; DELETE FROM examination_candidate_registrations WHERE id='candidate';");
            if (version === 1) {
              await execute(insertCandidate(version)); assert.equal((await candidateRow()).version, 1);
            } else {
              await rejects(insertCandidate(version), /Candidate initial version must be 1/);
              assert.deepEqual(await tx.$queryRaw`SELECT id FROM examination_candidate_registrations WHERE id='candidate'`, []);
            }
          });
        });
      }
      await t.test("DRAFT category revisions accept 1 -> 2 -> 3 with the same actor and reject 3 -> 5", async () => {
        await isolated(async () => {
          const initial = await candidateRow(); assert.equal(initial.version, 1);
          await execute("UPDATE examination_candidate_registrations SET category='IRREGULAR',version=version+1 WHERE id='candidate';");
          assert.deepEqual(await candidateRow(), { ...initial, category: "IRREGULAR", version: 2 });
          await execute("UPDATE examination_candidate_registrations SET category='IMPROVEMENT',version=version+1 WHERE id='candidate';");
          const third = { ...initial, category: "IMPROVEMENT", version: 3 };
          assert.deepEqual(await candidateRow(), third);
          await rejects("UPDATE examination_candidate_registrations SET category='REGULAR',version=5 WHERE id='candidate';",
            /Candidate revision version must increment by exactly 1/);
          assert.deepEqual(await candidateRow(), third);
        });
      });
      for (const [name, change, expected] of [
        ["same version", "category='IMPROVEMENT',version=2", /Candidate revision version must increment by exactly 1/],
        ["version jump", "category='IMPROVEMENT',version=4", /Candidate revision version must increment by exactly 1/],
        ["positive version decrease", "category='IMPROVEMENT',version=1", /Candidate revision version must increment by exactly 1/],
        ["version-only increment", "version=3", /Candidate revision requires a classification or curriculum change/],
        ["recorded actor-only change with increment", "recorded_by_user_id='admin',version=3", /Candidate revision requires a classification or curriculum change/],
        ["recorded appointment-only change with increment", "recorded_poe_assignment_id='renewed-appointment',version=3", /Candidate revision requires a classification or curriculum change/],
      ] as const) {
        await t.test(`DRAFT candidate UPDATE rejects ${name}`, async () => {
          await isolated(async () => {
            await execute("UPDATE examination_candidate_registrations SET category='IRREGULAR',version=2 WHERE id='candidate';");
            if (name === "recorded appointment-only change with increment") await execute(appointmentFixture("renewed-appointment"));
            const before = await candidateRow();
            await rejects(`UPDATE examination_candidate_registrations SET ${change} WHERE id='candidate';`, expected);
            assert.deepEqual(await candidateRow(), before);
          });
        });
      }
      await t.test("meaningful DRAFT revision may change recorded actor to the current POE", async () => {
        await isolated(async () => {
          const before = await candidateRow();
          await appointSuccessor();
          await rejects("UPDATE examination_candidate_registrations SET category='IRREGULAR',version=2 WHERE id='candidate';",
            /Current recorded POE Chairman appointment required/);
          await execute("UPDATE examination_candidate_registrations SET category='IRREGULAR',version=2,recorded_by_user_id='poe-successor',recorded_poe_assignment_id='successor-appointment' WHERE id='candidate';");
          assert.deepEqual(await candidateRow(), { ...before, category: "IRREGULAR", version: 2,
            recorded_by_user_id: "poe-successor", recorded_poe_assignment_id: "successor-appointment" });
          await execute("UPDATE examination_candidate_lists SET status='CERTIFIED',certified_at=CURRENT_TIMESTAMP,certified_by_user_id='poe-successor',chairman_assignment_id='successor-appointment' WHERE id='list';");
          assert.deepEqual(await tx.$queryRaw`SELECT recorded_poe_assignment_id,chairman_assignment_id,status FROM examination_candidate_lists WHERE id='list'`,
            [{ recorded_poe_assignment_id: "poe-appointment", chairman_assignment_id: "successor-appointment", status: "CERTIFIED" }]);
        });
      });
      await t.test("DRAFT curriculum revision advances exactly one version and accepts valid replacement sources", async () => {
        await isolated(async () => {
          const before = await candidateRow();
          await execute(`
INSERT INTO student_curriculum_assignments VALUES ('sca-revised','law','student','program','curriculum');
INSERT INTO enrollments VALUES ('enrollment-revised','law','offering','student','sca-revised','cc','term','APPROVED',CURRENT_TIMESTAMP,NULL,NULL);
DELETE FROM examination_candidate_courses WHERE registration_id='candidate';
UPDATE examination_candidate_registrations SET curriculum_assignment_id='sca-revised',version=version+1 WHERE id='candidate';
INSERT INTO examination_candidate_courses(id,department_id,registration_id,examination_course_id,enrollment_id) VALUES ('candidate-course-revised','law','candidate','course','enrollment-revised');
`);
          assert.deepEqual(await candidateRow(), { ...before, curriculum_assignment_id: "sca-revised", version: 2 });
          assert.deepEqual(await tx.$queryRaw`SELECT examination_course_id,enrollment_id FROM examination_candidate_courses WHERE registration_id='candidate'`,
            [{ examination_course_id: "course", enrollment_id: "enrollment-revised" }]);
          await execute(certify);
          assert.deepEqual(await tx.$queryRaw`SELECT status FROM examination_candidate_lists WHERE id='list'`, [{ status: "CERTIFIED" }]);
        });
      });
      await t.test("exact version increment cannot bypass curriculum academic identity checks", async () => {
        await isolated(async () => {
          await execute("INSERT INTO student_curriculum_assignments VALUES ('sca-invalid','law','student','wrong-program','curriculum');");
          const before = await candidateRow();
          await rejects("UPDATE examination_candidate_registrations SET curriculum_assignment_id='sca-invalid',version=2 WHERE id='candidate';",
            /Candidate academic identity mismatch/);
          assert.deepEqual(await candidateRow(), before);
        });
      });
      for (const [name, change, expected] of [
        ["id", "id='candidate-moved'", /Draft candidate identity cannot move/],
        ["list", "list_id='list-next',examination_id='exam-next'", /Draft candidate identity cannot move/],
        ["examination", "examination_id='exam-next'", /Candidate academic identity mismatch/],
        ["student", "student_user_id='student-next',curriculum_assignment_id='sca-next'", /Draft candidate identity cannot move/],
        ["department", "department_id='law-next',list_id='list-foreign',examination_id='exam-foreign',student_user_id='student-foreign',curriculum_assignment_id='sca-foreign',recorded_by_user_id='poe-foreign',recorded_poe_assignment_id='poe-foreign-appointment'", /Draft candidate identity cannot move/],
        ["created_at", "created_at=created_at+INTERVAL '1 second'", /Draft candidate identity cannot move/],
      ] as const) {
        await t.test(`DRAFT candidate ${name} remains immutable during an otherwise meaningful revision`, async () => {
          await isolated(async () => {
            // Valid destination identities ensure movement is not rejected merely by missing FKs.
            await execute(`
INSERT INTO departments(id) VALUES ('law-next');
INSERT INTO users(id,department_id) VALUES ('student-next','law'),('student-foreign','law-next'),('poe-foreign','law-next');
INSERT INTO examinations VALUES ('exam-next','law','program','session','term','LLB_2025',NULL),('exam-foreign','law-next','program','session','term','LLB_2025',NULL);
INSERT INTO student_curriculum_assignments VALUES ('sca-next','law','student-next','program','curriculum'),('sca-foreign','law-next','student-foreign','program','curriculum');
INSERT INTO roles(id,department_id,code) VALUES ('poe-foreign','law-next','poe_chairman');
INSERT INTO user_roles(id,user_id,department_id,role_id) VALUES ('p-foreign','poe-foreign','law-next','poe-foreign');
INSERT INTO role_permissions(id,role_id,permission_id) VALUES ('poe-foreign-classify','poe-foreign','classify');
INSERT INTO poe_chairman_assignments(id,department_id,user_id,source_reference,starts_at,expires_at,recorded_by_user_id) VALUES ('poe-foreign-appointment','law-next','poe-foreign','Foreign appointment','2026-01-01','2099-01-01','poe-foreign');
INSERT INTO examination_candidate_lists(id,department_id,examination_id,academic_program_id,academic_session_id,academic_term_id,source_reference,rule_version_code,recorded_by_user_id,recorded_poe_assignment_id) VALUES
 ('list-next','law','exam-next','program','session','term','Other list','LLB_2025','poe','poe-appointment'),('list-foreign','law-next','exam-foreign','program','session','term','Foreign list','LLB_2025','poe-foreign','poe-foreign-appointment');
`);
            const before = await candidateRow();
            await rejects(`UPDATE examination_candidate_registrations SET ${change},category='IRREGULAR',version=2 WHERE id='candidate';`, expected);
            assert.deepEqual(await candidateRow(), before);
          });
        });
      }
      await t.test("current POE appointment needs exact classification permission; restoration permits certification", async () => {
        await isolated(async () => {
          await removeGrant("poe", "classify");
          await rejects(certify, /Exact classification permission required for certification/);
          await restoreGrant("poe", "classify");
          await execute(certify);
          const rows = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM examination_candidate_lists WHERE id='list'`;
          assert.equal(rows[0]?.status, "CERTIFIED");
        });
      });
      for (const [name, mutation] of [
        ["wildcard", "code='*',resource='*',action='*'"],
        ["equivalent code", "code='equivalent.classification.manage_department'"],
        ["wrong resource", "resource='examination-authority.appointment'"],
        ["wrong action", "action='read'"],
        ["wrong scope", "scope='SELF'"],
      ] as const) {
        await t.test(`certification rejects ${name} classification permission`, async () => {
          await rejects(`UPDATE permissions SET ${mutation} WHERE id='classify';` + certify,
            /Exact classification permission required for certification/);
        });
      }
      for (const [name, mutation] of [
        ["revoked", "revoked_at=CURRENT_TIMESTAMP"],
        ["expired", "expires_at='2020-01-01'"],
      ] as const) {
        await t.test(`certification rejects a ${name} classification UserRole grant`, async () => {
          await rejects(`UPDATE user_roles SET ${mutation} WHERE id='p';` + certify,
            /Exact classification permission required for certification/);
        });
      }
      await t.test("certification accepts classification permission from another live department role", async () => {
        await isolated(async () => {
          await removeGrant("poe", "classify");
          await restoreGrant("teacher", "classify");
          await execute("INSERT INTO user_roles(id,user_id,department_id,role_id) VALUES ('poe-classify-teacher','poe','law','teacher');");
          await execute(certify);
          const rows = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM examination_candidate_lists WHERE id='list'`;
          assert.equal(rows[0]?.status, "CERTIFIED");
        });
      });
      await t.test("exact classification permission cannot replace the current POE appointment", async () => {
        await rejects("UPDATE poe_chairman_assignments SET revoked_at=CURRENT_TIMESTAMP,revoked_by_user_id='admin' WHERE id='poe-appointment';" + certify,
          /Current POE Chairman certification is required/);
      });
      await t.test("certification rejects an omitted current course and succeeds with both exact sources", async () => {
        await tx.$executeRaw`SAVEPOINT candidate_completeness_fixture`;
        try {
          await execute(`
INSERT INTO course_offerings VALUES ('offering-2','law','ACTIVE',NULL);
INSERT INTO examination_courses VALUES ('course-2','law','exam','offering-2','cc-2','curriculum','term','program','template',NULL);
INSERT INTO enrollments VALUES ('enrollment-2','law','offering-2','student','sca','cc-2','term','APPROVED',CURRENT_TIMESTAMP,NULL,NULL);
`);
          // Both courses are current and applicable; only the original course is bound.
          await tx.$executeRaw`SAVEPOINT missing_candidate_source`;
          try {
            await assert.rejects(tx.$executeRaw`
              UPDATE examination_candidate_lists SET status='CERTIFIED',certified_at=CURRENT_TIMESTAMP,
                certified_by_user_id='poe',chairman_assignment_id='poe-appointment' WHERE id='list'
            `, /Certification examination sources incomplete/);
          } finally {
            await tx.$executeRaw`ROLLBACK TO SAVEPOINT missing_candidate_source`;
            await tx.$executeRaw`RELEASE SAVEPOINT missing_candidate_source`;
          }
          await tx.$executeRaw`
            INSERT INTO examination_candidate_courses(id,department_id,registration_id,examination_course_id,enrollment_id)
            VALUES ('candidate-course-2','law','candidate','course-2','enrollment-2')
          `;
          await tx.$executeRaw`
            UPDATE examination_candidate_lists SET status='CERTIFIED',certified_at=CURRENT_TIMESTAMP,
              certified_by_user_id='poe',chairman_assignment_id='poe-appointment' WHERE id='list'
          `;
          const certified = await tx.$queryRaw<Array<{ status: string }>>`
            SELECT status FROM examination_candidate_lists WHERE id='list'
          `;
          assert.equal(certified[0]?.status, "CERTIFIED");
        } finally {
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT candidate_completeness_fixture`;
          await tx.$executeRaw`RELEASE SAVEPOINT candidate_completeness_fixture`;
        }
      });
      await t.test("roster lock rejects a partial nonempty REGULAR package and succeeds only after the missing source is added", async () => {
        await isolated(async () => {
          await execute(`
INSERT INTO users(id,department_id) VALUES ('student-second-regular','law');
INSERT INTO student_curriculum_assignments VALUES ('sca-second-regular','law','student-second-regular','program','curriculum');
INSERT INTO enrollments VALUES ('enrollment-second-regular','law','offering','student-second-regular','sca-second-regular','cc','term','APPROVED',CURRENT_TIMESTAMP,NULL,NULL);
INSERT INTO examination_candidate_registrations(id,department_id,list_id,examination_id,student_user_id,curriculum_assignment_id,category,recorded_by_user_id,recorded_poe_assignment_id)
 VALUES ('second-regular','law','list','exam','student-second-regular','sca-second-regular','REGULAR','poe','poe-appointment');
INSERT INTO examination_candidate_courses(id,department_id,registration_id,examination_course_id,enrollment_id) VALUES ('second-regular-source','law','second-regular','course','enrollment-second-regular');
${certify}
INSERT INTO comprehensive_examinations(id,department_id,examination_id,committee_id,candidate_list_id,exam_date,mode,rule_version_code,configured_by_user_id,configured_assignment_id,configured_assignment_assigned_at)
 VALUES ('partial-package','law','exam','committee','list','2026-09-21','ALL_MEMBERS_AVERAGE','LLB_2025','CHAIRMAN','CHAIRMAN','2026-01-01');
INSERT INTO comprehensive_courses(id,department_id,comprehensive_id,examination_course_id,assessment_component_id,full_mark,template_version,academic_snapshot)
 VALUES ('partial-course','law','partial-package','course','component',5,1,'{}');
INSERT INTO comprehensive_roster_entries(id,department_id,comprehensive_id,course_id,registration_id,candidate_course_id,registration_version)
 VALUES ('partial-row','law','partial-package','partial-course','candidate','candidate-course',1);
`);
          const lock = "UPDATE comprehensive_examinations SET roster_locked_at=CURRENT_TIMESTAMP,roster_locked_by_user_id='CHAIRMAN',roster_locked_by_assignment_id='CHAIRMAN',roster_locked_by_assignment_assigned_at='2026-01-01' WHERE id='partial-package';";
          await rejects(lock, /Roster lock requires exact complete REGULAR sources/);
          await execute("INSERT INTO comprehensive_roster_entries(id,department_id,comprehensive_id,course_id,registration_id,candidate_course_id,registration_version) VALUES ('second-row','law','partial-package','partial-course','second-regular','second-regular-source',1);" + lock);
          assert.deepEqual(await tx.$queryRaw`SELECT roster_locked_by_user_id FROM comprehensive_examinations WHERE id='partial-package'`, [{ roster_locked_by_user_id: "CHAIRMAN" }]);
        });
      });
      await tx.$executeRaw`
        UPDATE examination_candidate_lists SET status='CERTIFIED',certified_at=CURRENT_TIMESTAMP,
          certified_by_user_id='poe',chairman_assignment_id='poe-appointment' WHERE id='list'
      `;
      await t.test("certified category UPDATE and DELETE rejected", async () => {
        await rejects("UPDATE examination_candidate_registrations SET category='IMPROVEMENT' WHERE id='candidate';");
        await rejects("DELETE FROM examination_candidate_registrations WHERE id='candidate';");
        await rejects("UPDATE examination_candidate_lists SET source_reference='replacement' WHERE id='list';");
        await rejects("UPDATE enrollments SET academic_term_id='other-term' WHERE id='enrollment';");
        await rejects("UPDATE student_curriculum_assignments SET curriculum_version_id='other-curriculum' WHERE id='sca';");
      });
      await t.test("certified registration rejects even meaningful exact-version UPDATE and DELETE", async () => {
        const before = await candidateRow();
        await rejects("UPDATE examination_candidate_registrations SET category='IMPROVEMENT',version=version+1 WHERE id='candidate';",
          /Certified classification and enrollment sources are immutable/);
        await rejects("DELETE FROM examination_candidate_registrations WHERE id='candidate';",
          /Certified classification and enrollment sources are immutable/);
        assert.deepEqual(await candidateRow(), before);
      });
      const configure = "INSERT INTO comprehensive_examinations(id,department_id,examination_id,committee_id,candidate_list_id,exam_date,mode,rule_version_code,configured_by_user_id,configured_assignment_id,configured_assignment_assigned_at) VALUES ('comprehensive','law','exam','committee','list','2026-09-21','ALL_MEMBERS_AVERAGE','LLB_2025','CHAIRMAN','CHAIRMAN','2026-01-01');";
      await t.test("current Chairman/Teacher needs exact configuration permission; restoration permits INSERT", async () => {
        await permissionRequired("teacher", "configure", configure, /Exact configuration permission required/);
      });
      await execute(configure);
      await t.test("date-only and mode configuration UPDATE require exact permission", async () => {
        for (const change of ["exam_date='2026-09-22'", "mode='CHAIRMAN_ONLY'"]) {
          await permissionRequired("teacher", "configure", `UPDATE comprehensive_examinations SET ${change} WHERE id='comprehensive';`, /Exact configuration permission required/);
        }
      });
      await t.test("configuration actor-only UPDATE still requires exact Chairman identity", async () => {
        await rejects("UPDATE comprehensive_examinations SET configured_by_user_id='MEMBER_1' WHERE id='comprehensive';", /Current configuration Chairman required/);
      });
      await execute(`
INSERT INTO comprehensive_courses(id,department_id,comprehensive_id,examination_course_id,assessment_component_id,full_mark,template_version,academic_snapshot) VALUES ('comprehensive-course','law','comprehensive','course','component',5,1,'{}');
`);
      const lockRoster = (actor = "CHAIRMAN", assignment = "CHAIRMAN", assignedAt = "'2026-01-01'") =>
        `UPDATE comprehensive_examinations SET roster_locked_at=CURRENT_TIMESTAMP,roster_locked_by_user_id='${actor}',roster_locked_by_assignment_id='${assignment}',roster_locked_by_assignment_assigned_at=${assignedAt} WHERE id='comprehensive';`;
      const allocate = (actor = "CHAIRMAN", assignment = "CHAIRMAN", assignedAt = "'2026-01-01'", target = "MEMBER_1") =>
        `UPDATE comprehensive_courses SET assigned_committee_assignment_id='${target}',allocated_assignment_assigned_at='2026-01-01',allocation_changed_by_user_id='${actor}',allocation_changed_by_assignment_id='${assignment}',allocation_changed_by_assignment_assigned_at=${assignedAt} WHERE id='comprehensive-course';`;
      const rosterRow = "INSERT INTO comprehensive_roster_entries(id,department_id,comprehensive_id,course_id,registration_id,candidate_course_id,registration_version) VALUES ('roster','law','comprehensive','comprehensive-course','candidate','candidate-course',1);";
      const startMarking = (actor = "MEMBER_1", assignment = "MEMBER_1", assignedAt = "'2026-01-01'", external = "NULL") =>
        `UPDATE comprehensive_examinations SET status='MARKING',marking_started_at=CURRENT_TIMESTAMP,marking_started_by_user_id='${actor}',marking_started_by_assignment_id='${assignment}',marking_started_by_assignment_assigned_at=${assignedAt},marking_started_external_access_id=${external} WHERE id='comprehensive';`;
      const foreignChair = `INSERT INTO departments(id) VALUES ('control-foreign');
INSERT INTO users(id,department_id) VALUES ('foreign-chair','control-foreign');
INSERT INTO examination_committee_assignments(id,department_id,committee_id,examination_id,assigned_user_id,seat,assigned_at)
 VALUES ('foreign-chair','control-foreign','foreign-committee','foreign-exam','foreign-chair','CHAIRMAN','2026-01-01');`;
      const successorChair = `INSERT INTO users(id,department_id) VALUES ('control-successor','law');
INSERT INTO user_roles(id,user_id,department_id,role_id) VALUES ('control-successor','control-successor','law','teacher');
UPDATE examination_committee_assignments SET status='UNASSIGNED',unassigned_at=CURRENT_TIMESTAMP WHERE id='CHAIRMAN';
INSERT INTO examination_committee_assignments(id,department_id,committee_id,examination_id,assigned_user_id,seat,assigned_at)
 VALUES ('control-successor','law','committee','exam','control-successor','CHAIRMAN','2026-09-01');`;
      const permissionMutations = ["code='*',resource='*',action='*'", "code='equivalent.permission_department'",
        "resource='unrelated.resource'", "action='unrelated'", "scope='SELF'"];
      await t.test("roster lock rejects missing expected REGULAR source before any row exists", async () => {
        await rejects(lockRoster(), /Roster lock requires exact complete REGULAR sources/);
      });
      await t.test("an applicable course with zero certified REGULAR sources permits lock only with the exact overall roster", async () => {
        await isolated(async () => {
          await execute(`
INSERT INTO course_offerings VALUES ('empty-offering','law','ACTIVE',NULL);
INSERT INTO examination_courses VALUES ('empty-course','law','exam','empty-offering','empty-cc','curriculum','term','program','template',NULL);
INSERT INTO comprehensive_courses(id,department_id,comprehensive_id,examination_course_id,assessment_component_id,full_mark,template_version,academic_snapshot)
 VALUES ('empty-comprehensive-course','law','comprehensive','empty-course','component',5,1,'{}');
`);
          assert.deepEqual(await tx.$queryRaw`SELECT cc.id FROM examination_candidate_courses cc
            JOIN examination_candidate_registrations cr ON cr.id=cc.registration_id
            WHERE cr.list_id='list' AND cr.category='REGULAR' AND cc.examination_course_id='empty-course'`, []);
          await rejects(lockRoster(), /Roster lock requires exact complete REGULAR sources/);
          await rejects(rosterRow.replace("'comprehensive-course'", "'empty-comprehensive-course'") + lockRoster(), /Roster requires exact certified REGULAR/);
          await execute(rosterRow);
          await rejects(rosterRow.replace("'roster'", "'duplicate-roster'") + lockRoster(), /23505|unique constraint/);
          await execute(lockRoster());
          assert.deepEqual(await tx.$queryRaw`SELECT course_id,registration_id,candidate_course_id,registration_version
            FROM comprehensive_roster_entries WHERE comprehensive_id='comprehensive'`,
          [{ course_id: "comprehensive-course", registration_id: "candidate", candidate_course_id: "candidate-course", registration_version: 1 }]);
          assert.deepEqual(await tx.$queryRaw`SELECT roster_locked_by_user_id FROM comprehensive_examinations WHERE id='comprehensive'`, [{ roster_locked_by_user_id: "CHAIRMAN" }]);
        });
      });
      await t.test("marking cannot begin before a previous roster lock", async () => {
        await rejects(startMarking(), /previously locked CONFIGURED roster/);
      });
      await execute(rosterRow);
      for (const operation of ["allocation", "roster lock"] as const) {
        const prepare = async () => { if (operation === "allocation") await execute("UPDATE comprehensive_examinations SET mode='COURSE_DISTRIBUTED' WHERE id='comprehensive';"); };
        const command = (actor = "CHAIRMAN", assignment = "CHAIRMAN", assignedAt = "'2026-01-01'", target = "MEMBER_1") =>
          operation === "allocation" ? allocate(actor, assignment, assignedAt, target) : lockRoster(actor, assignment, assignedAt);
        for (const [name, setup, actor, assignment, assignedAt, expected] of [
          ["arbitrary actor", "", "admin", "CHAIRMAN", "'2026-01-01'", /Current control Chairman required/],
          ...["MEMBER_1", "MEMBER_2", "EXTERNAL_MEMBER"].map((seat) => [seat, "", seat, seat, "'2026-01-01'", /Current control Chairman required/] as const),
          ["revoked Chairman", "UPDATE examination_committee_assignments SET status='UNASSIGNED',unassigned_at=CURRENT_TIMESTAMP WHERE id='CHAIRMAN';", "CHAIRMAN", "CHAIRMAN", "'2026-01-01'", /Current control Chairman required/],
          ["expired Chairman", "UPDATE examination_committee_assignments SET expires_at='2020-01-01' WHERE id='CHAIRMAN';", "CHAIRMAN", "CHAIRMAN", "'2026-01-01'", /Current control Chairman required/],
          ["replaced Chairman", successorChair, "CHAIRMAN", "CHAIRMAN", "'2026-01-01'", /Current control Chairman required/],
          ["wrong department", foreignChair, "foreign-chair", "foreign-chair", "'2026-01-01'", /Current control Chairman required/],
          ["mismatched assignedAt", "", "CHAIRMAN", "CHAIRMAN", "'2026-02-01'", /Current control Chairman required/],
          ["missing assignedAt", "", "CHAIRMAN", "CHAIRMAN", "NULL", /Current control Chairman required/],
          ["missing exact permission", "DELETE FROM role_permissions WHERE role_id='teacher' AND permission_id='configure';", "CHAIRMAN", "CHAIRMAN", "'2026-01-01'", /Exact control configuration permission required/],
        ] as const) {
          await t.test(`${operation} rejects ${name}`, async () => { await isolated(async () => {
            await prepare(); await execute(setup); await rejects(command(actor, assignment, assignedAt), expected);
          }); });
        }
        for (const mutation of permissionMutations) await t.test(`${operation} rejects permission substitution ${mutation}`, async () => {
          await isolated(async () => { await prepare(); await execute(`UPDATE permissions SET ${mutation} WHERE id='configure';`);
            await rejects(command(), /Exact control configuration permission required/); });
        });
        for (const field of ["user_id", "assignment_id", "assignment_assigned_at"]) await t.test(`${operation} rejects incomplete actor tuple ${field}`, async () => {
          await isolated(async () => {
            await prepare(); const prefix = operation === "allocation" ? "allocation_changed_by_" : "roster_locked_by_";
            const incomplete = command().replace(new RegExp(`${prefix}${field}='[^']*'`), `${prefix}${field}=NULL`);
            await rejects(incomplete, /Current control Chairman required/);
          });
        });
        await t.test(`${operation} accepts exact current Chairman and records separate operation actor`, async () => {
          await isolated(async () => { await prepare(); await execute(command());
            const rows = await tx.$queryRawUnsafe<Array<{ actor: string; assignment: string }>>(operation === "allocation" ?
              "SELECT allocation_changed_by_user_id AS actor,allocation_changed_by_assignment_id AS assignment FROM comprehensive_courses WHERE id='comprehensive-course'" :
              "SELECT roster_locked_by_user_id AS actor,roster_locked_by_assignment_id AS assignment FROM comprehensive_examinations WHERE id='comprehensive'");
            assert.deepEqual(rows, [{ actor: "CHAIRMAN", assignment: "CHAIRMAN" }]);
          });
        });
        await t.test(`${operation} accepts exact successor independently of original configurator`, async () => {
          await isolated(async () => { await prepare(); if (operation === "allocation") await execute(allocate());
            await execute(successorChair); await execute(command("control-successor", "control-successor", "'2026-09-01'", "MEMBER_2"));
          });
        });
      }
      await t.test("allocation changes require actor provenance and unchanged targets reject actor-only edits", async () => {
        await isolated(async () => {
          await execute("UPDATE comprehensive_examinations SET mode='COURSE_DISTRIBUTED' WHERE id='comprehensive';");
          await rejects("UPDATE comprehensive_courses SET assigned_committee_assignment_id='MEMBER_1',allocated_assignment_assigned_at='2026-01-01' WHERE id='comprehensive-course';", /Current control Chairman required/);
          await rejects("UPDATE comprehensive_courses SET allocation_changed_by_user_id='CHAIRMAN',allocation_changed_by_assignment_id='CHAIRMAN',allocation_changed_by_assignment_assigned_at='2026-01-01' WHERE id='comprehensive-course';", /Allocation actor requires a target change/);
          await execute(allocate()); await execute(successorChair);
          await rejects("UPDATE comprehensive_courses SET allocation_changed_by_user_id='control-successor',allocation_changed_by_assignment_id='control-successor',allocation_changed_by_assignment_assigned_at='2026-09-01' WHERE id='comprehensive-course';", /Allocation actor requires a target change/);
          await execute("UPDATE comprehensive_courses SET assigned_committee_assignment_id=NULL,allocated_assignment_assigned_at=NULL,allocation_changed_by_user_id='control-successor',allocation_changed_by_assignment_id='control-successor',allocation_changed_by_assignment_assigned_at='2026-09-01' WHERE id='comprehensive-course';");
          assert.deepEqual(await tx.$queryRaw`SELECT assigned_committee_assignment_id,allocation_changed_by_user_id FROM comprehensive_courses WHERE id='comprehensive-course'`,
            [{ assigned_committee_assignment_id: null, allocation_changed_by_user_id: "control-successor" }]);
        });
      });
      await t.test("allocation to Chairman himself is valid but stale targets and non-distributed mode reject", async () => {
        await rejects(allocate(), /Course allocation must target current exact appointment/);
        await isolated(async () => { await execute("UPDATE comprehensive_examinations SET mode='COURSE_DISTRIBUTED' WHERE id='comprehensive';");
          await execute(allocate("CHAIRMAN", "CHAIRMAN", "'2026-01-01'", "CHAIRMAN"));
          await execute("UPDATE examination_committee_assignments SET expires_at='2020-01-01' WHERE id='MEMBER_1';");
          await rejects(allocate(), /Course allocation must target current exact appointment/);
        });
      });
      for (const [name, mutation, expected] of [
        ["wrong version", "registration_version=2", /Roster requires exact certified REGULAR/],
        ["wrong candidate-course", "candidate_course_id='candidate-course-irregular'", /Roster requires exact certified REGULAR/],
        ["non-REGULAR", "registration_id='candidate-irregular',candidate_course_id='candidate-course-irregular'", /Roster requires exact certified REGULAR/],
        ["foreign department", "department_id='foreign'", /Comprehensive scope mismatch/],
        ["foreign examination course", "course_id='foreign'", /Roster requires exact certified REGULAR/],
      ] as const) await t.test(`roster rejects ${name} sources before they can enter a lock package`, async () => {
        // Named INSERT projection avoids an UPDATE that is already forbidden for every roster row.
        const fields = { department_id: "'law'", course_id: "'comprehensive-course'", registration_id: "'candidate'", candidate_course_id: "'candidate-course'", registration_version: "1" };
        for (const part of mutation.split(",")) { const [key, value] = part.split("="); (fields as Record<string, string>)[key!] = value!; }
        await rejects(`INSERT INTO comprehensive_roster_entries(id,department_id,comprehensive_id,course_id,registration_id,candidate_course_id,registration_version)
          VALUES ('invalid-roster',${fields.department_id},'comprehensive',${fields.course_id},${fields.registration_id},${fields.candidate_course_id},${fields.registration_version});` + lockRoster(), expected);
      });
      await t.test("duplicate logical roster source cannot be added to the lock package", async () => {
        await rejects(rosterRow.replace("'roster'", "'duplicate-roster'") + lockRoster(), /23505|unique constraint/);
      });
      await t.test("extra uncertified candidate source cannot enter the authoritative roster", async () => {
        await isolated(async () => {
          await execute(`
INSERT INTO examinations VALUES ('uncertified-exam','law','program','session','term','LLB_2025',NULL);
INSERT INTO examination_courses VALUES ('uncertified-course','law','uncertified-exam','offering','cc','curriculum','term','program','template',NULL);
INSERT INTO examination_candidate_lists(id,department_id,examination_id,academic_program_id,academic_session_id,academic_term_id,source_reference,rule_version_code,recorded_by_user_id,recorded_poe_assignment_id)
 VALUES ('uncertified-list','law','uncertified-exam','program','session','term','Draft source','LLB_2025','poe','poe-appointment');
INSERT INTO examination_candidate_registrations(id,department_id,list_id,examination_id,student_user_id,curriculum_assignment_id,category,recorded_by_user_id,recorded_poe_assignment_id)
 VALUES ('uncertified-candidate','law','uncertified-list','uncertified-exam','student','sca','REGULAR','poe','poe-appointment');
INSERT INTO examination_candidate_courses(id,department_id,registration_id,examination_course_id,enrollment_id) VALUES ('uncertified-source','law','uncertified-candidate','uncertified-course','enrollment');
`);
          await rejects("INSERT INTO comprehensive_roster_entries(id,department_id,comprehensive_id,course_id,registration_id,candidate_course_id,registration_version) VALUES ('extra-row','law','comprehensive','comprehensive-course','uncertified-candidate','uncertified-source',1);" + lockRoster(), /Roster requires exact certified REGULAR/);
        });
      });
      await t.test("roster lock rejects actor-only changes and all second lock changes", async () => {
        await rejects("UPDATE comprehensive_examinations SET roster_locked_at=CURRENT_TIMESTAMP WHERE id='comprehensive';", /Current control Chairman required/);
        await rejects("UPDATE comprehensive_examinations SET roster_locked_by_user_id='CHAIRMAN',roster_locked_by_assignment_id='CHAIRMAN',roster_locked_by_assignment_assigned_at='2026-01-01' WHERE id='comprehensive';", /Roster lock provenance is immutable/);
        await isolated(async () => {
          await execute(lockRoster());
          for (const change of ["roster_locked_at=roster_locked_at+INTERVAL '1 second'", "roster_locked_by_user_id='MEMBER_1'", "roster_locked_by_assignment_id='MEMBER_1'", "roster_locked_by_assignment_assigned_at='2026-02-01'"])
            await rejects(`UPDATE comprehensive_examinations SET ${change} WHERE id='comprehensive';`, /Roster lock.*immutable/);
          await rejects(rosterRow.replace("'roster'", "'after-lock'"), /Regular roster is immutable/);
          await rejects("UPDATE comprehensive_roster_entries SET registration_version=registration_version WHERE id='roster';", /Regular roster is immutable/);
          await rejects("DELETE FROM comprehensive_roster_entries WHERE id='roster';", /Comprehensive academic sources are historical evidence/);
        });
      });
      await execute(lockRoster());
      const firstMark = (seat = "MEMBER_1", external = seat === "EXTERNAL_MEMBER" ? "'access'" : "NULL", assignment = seat) =>
        `INSERT INTO comprehensive_marks(id,department_id,comprehensive_id,roster_entry_id,committee_assignment_id,assignment_assigned_at,external_access_id,seat,actor_user_id,revision,mark,full_mark)
          VALUES ('first-mark','law','comprehensive','roster','${assignment}','2026-01-01',${external},'${seat}','${seat}',1,1,5);`;
      // Force the same queued validation COMMIT would run, then restore deferred ordering.
      // Each probe's SAVEPOINT also restores constraint mode and pending trigger events.
      const validateStart = "SET CONSTRAINTS ce_marking_start_validate IMMEDIATE; SET CONSTRAINTS ce_marking_start_validate DEFERRED;";
      const missingFirstEvidence = /Marking start requires matching first mark or absence evidence in the same transaction/;
      for (const actor of ["MEMBER_1", "CHAIRMAN", "EXTERNAL_MEMBER"]) await t.test(`${actor} can start marking with exact member/binding and mark permission`, async () => {
        await isolated(async () => {
          if (actor === "CHAIRMAN") await removeGrant("teacher", "review");
          await execute(startMarking(actor, actor, "'2026-01-01'", actor === "EXTERNAL_MEMBER" ? "'access'" : "NULL"));
          await execute(firstMark(actor) + validateStart);
          assert.deepEqual(await tx.$queryRaw`SELECT marking_started_by_user_id,marking_started_by_assignment_id,marking_started_external_access_id FROM comprehensive_examinations WHERE id='comprehensive'`,
            [{ marking_started_by_user_id: actor, marking_started_by_assignment_id: actor, marking_started_external_access_id: actor === "EXTERNAL_MEMBER" ? "access" : null }]);
        });
      });
      await t.test("standalone start executes provisionally but cannot pass transaction-end validation", async () => {
        await isolated(async () => {
          await execute(startMarking());
          assert.deepEqual(await tx.$queryRaw`SELECT status FROM comprehensive_examinations WHERE id='comprehensive'`, [{ status: "MARKING" }]);
          await rejects(validateStart, missingFirstEvidence);
        });
        assert.deepEqual(await tx.$queryRaw`SELECT status,marking_started_at FROM comprehensive_examinations WHERE id='comprehensive'`, [{ status: "CONFIGURED", marking_started_at: null }]);
        // A rolled-back standalone start cannot be rescued by evidence in a later transaction.
        await rejects(firstMark(), /Marking is not open/);
      });
      for (const starter of ["MEMBER_1", "CHAIRMAN"]) await t.test(`${starter} start cannot be backed by MEMBER_2's mark`, async () => {
        await rejects(startMarking(starter, starter) + firstMark("MEMBER_2") + validateStart, missingFirstEvidence);
      });
      for (const binding of ["NULL", "'wrong-access'"]) await t.test(`External first evidence rejects binding ${binding} and leaves no committable start`, async () => {
        await isolated(async () => {
          await execute(startMarking("EXTERNAL_MEMBER", "EXTERNAL_MEMBER", "'2026-01-01'", "'access'"));
          await rejects(firstMark("EXTERNAL_MEMBER", binding), /Mark source\/author identity mismatch/);
          await rejects(validateStart, missingFirstEvidence);
        });
      });
      await t.test("External start cannot use a different otherwise valid binding as proof", async () => {
        await isolated(async () => {
          await execute(startMarking("EXTERNAL_MEMBER", "EXTERNAL_MEMBER", "'2026-01-01'", "'access'"));
          await execute(`UPDATE external_comprehensive_access SET revoked_at=CURRENT_TIMESTAMP,revoked_by_user_id='admin' WHERE id='access';
UPDATE examination_committee_assignments SET status='UNASSIGNED',unassigned_at=CURRENT_TIMESTAMP WHERE id='EXTERNAL_MEMBER';
INSERT INTO examination_committee_assignments(id,department_id,committee_id,examination_id,seat,assigned_at)
 VALUES ('replacement-external','law','committee','exam','EXTERNAL_MEMBER','2026-01-01');
INSERT INTO external_comprehensive_access(id,department_id,assignment_id,assignment_assigned_at,user_id,expires_at,recorded_by_user_id,source_reference)
 VALUES ('replacement-access','law','replacement-external','2026-01-01','EXTERNAL_MEMBER','2099-01-01','admin','Replacement binding');`);
          await execute(firstMark("EXTERNAL_MEMBER", "'replacement-access'", "replacement-external"));
          await rejects(validateStart, missingFirstEvidence);
        });
      });
      await t.test("failed first insert cannot leave a committable parent transition even when caught at a SAVEPOINT", async () => {
        await isolated(async () => {
          await execute(startMarking());
          await rejects(firstMark().replace(",1,1,5);", ",1,1,10);"), /Mark source\/author identity mismatch/);
          await rejects(validateStart, missingFirstEvidence);
          assert.deepEqual(await tx.$queryRaw`SELECT id FROM comprehensive_marks WHERE comprehensive_id='comprehensive'`, []);
        });
        assert.deepEqual(await tx.$queryRaw`SELECT status,marking_started_by_user_id FROM comprehensive_examinations WHERE id='comprehensive'`, [{ status: "CONFIGURED", marking_started_by_user_id: null }]);
      });
      for (const [name, setup, actor, assignment, assignedAt, external] of [
        ["Admin", "", "admin", "CHAIRMAN", "'2026-01-01'", "NULL"],
        ["Student", "", "student", "MEMBER_1", "'2026-01-01'", "NULL"],
        ["ordinary Teacher", "INSERT INTO users(id,department_id) VALUES ('ordinary-teacher','law'); INSERT INTO user_roles(id,user_id,department_id,role_id) VALUES ('ordinary-teacher','ordinary-teacher','law','teacher');", "ordinary-teacher", "MEMBER_1", "'2026-01-01'", "NULL"],
        ["revoked member", "UPDATE examination_committee_assignments SET status='UNASSIGNED',unassigned_at=CURRENT_TIMESTAMP WHERE id='MEMBER_1';", "MEMBER_1", "MEMBER_1", "'2026-01-01'", "NULL"],
        ["expired member", "UPDATE examination_committee_assignments SET expires_at='2020-01-01' WHERE id='MEMBER_1';", "MEMBER_1", "MEMBER_1", "'2026-01-01'", "NULL"],
        ["future member", "UPDATE examination_committee_assignments SET assigned_at='2098-01-01' WHERE id='MEMBER_1';", "MEMBER_1", "MEMBER_1", "'2098-01-01'", "NULL"],
        ["stale assignedAt", "UPDATE examination_committee_assignments SET assigned_at='2026-09-01' WHERE id='MEMBER_1';", "MEMBER_1", "MEMBER_1", "'2026-01-01'", "NULL"],
        ["mismatched assignedAt", "", "MEMBER_1", "MEMBER_1", "'2026-02-01'", "NULL"],
        ["wrong department", foreignChair, "foreign-chair", "foreign-chair", "'2026-01-01'", "NULL"],
        ["missing mark permission", "DELETE FROM role_permissions WHERE role_id='teacher' AND permission_id='mark';", "MEMBER_1", "MEMBER_1", "'2026-01-01'", "NULL"],
        ["External without binding", "", "EXTERNAL_MEMBER", "EXTERNAL_MEMBER", "'2026-01-01'", "NULL"],
        ["External missing mark permission", "DELETE FROM role_permissions WHERE role_id='external' AND permission_id='mark';", "EXTERNAL_MEMBER", "EXTERNAL_MEMBER", "'2026-01-01'", "'access'"],
        ["External wrong binding", "", "EXTERNAL_MEMBER", "EXTERNAL_MEMBER", "'2026-01-01'", "'wrong-access'"],
        ["External revoked binding", "UPDATE external_comprehensive_access SET revoked_at=CURRENT_TIMESTAMP,revoked_by_user_id='admin' WHERE id='access';", "EXTERNAL_MEMBER", "EXTERNAL_MEMBER", "'2026-01-01'", "'access'"],
        ["internal with External binding", "", "MEMBER_1", "MEMBER_1", "'2026-01-01'", "'access'"],
      ] as const) await t.test(`marking start rejects ${name}`, async () => {
        await isolated(async () => { await execute(setup); await rejects(startMarking(actor, assignment, assignedAt, external), /Exact marking-start operation authority required/); });
      });
      for (const mutation of permissionMutations) await t.test(`marking start rejects mark permission substitution ${mutation}`, async () => {
        await isolated(async () => { await execute(`UPDATE permissions SET ${mutation} WHERE id='mark';`);
          await rejects(startMarking(), /Exact marking-start operation authority required/); });
      });
      await t.test("marking start rejects incomplete provenance and status-only changes", async () => {
        await rejects("UPDATE comprehensive_examinations SET status='MARKING' WHERE id='comprehensive';", /Invalid marking status transition/);
        await rejects("UPDATE comprehensive_examinations SET status='MARKING',marking_started_at=CURRENT_TIMESTAMP WHERE id='comprehensive';", /Exact marking-start operation authority required/);
        for (const field of ["user_id", "assignment_id", "assignment_assigned_at"]) await rejects(
          startMarking().replace(new RegExp(`marking_started_by_${field}='[^']*'`), `marking_started_by_${field}=NULL`), /Exact marking-start operation authority required/);
      });
      const firstAbsence = (actor = "CHAIRMAN", assignment = "CHAIRMAN") =>
        `INSERT INTO comprehensive_absences(id,department_id,comprehensive_id,registration_id,chairman_assignment_id,assignment_assigned_at,actor_user_id,reason) VALUES ('first-absence','law','comprehensive','candidate','${assignment}','2026-01-01','${actor}','Absent');`;
      for (const mutation of permissionMutations) await t.test(`absence start rejects review permission substitution ${mutation}`, async () => {
        await isolated(async () => { await removeGrant("teacher", "mark"); await execute(`UPDATE permissions SET ${mutation} WHERE id='review';`);
          await rejects(startMarking("CHAIRMAN", "CHAIRMAN") + firstAbsence(), /Exact marking-start operation authority required/); });
      });
      await t.test("mark-enter start respects Chairman-only and distributed target authority", async () => {
        await isolated(async () => {
          await removeGrant("teacher", "review");
          await execute("UPDATE comprehensive_examinations SET mode='CHAIRMAN_ONLY' WHERE id='comprehensive';");
          await rejects(startMarking(), /Exact marking-start operation authority required/);
          await execute(startMarking("CHAIRMAN", "CHAIRMAN") + firstMark("CHAIRMAN") + validateStart);
        });
        await isolated(async () => {
          await removeGrant("teacher", "review");
          await execute("UPDATE comprehensive_examinations SET mode='COURSE_DISTRIBUTED' WHERE id='comprehensive';");
          await rejects(startMarking(), /Exact marking-start operation authority required/);
          await execute(allocate()); await execute(startMarking() + firstMark() + validateStart);
        });
      });
      await t.test("Chairman review alone can start with absence, but non-Chairman or missing review cannot", async () => {
        await isolated(async () => { await removeGrant("teacher", "mark"); await execute(startMarking("CHAIRMAN", "CHAIRMAN") + firstAbsence() + validateStart); });
        await rejects(startMarking() + firstAbsence("MEMBER_1", "MEMBER_1"), /Current reviewing Chairman and open marking required/);
        await isolated(async () => { await removeGrant("teacher", "review");
          await rejects(startMarking("CHAIRMAN", "CHAIRMAN") + firstAbsence(), /Exact review permission required/);
          await removeGrant("teacher", "mark"); await rejects(startMarking("CHAIRMAN", "CHAIRMAN"), /Exact marking-start operation authority required/);
        });
      });
      await t.test("Chairman review start requires matching absence when mark-enter authority is absent", async () => {
        await isolated(async () => {
          await removeGrant("teacher", "mark");
          await rejects(startMarking("CHAIRMAN", "CHAIRMAN") + validateStart, missingFirstEvidence);
          await rejects(startMarking("CHAIRMAN", "CHAIRMAN") + firstMark("EXTERNAL_MEMBER") + validateStart, missingFirstEvidence);
          await rejects(startMarking("CHAIRMAN", "CHAIRMAN") + firstMark("CHAIRMAN"), /Exact mark-enter permission required/);
        });
      });
      await t.test("expired External binding cannot establish marking-start provenance", async () => {
        await isolated(async () => {
          await execute(`UPDATE external_comprehensive_access SET revoked_at=CURRENT_TIMESTAMP,revoked_by_user_id='admin' WHERE id='access';
UPDATE examination_committee_assignments SET status='UNASSIGNED' WHERE id='EXTERNAL_MEMBER';
INSERT INTO examination_committee_assignments(id,department_id,committee_id,examination_id,seat,assigned_at) VALUES ('expired-external','law','committee','exam','EXTERNAL_MEMBER','2019-01-01');
INSERT INTO external_comprehensive_access(id,department_id,assignment_id,assignment_assigned_at,user_id,expires_at,recorded_by_user_id,source_reference,created_at)
 VALUES ('expired-access','law','expired-external','2019-01-01','EXTERNAL_MEMBER','2020-01-01','admin','Historical binding','2019-01-01');`);
          await rejects(startMarking("EXTERNAL_MEMBER", "expired-external", "'2019-01-01'", "'expired-access'"), /Exact marking-start operation authority required/);
        });
      });
      await t.test("first marking provenance rejects actor-only edits before and after start and status rollback", async () => {
        await rejects("UPDATE comprehensive_examinations SET marking_started_by_user_id='MEMBER_1' WHERE id='comprehensive';", /Marking-start provenance is immutable/);
        await isolated(async () => { await execute(startMarking() + firstMark() + validateStart);
          for (const change of ["marking_started_by_user_id='CHAIRMAN'", "marking_started_by_assignment_id='CHAIRMAN'", "marking_started_by_assignment_assigned_at='2026-02-01'", "marking_started_external_access_id='access'", "marking_started_at=marking_started_at+INTERVAL '1 second'", "status='CONFIGURED'"])
            await rejects(`UPDATE comprehensive_examinations SET ${change} WHERE id='comprehensive';`, /immutable|frozen|Invalid marking status transition/);
        });
      });
      await execute(startMarking());
      await t.test("mode freeze, roster freeze and full mark source protection", async () => {
        await rejects(allocate(), /Course allocation\/configuration is frozen/);
        await rejects("UPDATE comprehensive_examinations SET mode='CHAIRMAN_ONLY' WHERE id='comprehensive';");
        await rejects("UPDATE comprehensive_courses SET full_mark=10 WHERE id='comprehensive-course';");
        await rejects("DELETE FROM comprehensive_roster_entries WHERE id='roster';");
      });
      const absence = "INSERT INTO comprehensive_absences(id,department_id,comprehensive_id,registration_id,chairman_assignment_id,assignment_assigned_at,actor_user_id,reason) VALUES ('absence','law','comprehensive','candidate','CHAIRMAN','2026-01-01','CHAIRMAN','Candidate absent');";
      await t.test("current Chairman needs exact review permission for absence; restoration permits evidence", async () => {
        await permissionRequired("teacher", "review", absence, /Exact review permission required/);
      });
      const draft = (seat: string) => `INSERT INTO comprehensive_marks(id,department_id,comprehensive_id,roster_entry_id,committee_assignment_id,assignment_assigned_at,external_access_id,seat,actor_user_id,revision,mark,full_mark)
        VALUES ('draft','law','comprehensive','roster','${seat}','2026-01-01',${seat === "EXTERNAL_MEMBER" ? "'access'" : "NULL"},'${seat}','${seat}',1,1,5);`;
      for (const [role, seat] of [["teacher", "MEMBER_1"], ["external", "EXTERNAL_MEMBER"]] as const) {
        await t.test(`current ${seat} appointment/binding needs exact mark permission for INSERT and UPDATE`, async () => {
          await permissionRequired(role, "mark", draft(seat), /Exact mark-enter permission required/);
          await isolated(async () => {
            await execute(draft(seat));
            await removeGrant(role, "mark");
            await rejects("UPDATE comprehensive_marks SET mark=2 WHERE id='draft';", /Exact mark-enter permission required/);
            await rejects("UPDATE comprehensive_marks SET status='SUBMITTED',submitted_at=CURRENT_TIMESTAMP WHERE id='draft';", /Exact mark-enter permission required/);
            await restoreGrant(role, "mark");
            await execute("UPDATE comprehensive_marks SET mark=2,status='SUBMITTED',submitted_at=CURRENT_TIMESTAMP WHERE id='draft';");
          });
        });
      }
      await t.test("wildcard, unrelated, equivalent-code, resource, action and scope substitutions cannot grant mark authority", async () => {
        for (const mutation of [
          "code='*',resource='*',action='*'",
          "code='unrelated.read_department',resource='unrelated',action='read'",
          "code='equivalent.mark.enter_department'",
          "resource='comprehensive-examination.workspace'", "action='manage'", "scope='SELF'",
        ]) await isolated(async () => {
          await execute(`UPDATE permissions SET ${mutation} WHERE id='mark';`);
          await rejects(draft("MEMBER_1"), /Exact mark-enter permission required/);
          await rejects(draft("EXTERNAL_MEMBER"), /Exact mark-enter permission required/);
        });
      });
      await t.test("permission may come from a separate live department role; invalid grant chains fail", async () => {
        await isolated(async () => {
          await removeGrant("teacher", "mark");
          await execute(`
INSERT INTO roles(id,department_id,code) VALUES ('mark-grant','law','custom_mark_grant');
INSERT INTO user_roles(id,user_id,department_id,role_id) VALUES ('mark-grant','MEMBER_1','law','mark-grant');
INSERT INTO role_permissions(id,role_id,permission_id) VALUES ('mark-grant','mark-grant','mark');
`);
          // The Teacher appointment role remains live, but carries no mark permission.
          for (const mutation of [
            "UPDATE user_roles SET revoked_at=CURRENT_TIMESTAMP WHERE id='mark-grant';",
            "UPDATE user_roles SET expires_at='2020-01-01' WHERE id='mark-grant';",
            "UPDATE user_roles SET department_id='other' WHERE id='mark-grant';",
            "UPDATE user_roles SET user_id='MEMBER_2' WHERE id='mark-grant';",
            "UPDATE roles SET archived_at=CURRENT_TIMESTAMP WHERE id='mark-grant';",
            "UPDATE roles SET department_id='other' WHERE id='mark-grant';",
            "UPDATE users SET status='INACTIVE' WHERE id='MEMBER_1';",
            "UPDATE users SET archived_at=CURRENT_TIMESTAMP WHERE id='MEMBER_1';",
            "UPDATE users SET deleted_at=CURRENT_TIMESTAMP WHERE id='MEMBER_1';",
            "UPDATE departments SET status='INACTIVE' WHERE id='law';",
            "UPDATE departments SET archived_at=CURRENT_TIMESTAMP WHERE id='law';",
            "UPDATE departments SET deleted_at=CURRENT_TIMESTAMP WHERE id='law';",
          ]) await rejects(mutation + draft("MEMBER_1"), /Exact mark-enter permission required/);
          await execute(draft("MEMBER_1"));
        });
      });
      for (const [index, seat] of [[1, "MEMBER_1"], [0, "CHAIRMAN"], [2, "MEMBER_2"], [3, "EXTERNAL_MEMBER"]] as const) {
        await execute(`INSERT INTO comprehensive_marks(id,department_id,comprehensive_id,roster_entry_id,committee_assignment_id,assignment_assigned_at,external_access_id,seat,actor_user_id,revision,mark,full_mark,status,submitted_at)
          VALUES ('mark-${seat}','law','comprehensive','roster','${seat}','2026-01-01',${seat === "EXTERNAL_MEMBER" ? "'access'" : "NULL"},'${seat}','${seat}',1,${index + 1},5,'SUBMITTED',CURRENT_TIMESTAMP);`);
        await execute(validateStart);
      }
      await t.test("submitted UPDATE/DELETE and unreturned successor are rejected", async () => {
        await rejects("UPDATE comprehensive_marks SET mark=5 WHERE id='mark-MEMBER_1';");
        await rejects("DELETE FROM comprehensive_marks WHERE id='mark-MEMBER_1';");
        await rejects("INSERT INTO comprehensive_marks(id,department_id,comprehensive_id,roster_entry_id,committee_assignment_id,assignment_assigned_at,seat,actor_user_id,revision,mark,full_mark,status,submitted_at) VALUES ('bad','law','comprehensive','roster','MEMBER_1','2026-01-01','MEMBER_1','MEMBER_1',2,5,5,'SUBMITTED',CURRENT_TIMESTAMP);");
      });
      await t.test("later marks retain the first marking-start actor and exact appointment", async () => {
        assert.deepEqual(await tx.$queryRaw`SELECT marking_started_by_user_id,marking_started_by_assignment_id,marking_started_by_assignment_assigned_at,marking_started_external_access_id FROM comprehensive_examinations WHERE id='comprehensive'`,
          [{ marking_started_by_user_id: "MEMBER_1", marking_started_by_assignment_id: "MEMBER_1", marking_started_by_assignment_assigned_at: new Date("2026-01-01T00:00:00Z"), marking_started_external_access_id: null }]);
      });
      const returned = "INSERT INTO comprehensive_mark_returns(id,department_id,comprehensive_id,mark_id,chairman_assignment_id,assignment_assigned_at,actor_user_id,reason) VALUES ('returned','law','comprehensive','mark-MEMBER_1','CHAIRMAN','2026-01-01','CHAIRMAN','Recheck evidence');";
      await t.test("return needs exact Chairman review and original member mark-enter permissions", async () => {
        await permissionRequired("teacher", "review", returned, /Exact review permission required/);
        await permissionRequired("teacher", "mark", returned, /Return requires exact current submitted evidence/);
      });
      await t.test("returned correction INSERT requires current exact mark-enter permission", async () => {
        await isolated(async () => {
          await execute(returned);
          const correction = "INSERT INTO comprehensive_marks(id,department_id,comprehensive_id,roster_entry_id,committee_assignment_id,assignment_assigned_at,seat,actor_user_id,revision,previous_id,return_id,mark,full_mark,status,submitted_at) VALUES ('correction','law','comprehensive','roster','MEMBER_1','2026-01-01','MEMBER_1','MEMBER_1',2,'mark-MEMBER_1','returned',3,5,'SUBMITTED',CURRENT_TIMESTAMP);";
          await removeGrant("teacher", "mark");
          await rejects(correction, /Exact mark-enter permission required/);
          await restoreGrant("teacher", "mark");
          await execute(correction);
        });
      });
      const finalisation = "INSERT INTO comprehensive_finalisations(id,department_id,comprehensive_id,chairman_assignment_id,assignment_assigned_at,actor_user_id,rule_version_code,mode) VALUES ('final','law','comprehensive','CHAIRMAN','2026-01-01','CHAIRMAN','LLB_2025','ALL_MEMBERS_AVERAGE');";
      await t.test("current Chairman needs exact finalise permission; restoration permits finalisation", async () => {
        await permissionRequired("teacher", "finalise", finalisation, /Exact finalise permission required/);
      });
      await t.test("incomplete final package rolls back at deferred validation", async () => {
        await rejects("INSERT INTO comprehensive_finalisations(id,department_id,comprehensive_id,chairman_assignment_id,assignment_assigned_at,actor_user_id,rule_version_code,mode) VALUES ('incomplete','law','comprehensive','CHAIRMAN','2026-01-01','CHAIRMAN','LLB_2025','ALL_MEMBERS_AVERAGE'); SET CONSTRAINTS ALL IMMEDIATE;");
      });
      const finalPackage = finalisation + `
INSERT INTO comprehensive_final_results(id,department_id,finalisation_id,roster_entry_id,mark,full_mark,calculation_rule) VALUES ('result','law','final','roster',2.5,5,'COMPREHENSIVE_EXACT_DECIMAL_V1');
INSERT INTO comprehensive_final_sources(id,department_id,result_id,mark_id) SELECT id || '-source','law','result',id FROM comprehensive_marks;
UPDATE comprehensive_examinations SET status='FINALISED',finalised_at=(SELECT created_at FROM comprehensive_finalisations WHERE id='final') WHERE id='comprehensive';
`;
      await t.test("deferred final package revalidates exact finalise and every source mark permission", async () => {
        for (const [role, permission, expected] of [
          ["teacher", "finalise", /Exact finalise permission required at final boundary/],
          ["teacher", "mark", /Final value must bind complete exact current sources/],
          ["external", "mark", /Final value must bind complete exact current sources/],
        ] as const) await isolated(async () => {
          await execute(finalPackage);
          await removeGrant(role, permission);
          await rejects("SET CONSTRAINTS ALL IMMEDIATE;", expected);
          await restoreGrant(role, permission);
          await execute("SET CONSTRAINTS ALL IMMEDIATE;");
        });
      });
      await execute(finalPackage + "SET CONSTRAINTS ALL IMMEDIATE;");
      await t.test("exact four-seat arithmetic source package is accepted", async () => {
        const result = await tx.$queryRawUnsafe<Array<{ value: string }>>("SELECT mark::text AS value FROM comprehensive_final_results WHERE id='result'");
        assert.equal(Number(result[0]!.value), 2.5);
      });
      await t.test("finalisation, result and source UPDATE/DELETE blocked", async () => {
        for (const table of ["comprehensive_finalisations", "comprehensive_final_results", "comprehensive_final_sources"]) {
          await rejects(`UPDATE ${table} SET department_id='law';`); await rejects(`DELETE FROM ${table};`);
        }
        await rejects("UPDATE comprehensive_examinations SET status='MARKING',finalised_at=NULL WHERE id='comprehensive';");
      });
      throw rollback;
    // The full sequential PostgreSQL campaign can exceed two minutes; keep its rollback transaction bounded.
    }, { timeout: 300000 }), (error) => error === rollback);
  } finally { await client.$disconnect(); }
});
