import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const prismaRoot = join(process.cwd(), "prisma");
const schema = readFileSync(join(prismaRoot, "schema.prisma"), "utf8");
const migration = readFileSync(
  join(
    prismaRoot,
    "migrations",
    "202608280001_add_summative_examination_committee_foundation",
    "migration.sql",
  ),
  "utf8",
);

function model(name: string) {
  return (
    schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ??
    ""
  );
}

function enumValues(name: string) {
  const block =
    schema.match(new RegExp(`enum ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1] ??
    "";
  return block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

const department = model("Department");
const user = model("User");
const academicProgram = model("AcademicProgram");
const academicSession = model("AcademicSession");
const academicTerm = model("AcademicTerm");
const studentBatch = model("StudentBatch");
const curriculumVersion = model("CurriculumVersion");
const curriculumCourse = model("CurriculumCourse");
const syllabusVersion = model("SyllabusVersion");
const assessmentTemplate = model("CourseAssessmentTemplate");
const assessmentComponent = model("AssessmentTemplateComponent");
const courseOffering = model("CourseOffering");
const examination = model("Examination");
const examinationCourse = model("ExaminationCourse");
const committee = model("ExaminationCommittee");
const committeeAssignment = model("ExaminationCommitteeAssignment");
const resultRecord = model("ResultRecord");
const resultComponent = model("ResultComponent");
const gradingRecord = model("GradingRecord");

test("dedicated committee enums are exact and do not encode examination category", () => {
  assert.deepEqual(enumValues("ExaminationCommitteeSeat"), [
    "CHAIRMAN",
    "MEMBER_1",
    "MEMBER_2",
    "EXTERNAL_MEMBER",
  ]);
  assert.deepEqual(enumValues("ExaminationCommitteeAssignmentStatus"), [
    "ACTIVE",
    "INACTIVE",
    "ARCHIVED",
  ]);
  assert.doesNotMatch(schema, /enum ExaminationCategory/);
});

test("all four foundation models exist and are department scoped", () => {
  for (const [name, block, relation] of [
    ["Examination", examination, "examination_department_fkey"],
    ["ExaminationCourse", examinationCourse, "examination_course_department_fkey"],
    ["ExaminationCommittee", committee, "examination_committee_department_fkey"],
    [
      "ExaminationCommitteeAssignment",
      committeeAssignment,
      "exam_committee_assignment_department_fkey",
    ],
  ] as const) {
    assert.notEqual(block, "", `${name} must exist`);
    assert.match(block, /departmentId\s+String\s+@map\("department_id"\)/);
    assert.match(
      block,
      new RegExp(
        `department\\s+Department\\s+@relation\\(fields: \\[departmentId\\], references: \\[id\\], onDelete: Restrict, onUpdate: Restrict, map: "${relation}"\\)`,
      ),
    );
  }
});

test("Examination preserves exact academic scope and configurable codes", () => {
  for (const field of [
    /id\s+String\s+@id @default\(cuid\(\)\)/,
    /academicProgramId\s+String\s+@map\("academic_program_id"\)/,
    /academicSessionId\s+String\s+@map\("academic_session_id"\)/,
    /academicTermId\s+String\s+@map\("academic_term_id"\)/,
    /code\s+String\s+@db\.VarChar\(64\)/,
    /name\s+String\s+@db\.VarChar\(255\)/,
    /categoryCode\s+String\s+@map\("category_code"\) @db\.VarChar\(64\)/,
    /ruleVersionCode\s+String\s+@map\("rule_version_code"\) @db\.VarChar\(64\)/,
    /archivedAt\s+DateTime\?\s+@map\("archived_at"\)/,
    /createdAt\s+DateTime\s+@default\(now\(\)\) @map\("created_at"\)/,
    /updatedAt\s+DateTime\s+@updatedAt @map\("updated_at"\)/,
  ]) {
    assert.match(examination, field);
  }

  for (const relation of [
    /academicProgram\s+AcademicProgram\s+@relation\(fields: \[academicProgramId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict, map: "examination_program_identity_fkey"\)/,
    /academicSession\s+AcademicSession\s+@relation\(fields: \[academicSessionId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict, map: "examination_session_identity_fkey"\)/,
    /academicTerm\s+AcademicTerm\s+@relation\(fields: \[academicTermId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict, map: "examination_term_identity_fkey"\)/,
  ]) {
    assert.match(examination, relation);
  }

  assert.match(
    examination,
    /@@unique\(\[id, departmentId, academicProgramId, academicSessionId, academicTermId\], map: "examination_scope_identity_uq"\)/,
  );
  assert.match(
    examination,
    /@@unique\(\[departmentId, code\], map: "examination_department_code_uq"\)/,
  );
});

test("ExaminationCourse locks offering, curriculum, syllabus, and template identity together", () => {
  for (const field of [
    /examinationId\s+String\s+@map\("examination_id"\)/,
    /courseOfferingId\s+String\s+@map\("course_offering_id"\)/,
    /studentBatchId\s+String\?\s+@map\("student_batch_id"\)/,
    /curriculumVersionId\s+String\s+@map\("curriculum_version_id"\)/,
    /curriculumCourseId\s+String\s+@map\("curriculum_course_id"\)/,
    /syllabusVersionId\s+String\s+@map\("syllabus_version_id"\)/,
    /assessmentTemplateId\s+String\s+@map\("assessment_template_id"\)/,
    /summativeAssessmentComponentId\s+String\s+@map\("summative_assessment_component_id"\)/,
    /summativeComponentCode\s+String\s+@default\("SUMMATIVE_EXAMINATION"\) @map\("summative_component_code"\) @db\.VarChar\(64\)/,
    /summativeFullMark\s+Decimal\s+@map\("summative_full_mark"\) @db\.Decimal\(6, 2\)/,
    /markingDeadline\s+DateTime\?\s+@map\("marking_deadline"\)/,
    /ruleVersionCode\s+String\s+@map\("rule_version_code"\) @db\.VarChar\(64\)/,
  ]) {
    assert.match(examinationCourse, field);
  }

  for (const relation of [
    /examination\s+Examination\s+@relation\(fields: \[examinationId, departmentId, academicProgramId, academicSessionId, academicTermId\], references: \[id, departmentId, academicProgramId, academicSessionId, academicTermId\], onDelete: Restrict, onUpdate: Restrict, map: "examination_course_examination_scope_fkey"\)/,
    /courseOffering\s+CourseOffering\s+@relation\("ExaminationCourseOffering", fields: \[courseOfferingId, departmentId, academicTermId, curriculumCourseId, syllabusVersionId\], references: \[id, departmentId, academicTermId, curriculumCourseId, syllabusVersionId\], onDelete: Restrict, onUpdate: Restrict, map: "examination_course_offering_identity_fkey"\)/,
    /batchBoundCourseOffering\s+CourseOffering\?\s+@relation\("ExaminationCourseBatchOffering", fields: \[courseOfferingId, departmentId, academicTermId, curriculumCourseId, syllabusVersionId, studentBatchId\], references: \[id, departmentId, academicTermId, curriculumCourseId, syllabusVersionId, studentBatchId\], onDelete: Restrict, onUpdate: Restrict, map: "examination_course_offering_batch_scope_fkey"\)/,
    /studentBatch\s+StudentBatch\?\s+@relation\(fields: \[studentBatchId, departmentId, academicProgramId, academicSessionId\], references: \[id, departmentId, academicProgramId, academicSessionId\], onDelete: Restrict, onUpdate: Restrict, map: "examination_course_student_batch_scope_fkey"\)/,
    /curriculumVersion\s+CurriculumVersion\s+@relation\(fields: \[curriculumVersionId, departmentId, academicProgramId\], references: \[id, departmentId, academicProgramId\], onDelete: Restrict, onUpdate: Restrict, map: "examination_course_curriculum_version_fkey"\)/,
    /curriculumCourse\s+CurriculumCourse\s+@relation\(fields: \[curriculumCourseId, departmentId, curriculumVersionId, assessmentTemplateId\], references: \[id, departmentId, curriculumVersionId, assessmentTemplateId\], onDelete: Restrict, onUpdate: Restrict, map: "examination_course_curriculum_course_fkey"\)/,
    /syllabusVersion\s+SyllabusVersion\s+@relation\(fields: \[syllabusVersionId, departmentId, curriculumCourseId\], references: \[id, departmentId, curriculumCourseId\], onDelete: Restrict, onUpdate: Restrict, map: "examination_course_syllabus_identity_fkey"\)/,
    /assessmentTemplate\s+CourseAssessmentTemplate\s+@relation\(fields: \[assessmentTemplateId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict, map: "examination_course_assessment_template_fkey"\)/,
    /summativeAssessmentComponent\s+AssessmentTemplateComponent\s+@relation\(fields: \[summativeAssessmentComponentId, departmentId, assessmentTemplateId, summativeComponentCode, summativeFullMark\], references: \[id, departmentId, assessmentTemplateId, code, maximumMarks\], onDelete: Restrict, onUpdate: Restrict, map: "examination_course_summative_component_fkey"\)/,
  ]) {
    assert.match(examinationCourse, relation);
  }

  assert.match(
    examinationCourse,
    /@@unique\(\[id, departmentId, examinationId\], map: "examination_course_scope_identity_uq"\)/,
  );
  assert.match(
    examinationCourse,
    /@@unique\(\[departmentId, examinationId, courseOfferingId\], map: "examination_course_offering_uq"\)/,
  );
  assert.doesNotMatch(examinationCourse, /courseCode|courseTitle/);
  assert.match(
    examinationCourse,
    /@@index\(\[departmentId, summativeAssessmentComponentId\], map: "examination_course_summative_component_idx"\)/,
  );
});

test("required parent candidate identities support the anti-mixing foreign keys", () => {
  assert.match(
    curriculumVersion,
    /@@unique\(\[id, departmentId, academicProgramId\], map: "curriculum_version_id_dept_program_uq"\)/,
  );
  assert.match(
    curriculumCourse,
    /@@unique\(\[id, departmentId, curriculumVersionId, assessmentTemplateId\], map: "curriculum_course_exam_identity_uq"\)/,
  );
  assert.match(
    courseOffering,
    /@@unique\(\[id, departmentId, academicTermId, curriculumCourseId, syllabusVersionId\], map: "course_offering_exam_identity_uq"\)/,
  );
  assert.match(
    courseOffering,
    /@@unique\(\[id, departmentId, academicTermId, curriculumCourseId, syllabusVersionId, studentBatchId\], map: "course_offering_exam_batch_identity_uq"\)/,
  );
  assert.match(
    studentBatch,
    /@@unique\(\[id, departmentId, academicProgramId, academicSessionId\], map: "student_batch_exam_scope_identity_uq"\)/,
  );
  assert.match(
    syllabusVersion,
    /@@unique\(\[id, departmentId, curriculumCourseId\], map: "syllabus_version_id_department_curriculum_course_uq"\)/,
  );
  assert.match(
    assessmentTemplate,
    /@@unique\(\[id, departmentId\], map: "assessment_template_id_department_uq"\)/,
  );
  assert.match(
    assessmentComponent,
    /@@unique\(\[id, departmentId, assessmentTemplateId, code, maximumMarks\], map: "assessment_component_summative_identity_uq"\)/,
  );
});

test("batch-bound offerings prove exact Examination scope while unbound cases retain locked creation and later-binding invariants", () => {
  assert.match(
    migration,
    /CONSTRAINT "examination_course_offering_batch_scope_fkey"[\s\S]*?FOREIGN KEY \(\s*"course_offering_id",\s*"department_id",\s*"academic_term_id",\s*"curriculum_course_id",\s*"syllabus_version_id",\s*"student_batch_id"\s*\)[\s\S]*?REFERENCES "course_offerings"\(\s*"id",\s*"department_id",\s*"academic_term_id",\s*"curriculum_course_id",\s*"syllabus_version_id",\s*"student_batch_id"\s*\)/,
  );
  assert.match(
    migration,
    /CONSTRAINT "examination_course_student_batch_scope_fkey"[\s\S]*?FOREIGN KEY \(\s*"student_batch_id",\s*"department_id",\s*"academic_program_id",\s*"academic_session_id"\s*\)[\s\S]*?REFERENCES "student_batches"\(\s*"id",\s*"department_id",\s*"academic_program_id",\s*"academic_session_id"\s*\)/,
  );

  const exactBatchScopeMatches = (
    examinationScope: { department: string; programme: string; session: string },
    batchScope: { department: string; programme: string; session: string },
  ) =>
    examinationScope.department === batchScope.department &&
    examinationScope.programme === batchScope.programme &&
    examinationScope.session === batchScope.session;
  const examinationScope = {
    department: "department-a",
    programme: "program-a",
    session: "session-a",
  };
  assert.equal(exactBatchScopeMatches(examinationScope, examinationScope), true);
  assert.equal(
    exactBatchScopeMatches(examinationScope, {
      ...examinationScope,
      session: "session-b",
    }),
    false,
  );
  assert.equal(
    exactBatchScopeMatches(examinationScope, {
      ...examinationScope,
      programme: "program-b",
    }),
    false,
  );

  assert.match(
    examinationCourse,
    /Server-derived from CourseOffering\.studentBatchId\. Creation and any later offering batch binding must lock both records; null is allowed only while the offering is unbound, and later binding must atomically validate\/populate this field or reject\./,
  );
  assert.match(
    migration,
    /COMMENT ON COLUMN "examination_courses"\."student_batch_id" IS\s+'Server-derived from CourseOffering\.student_batch_id\. Creation and any later offering batch binding must lock both records; NULL is allowed only while the offering is unbound, and later binding must atomically validate and populate this field or reject\.';/,
  );
  assert.match(migration, /"student_batch_id" TEXT,/);
  assert.doesNotMatch(migration, /"student_batch_id" TEXT NOT NULL/);
  assert.doesNotMatch(migration, /CREATE\s+(?:OR REPLACE\s+)?TRIGGER/i);
  assert.doesNotMatch(examinationCourse, /effectiveAcademicSessionCode/);
});

test("the selected assessment-template Summative component is authoritative for the full-mark snapshot", () => {
  assert.match(
    migration,
    /CONSTRAINT "examination_course_summative_component_code_ck"\s+CHECK \("summative_component_code" = 'SUMMATIVE_EXAMINATION'\);/,
  );
  assert.match(
    migration,
    /CONSTRAINT "examination_course_summative_component_fkey"[\s\S]*?FOREIGN KEY \(\s*"summative_assessment_component_id",\s*"department_id",\s*"assessment_template_id",\s*"summative_component_code",\s*"summative_full_mark"\s*\)[\s\S]*?REFERENCES "assessment_template_components"\(\s*"id",\s*"department_id",\s*"assessment_template_id",\s*"code",\s*"maximum_marks"\s*\)/,
  );
  assert.match(
    migration,
    /COMMENT ON COLUMN "examination_courses"\."summative_full_mark" IS\s+'Immutable snapshot constrained to the selected assessment template SUMMATIVE_EXAMINATION component maximum_marks\. Later counted question configuration must total this snapshot\.';/,
  );
  assert.doesNotMatch(migration, /summative_full_mark"\s*=\s*60/i);
  assert.doesNotMatch(migration, /maximum_marks"\s*=\s*60/i);
});

test("committee and assignment identities cannot cross examination or department", () => {
  assert.match(
    committee,
    /examination\s+Examination\s+@relation\(fields: \[examinationId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict, map: "examination_committee_examination_identity_fkey"\)/,
  );
  assert.match(
    committee,
    /@@unique\(\[id, departmentId, examinationId\], map: "examination_committee_scope_identity_uq"\)/,
  );
  assert.match(
    committee,
    /@@unique\(\[departmentId, examinationId\], map: "examination_committee_examination_uq"\)/,
  );

  for (const relation of [
    /examination\s+Examination\s+@relation\(fields: \[examinationId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict, map: "exam_committee_assignment_examination_fkey"\)/,
    /committee\s+ExaminationCommittee\s+@relation\(fields: \[committeeId, departmentId, examinationId\], references: \[id, departmentId, examinationId\], onDelete: Restrict, onUpdate: Restrict, map: "exam_committee_assignment_committee_fkey"\)/,
    /assignedUser\s+User\?\s+@relation\("ExaminationCommitteeAssignee", fields: \[assignedUserId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict, map: "exam_committee_assignment_user_fkey"\)/,
    /assignedByUser\s+User\s+@relation\("ExaminationCommitteeAssignedBy", fields: \[assignedByUserId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict, map: "exam_committee_assignment_assigner_fkey"\)/,
  ]) {
    assert.match(committeeAssignment, relation);
  }
});

test("committee assignment history and lifecycle fields remain explicit", () => {
  for (const field of [
    /seat\s+ExaminationCommitteeSeat/,
    /status\s+ExaminationCommitteeAssignmentStatus\s+@default\(ACTIVE\)/,
    /assignedAt\s+DateTime\s+@default\(now\(\)\) @map\("assigned_at"\)/,
    /expiresAt\s+DateTime\?\s+@map\("expires_at"\)/,
    /unassignedAt\s+DateTime\?\s+@map\("unassigned_at"\)/,
    /archivedAt\s+DateTime\?\s+@map\("archived_at"\)/,
  ]) {
    assert.match(committeeAssignment, field);
  }
  assert.doesNotMatch(
    committeeAssignment,
    /@@unique\(\[departmentId, committeeId, examinationId, (?:seat|assignedUserId)\]/,
  );
  assert.match(
    committee,
    /One stable committee container per Examination; appointment changes are preserved in ExaminationCommitteeAssignment history\./,
  );
  assert.match(
    committeeAssignment,
    /Authority must reject wall-clock-expired rows; replacement must retire an expired ACTIVE row transactionally before inserting its successor\./,
  );
});

test("migration enforces active-only seat and user uniqueness", () => {
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "exam_committee_assignment_active_seat_uq"[\s\S]*?ON "examination_committee_assignments"\(\s*"department_id",[\s\S]*?"committee_id",[\s\S]*?"examination_id",[\s\S]*?"seat"[\s\S]*?\)\s+WHERE "status" = 'ACTIVE';/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "exam_committee_assignment_active_user_uq"[\s\S]*?ON "examination_committee_assignments"\(\s*"department_id",[\s\S]*?"committee_id",[\s\S]*?"examination_id",[\s\S]*?"assigned_user_id"[\s\S]*?\)\s+WHERE "status" = 'ACTIVE';/,
  );
});

test("migration checks positive marks and assignment temporal consistency without fixing marks at 60", () => {
  for (const check of [
    /CONSTRAINT "examination_course_positive_full_mark_ck"\s+CHECK \("summative_full_mark" > 0\);/,
    /CONSTRAINT "exam_committee_assignment_expiry_order_ck"\s+CHECK \("expires_at" IS NULL OR "expires_at" > "assigned_at"\);/,
    /CONSTRAINT "exam_committee_assignment_unassigned_order_ck"\s+CHECK \("unassigned_at" IS NULL OR "unassigned_at" >= "assigned_at"\);/,
    /CONSTRAINT "exam_committee_assignment_archived_order_ck"\s+CHECK \("archived_at" IS NULL OR "archived_at" >= "assigned_at"\);/,
    /CONSTRAINT "exam_committee_assignment_lifecycle_ck"[\s\S]*?"status" = 'ACTIVE'[\s\S]*?"status" = 'INACTIVE'[\s\S]*?"status" = 'ARCHIVED'[\s\S]*?\);/,
  ]) {
    assert.match(migration, check);
  }
  assert.doesNotMatch(migration, /summative_full_mark"\s*=\s*60/i);
});

test("all new governance foreign keys are restrictive and department qualified where supported", () => {
  const foreignKeys = Array.from(
    migration.matchAll(
      /ADD CONSTRAINT "(?:examination|exam_committee)[^"]+_fkey"[\s\S]*?;/g,
    ),
  ).map((match) => match[0]);
  assert.equal(foreignKeys.length, 21);
  for (const foreignKey of foreignKeys) {
    assert.match(foreignKey, /ON DELETE RESTRICT ON UPDATE RESTRICT;/);
    assert.doesNotMatch(foreignKey, /CASCADE/i);
  }

  assert.match(
    migration,
    /FOREIGN KEY \("assigned_user_id", "department_id"\)\s+REFERENCES "users"\("id", "department_id"\)/,
  );
  assert.match(
    migration,
    /FOREIGN KEY \("committee_id", "department_id", "examination_id"\)\s+REFERENCES "examination_committees"\("id", "department_id", "examination_id"\)/,
  );
});

test("reverse relations are present without granting broad roles", () => {
  for (const relation of [
    /examinations\s+Examination\[\]/,
    /examinationCourses\s+ExaminationCourse\[\]/,
    /examinationCommittees\s+ExaminationCommittee\[\]/,
    /examinationCommitteeAssignments\s+ExaminationCommitteeAssignment\[\]/,
  ]) {
    assert.match(department, relation);
  }
  assert.match(academicProgram, /examinations\s+Examination\[\]/);
  assert.match(academicSession, /examinations\s+Examination\[\]/);
  assert.match(academicTerm, /examinations\s+Examination\[\]/);
  assert.match(
    user,
    /examinationCommitteeAssignments\s+ExaminationCommitteeAssignment\[\]\s+@relation\("ExaminationCommitteeAssignee"\)/,
  );
  assert.doesNotMatch(migration, /\b(?:permission|policy|role|GRANT)\b/i);
});

test("forbidden later workflow storage and result-processing integration remain absent", () => {
  for (const forbiddenModel of [
    "ExaminerAssignment",
    "ExaminationQuestion",
    "QuestionPaper",
    "AnswerScript",
    "ExaminerMark",
    "SummativeMark",
    "SummativeResultHandoff",
  ]) {
    assert.doesNotMatch(schema, new RegExp(`model ${forbiddenModel} \\{`));
  }
  assert.doesNotMatch(schema, /\bquestionText\b|\bquestionPaper\b|\banswerScript\b/);
  assert.doesNotMatch(resultRecord, /Examination|Summative/);
  assert.doesNotMatch(resultComponent, /Examination|Summative/);
  assert.doesNotMatch(gradingRecord, /Examination|Summative/);
  assert.deepEqual(enumValues("ResultComponentSourceType"), [
    "ASSIGNMENT",
    "QUIZ",
    "MANUAL",
  ]);
});

test("the forward migration is additive, bounded, and uses valid PostgreSQL identifiers", () => {
  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /^COMMIT;/m);
  assert.doesNotMatch(migration, /^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/im);
  assert.doesNotMatch(migration, /\b(?:BACKFILL|SEED|GRANT|REVOKE|CASCADE|DROP)\b/i);
  assert.deepEqual(
    Array.from(migration.matchAll(/CREATE TABLE "([^"]+)"/g)).map(
      (match) => match[1],
    ),
    [
      "examinations",
      "examination_courses",
      "examination_committees",
      "examination_committee_assignments",
    ],
  );

  const identifiers = Array.from(
    migration.matchAll(/(?:INDEX|CONSTRAINT) "([^"]+)"/g),
  ).map((match) => match[1]!);
  for (const identifier of identifiers) {
    assert.ok(
      Buffer.byteLength(identifier, "utf8") <= 63,
      `${identifier} exceeds PostgreSQL's identifier limit`,
    );
  }
});
