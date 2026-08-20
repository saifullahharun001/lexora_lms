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
    "202608200002_add_course_outline_draft_content",
    "migration.sql",
  ),
  "utf8",
);
const historicalMigration = readFileSync(
  join(
    prismaRoot,
    "migrations",
    "202608190002_add_course_outline_version_foundation",
    "migration.sql",
  ),
  "utf8",
);

function model(name: string) {
  return schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? "";
}

const courseOutlineVersion = model("CourseOutlineVersion");
const teacherFields = [
  ["courseSummary", "course_summary"],
  ["deliveryPlan", "delivery_plan"],
  ["teachingStrategies", "teaching_strategies"],
  ["assessmentStrategy", "assessment_strategy"],
  ["evaluationPolicy", "evaluation_policy"],
  ["makeUpProcedure", "make_up_procedure"],
] as const;

test("CourseOutlineVersion has exactly the six nullable TEXT-backed Teacher narrative fields", () => {
  for (const [field, column] of teacherFields) {
    assert.match(
      courseOutlineVersion,
      new RegExp(`${field}\\s+String\\?\\s+@map\\("${column}"\\)`),
    );
    assert.match(migration, new RegExp(`ADD COLUMN "${column}" TEXT`));
    assert.doesNotMatch(migration, new RegExp(`"${column}" TEXT NOT NULL`));
  }

  const addedColumns = Array.from(
    migration.matchAll(/ADD COLUMN "([^"]+)" TEXT/g),
    (match) => match[1],
  );
  assert.deepEqual(addedColumns, teacherFields.map(([, column]) => column));
});

test("draft content adds no weekly plan, LessonPlan, JSON, or copied canonical syllabus/CLO/PLO data", () => {
  assert.doesNotMatch(schema, /model LessonPlan\b/);
  assert.doesNotMatch(courseOutlineVersion, /\bJson\??\b|jsonb/i);
  assert.doesNotMatch(
    courseOutlineVersion,
    /\b(?:weeklyPlan|lessonPlan|content|courseDescription|objective|prerequisite|textbook|reference|resource|cloId|ploId|cloText|ploText|cloPloMapping)\b/i,
  );
  assert.doesNotMatch(migration, /weekly|lesson|jsonb|clo|plo|objective|prerequisite|textbook|reference|resource/i);
});

test("draft-content migration is additive-only and changes no existing identity, index, status, or data", () => {
  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /^COMMIT;/m);
  assert.equal((migration.match(/ALTER TABLE "course_outline_versions"/g) ?? []).length, 1);
  assert.doesNotMatch(migration, /^\s*(?:INSERT|UPDATE|DELETE)\b/im);
  assert.doesNotMatch(migration, /\b(?:DROP|CASCADE|CREATE\s+(?:INDEX|TYPE)|ADD\s+CONSTRAINT|ALTER\s+COLUMN)\b/i);
  assert.doesNotMatch(migration, /FOREIGN KEY|CourseOutlineStatus|course_offering_outline_identity/i);
});

test("historical Course Outline foundation migration remains unchanged", () => {
  const digest = createHash("sha256")
    .update(historicalMigration.replace(/\r\n?/g, "\n"), "utf8")
    .digest("hex")
    .toUpperCase();
  assert.equal(
    digest,
    "1B481118BFD7B410FA16C60547F1FE73D54A4DB2379E02CD9F7DE02E14919D68",
  );
});
