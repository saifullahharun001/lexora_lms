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
    "202609010003_add_summative_third_examiner_marks",
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

function model(name: string) {
  return schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? "";
}

const submission = model("SummativeThirdExaminerMarkSubmission");
const questionMark = model("SummativeThirdExaminerQuestionMark");

test("submission identity is referral bound", () => {
  assert.match(
    submission,
    /referral\s+SummativeThirdExaminationReferral\s+@relation\(fields: \[referralId\]/,
  );
  assert.match(
    submission,
    /questionConfiguration\s+SummativeQuestionConfiguration\s+@relation\(fields: \[questionConfigurationId, departmentId, examinationId, examinationCourseId\]/,
  );
  assert.match(
    submission,
    /@@unique\(\[departmentId, referralId, versionNumber\], map: "summative_third_mark_submission_referral_version_uq"\)/,
  );
});

test("question marks use exact Decimal(6,2), unique submission-item identity and restrictive FKs", () => {
  assert.match(questionMark, /awardedMark\s+Decimal[\s\S]*?@db\.Decimal\(6, 2\)/);
  assert.match(
    questionMark,
    /@@unique\(\[submissionId, questionItemId\], map: "summative_third_question_mark_submission_item_uq"\)/,
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
  assert.match(migration, /Locked Third Examiner mark submission is immutable/);
  assert.match(migration, /Third Examiner mark submission identity is immutable/);
  assert.match(migration, /Question marks of a locked submission are immutable/);
  assert.match(migration, /Third Examiner question mark identity is immutable/);
  assert.match(
    migration,
    /FROM "summative_third_examiner_mark_submissions"[\s\S]*?FOR UPDATE/,
  );
});

test("database lock validation requires authoritative config, all required marks, exact total and course cap", () => {
  for (const evidence of [
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
    `${submission}\n${questionMark}`.matchAll(/map: "([^"]+)"/g),
  ).map((match) => match[1]!);
  for (const name of mappedNames) {
    assert.match(
      `${migration}\n${calculationMigration}`,
      new RegExp(`"${name}"`),
      `${name} missing in owning migration`,
    );
  }
  const identifiers = Array.from(
    `${migration}`.matchAll(
      /(?:INDEX|CONSTRAINT|TRIGGER|FUNCTION) "([^"]+)"/g,
    ),
  ).map((match) => match[1]!);
  for (const identifier of identifiers) {
    assert.ok(Buffer.byteLength(identifier, "utf8") <= 63, identifier);
  }
});

test("marks foundation contains no comparison, Chairman approval or result-handoff content", () => {
  const newModels = `${submission}\n${questionMark}`;
  for (const forbidden of [
    "questionText",
    "questionBody",
    "questionPaper",
    "answerScript",
    "scriptFile",
    "examinerComment",
    "variance",
    "nearestPair",
    "chairmanApproval",
    "resultHandoff",
  ]) {
    assert.doesNotMatch(newModels, new RegExp(`\\b${forbidden}\\b`, "i"));
  }
});
