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
    "202608290003_add_summative_question_configuration",
    "migration.sql",
  ),
  "utf8",
);

test("Prisma native types agree with migration SMALLINT columns", () => {
  assert.match(
    schema,
    /versionNumber\s+Int\s+@map\("version_number"\) @db\.SmallInt/,
  );
  assert.match(
    schema,
    /displayOrder\s+Int\s+@map\("display_order"\) @db\.SmallInt/,
  );
  assert.match(migration, /"version_number"\s+SMALLINT\s+NOT NULL/);
  assert.match(migration, /"display_order"\s+SMALLINT\s+NOT NULL/);
});

test("schema and migration use the same exact four-field CLO identity and name", () => {
  const name = "course_learning_outcome_id_dept_version_course_uq";
  assert.match(
    schema,
    new RegExp(
      `@@unique\\(\\[id, departmentId, curriculumVersionId, curriculumCourseId\\], map: "${name}"\\)`,
    ),
  );
  assert.match(
    migration,
    new RegExp(
      `CREATE UNIQUE INDEX "${name}"[\\s\\S]*?\\("id", "department_id", "curriculum_version_id", "curriculum_course_id"\\)`,
    ),
  );
  assert.match(
    migration,
    /FOREIGN KEY \("clo_id", "department_id", "curriculum_version_id", "curriculum_course_id"\)[\s\S]*?REFERENCES "course_learning_outcomes"\("id", "department_id", "curriculum_version_id", "curriculum_course_id"\)/,
  );
});

test("migration preserves active display-order uniqueness and deterministic checks", () => {
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "summative_question_config_item_active_order_uq"[\s\S]*?WHERE "is_active" = true/,
  );
  assert.match(
    migration,
    /CONSTRAINT "summative_question_config_version_number_pos_chk"[\s\S]*?CHECK \("version_number" > 0\)/,
  );
  assert.match(
    migration,
    /CONSTRAINT "summative_question_config_item_display_order_pos_chk"[\s\S]*?CHECK \("display_order" > 0\)/,
  );
  assert.match(
    migration,
    /CONSTRAINT "summative_question_config_item_full_mark_pos_chk"[\s\S]*?CHECK \("full_mark" > 0\)/,
  );
  assert.match(
    migration,
    /CONSTRAINT "summative_question_config_item_clo_identity_chk"[\s\S]*?"clo_id" IS NULL AND "curriculum_version_id" IS NULL AND "curriculum_course_id" IS NULL[\s\S]*?"clo_id" IS NOT NULL AND "curriculum_version_id" IS NOT NULL AND "curriculum_course_id" IS NOT NULL/,
  );
});

test("new migration identifiers are PostgreSQL-safe", () => {
  for (const identifier of Array.from(
    migration.matchAll(/(?:INDEX|CONSTRAINT) "([^"]+)"/g),
  ).map((match) => match[1]!)) {
    assert.ok(
      Buffer.byteLength(identifier, "utf8") <= 63,
      `${identifier} exceeds PostgreSQL's identifier limit`,
    );
  }
});

test("all new Prisma-mapped identity names exist exactly in the migration", () => {
  const mappedNames = [
    "course_learning_outcome_id_dept_version_course_uq",
    "examination_course_locked_config_uq",
    "examination_course_locked_config_fkey",
    "summative_question_config_department_fkey",
    "summative_question_config_exam_course_fkey",
    "summative_question_config_created_by_fkey",
    "summative_question_config_scope_uq",
    "summative_question_config_version_uq",
    "summative_question_config_status_idx",
    "summative_question_config_item_department_fkey",
    "summative_question_config_item_config_fkey",
    "summative_question_config_item_clo_fkey",
    "summative_question_config_item_scope_uq",
    "summative_question_config_item_order_idx",
  ];

  for (const name of mappedNames) {
    assert.match(schema, new RegExp(`map: "${name}"`), `${name} missing in schema`);
    assert.match(migration, new RegExp(`"${name}"`), `${name} missing in migration`);
  }
});

test("Question Configuration remains dynamic metadata-only with no question or marks content", () => {
  const configurationModel = schema.slice(
    schema.indexOf("model SummativeQuestionConfiguration {"),
    schema.indexOf("model SummativeQuestionConfigurationItem {"),
  );
  const itemModel = schema.slice(
    schema.indexOf("model SummativeQuestionConfigurationItem {"),
  );
  assert.match(configurationModel, /items\s+SummativeQuestionConfigurationItem\[\]/);
  assert.match(itemModel, /fullMark\s+Decimal[\s\S]*?@db\.Decimal\(6, 2\)/);
  assert.match(itemModel, /displayOrder\s+Int[\s\S]*?@db\.SmallInt/);
  for (const forbidden of [
    "questionText",
    "questionBody",
    "prompt",
    "questionPaper",
    "paperFile",
    "setterDraft",
    "moderationContent",
    "candidateMark",
    "examinerMark",
  ]) {
    assert.doesNotMatch(
      `${configurationModel}\n${itemModel}`,
      new RegExp(`\\b${forbidden}\\b`, "i"),
    );
  }
});
