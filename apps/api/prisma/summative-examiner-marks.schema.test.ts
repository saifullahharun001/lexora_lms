import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const prismaRoot = join(process.cwd(), "prisma");
const schema = readFileSync(join(prismaRoot, "schema.prisma"), "utf8");
const migration = readFileSync(
  join(
    prismaRoot,
    "migrations",
    "202608290004_add_summative_examiner_marks",
    "migration.sql",
  ),
  "utf8",
);
const comparisonMigration = readFileSync(
  join(
    prismaRoot,
    "migrations",
    "202609010001_add_summative_examiner_comparisons",
    "migration.sql",
  ),
  "utf8",
);

function model(name: string) {
  return schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? "";
}

const candidate = model("SummativeExaminationCandidate");
const submission = model("SummativeExaminerMarkSubmission");
const questionMark = model("SummativeExaminerQuestionMark");

test("candidate references compose exact ExaminationCourse and approved Enrollment identities", () => {
  assert.match(
    candidate,
    /examinationCourse\s+ExaminationCourse\s+@relation\(fields: \[examinationCourseId, departmentId, examinationId, courseOfferingId\], references: \[id, departmentId, examinationId, courseOfferingId\], onDelete: Restrict, onUpdate: Restrict/,
  );
  assert.match(
    candidate,
    /enrollment\s+Enrollment\s+@relation\(fields: \[enrollmentId, departmentId, courseOfferingId, studentUserId\], references: \[id, departmentId, courseOfferingId, studentUserId\], onDelete: Restrict, onUpdate: Restrict/,
  );
  assert.match(migration, /Summative examination candidate identity is immutable/);
  assert.match(
    migration,
    /CREATE TRIGGER "summative_candidate_identity_immutable_trg"[\s\S]*?BEFORE UPDATE OR DELETE/,
  );
});

test("submission identity is assignment, seat, candidate, configuration, course and version bound", () => {
  assert.match(
    submission,
    /examinerAssignment\s+ExaminationCourseExaminerAssignment\s+@relation\(fields: \[examinerAssignmentId, departmentId, examinationId, examinationCourseId, examinerSeat\]/,
  );
  assert.match(
    submission,
    /questionConfiguration\s+SummativeQuestionConfiguration\s+@relation\(fields: \[questionConfigurationId, departmentId, examinationId, examinationCourseId\]/,
  );
  assert.match(
    submission,
    /@@unique\(\[departmentId, examinerAssignmentId, candidateId, versionNumber\], map: "summative_mark_submission_version_uq"\)/,
  );
  assert.match(
    submission,
    /@@unique\(\[departmentId, examinationCourseId, candidateId, examinerSeat, versionNumber\], map: "summative_mark_submission_seat_version_uq"\)/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "summative_mark_submission_current_draft_uq"[\s\S]*?"examination_course_id"[\s\S]*?"candidate_id"[\s\S]*?"examiner_seat"[\s\S]*?WHERE "status" = 'DRAFT'/,
  );
});

test("question marks use exact Decimal(6,2), unique submission-item identity and restrictive FKs", () => {
  assert.match(questionMark, /awardedMark\s+Decimal[\s\S]*?@db\.Decimal\(6, 2\)/);
  assert.match(
    questionMark,
    /@@unique\(\[submissionId, questionItemId\], map: "summative_question_mark_submission_item_uq"\)/,
  );
  assert.match(
    questionMark,
    /questionItem\s+SummativeQuestionConfigurationItem\s+@relation\(fields: \[questionItemId, departmentId, questionConfigurationId, examinationCourseId\]/,
  );
  assert.match(migration, /CHECK \("awarded_mark" >= 0\)/);
  assert.doesNotMatch(migration, /ON DELETE CASCADE|ON UPDATE CASCADE/);
});

test("lifecycle requires a nullable draft total and complete atomic locked evidence", () => {
  assert.match(
    migration,
    /"status" = 'DRAFT'[\s\S]*?"total_mark" IS NULL[\s\S]*?"submitted_at" IS NULL[\s\S]*?"locked_at" IS NULL/,
  );
  assert.match(
    migration,
    /"status" = 'LOCKED'[\s\S]*?"total_mark" IS NOT NULL[\s\S]*?"submitted_at" IS NOT NULL[\s\S]*?"locked_at" IS NOT NULL/,
  );
  assert.match(migration, /Locked Examiner mark submission is immutable/);
  assert.match(migration, /Examiner mark submission identity is immutable/);
  assert.match(migration, /Question marks of a locked submission are immutable/);
  assert.match(migration, /Examiner question mark identity is immutable/);
  assert.match(
    migration,
    /FROM "summative_examiner_mark_submissions"[\s\S]*?FOR UPDATE/,
  );
});

test("database lock validation requires authoritative config, all required marks, exact total and course cap", () => {
  for (const evidence of [
    /locked_question_configuration_id/,
    /configuration_status <> 'LOCKED'/,
    /Required question marks are missing/,
    /Submission total does not equal persisted question marks/,
    /Submission total exceeds ExaminationCourse full mark/,
    /Awarded mark exceeds configured question full mark/,
  ]) {
    assert.match(migration, evidence);
  }
});

test("schema and migration mapped names agree and PostgreSQL identifiers are bounded", () => {
  const mappedNames = Array.from(
    `${candidate}\n${submission}\n${questionMark}`.matchAll(/map: "([^"]+)"/g),
  ).map((match) => match[1]!);
  const comparisonMigrationMappedNames = new Set([
    "summative_mark_submission_comparison_scope_uq",
  ]);
  for (const name of mappedNames) {
    const owningMigration = comparisonMigrationMappedNames.has(name)
      ? comparisonMigration
      : migration;
    assert.match(
      owningMigration,
      new RegExp(`"${name}"`),
      `${name} missing in owning migration`,
    );
  }
  const identifiers = Array.from(
    `${migration}\n${comparisonMigration}`.matchAll(
      /(?:INDEX|CONSTRAINT|TRIGGER|FUNCTION) "([^"]+)"/g,
    ),
  ).map((match) => match[1]!);
  for (const identifier of identifiers) {
    assert.ok(Buffer.byteLength(identifier, "utf8") <= 63, identifier);
  }
});

test("marks foundation contains no question, paper, answer-script, comparison, Third Examiner or result-handoff content", () => {
  const newModels = `${candidate}\n${submission}\n${questionMark}`;
  for (const forbidden of [
    "questionText",
    "questionBody",
    "questionPaper",
    "answerScript",
    "scriptFile",
    "examinerComment",
    "variance",
    "thirdExaminer",
    "nearestPair",
    "chairmanApproval",
    "resultHandoff",
  ]) {
    assert.doesNotMatch(newModels, new RegExp(`\\b${forbidden}\\b`, "i"));
  }
});

test("all committed historical Summative migrations remain byte-for-byte unchanged", () => {
  const expected = new Map([
    [
      "202608280001_add_summative_examination_committee_foundation",
      "d406d01c03c7bec36da9d2cac25fbb505a6a39a27a02f18239b78e3dc6ffd019",
    ],
    [
      "202608290001_add_external_examination_committee_member",
      "54e1b3e73a8ead0aaa7b492094286c7769806db001799526485172bbf40c62ef",
    ],
    [
      "202608290002_add_examination_course_examiner_assignment",
      "3398da4d144f36a5b5b6983e76a31ea3ac801d883f34132688c8f425f1e239cf",
    ],
    [
      "202608290003_add_summative_question_configuration",
      "007c75dda065725c3b460f93e06b8c40fa1a84bdff7a206880c2882cf74dde82",
    ],
  ]);
  for (const [directory, checksum] of expected) {
    const historical = readFileSync(
      join(prismaRoot, "migrations", directory, "migration.sql"),
    );
    assert.equal(createHash("sha256").update(historical).digest("hex"), checksum);
  }
});
