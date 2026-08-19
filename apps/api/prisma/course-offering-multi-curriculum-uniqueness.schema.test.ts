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
    "202608100002_redesign_course_offering_uniqueness",
    "migration.sql",
  ),
  "utf8",
);

function model(name: string) {
  return (
    schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? ""
  );
}

function canonicalMigrationHash(contents: string) {
  const normalizedContents = contents
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  return createHash("sha256")
    .update(Buffer.from(normalizedContents, "utf8"))
    .digest("hex")
    .toUpperCase();
}

const courseOffering = model("CourseOffering");

test("CourseOffering schema delegates nullable uniqueness to PostgreSQL partial indexes", () => {
  assert.match(
    courseOffering,
    /curriculumCourseId\s+String\?\s+@map\("curriculum_course_id"\)/,
  );
  assert.doesNotMatch(
    courseOffering,
    /@@unique\(\[departmentId, academicTermId, courseId, sectionCode\]\)/,
  );
  assert.match(courseOffering, /PostgreSQL partial unique indexes/);
  assert.match(
    courseOffering,
    /@@index\(\[departmentId, curriculumCourseId\], map: "course_offering_dept_curriculum_course_idx"\)/,
  );
  assert.match(
    courseOffering,
    /curriculumCourse\s+CurriculumCourse\?\s+@relation\(fields: \[curriculumCourseId\], references: \[id\], onDelete: Restrict\)/,
  );
});

test("migration fails closed on both proposed identity duplicate sets", () => {
  assert.match(
    migration,
    /WHERE "curriculum_course_id" IS NULL\s+GROUP BY "department_id", "academic_term_id", "course_id", "section_code"\s+HAVING COUNT\(\*\) > 1/,
  );
  assert.match(
    migration,
    /WHERE "curriculum_course_id" IS NOT NULL\s+GROUP BY "department_id", "academic_term_id", "curriculum_course_id", "section_code"\s+HAVING COUNT\(\*\) > 1/,
  );
  assert.equal((migration.match(/RAISE EXCEPTION/g) ?? []).length, 2);
});

test("migration creates the exact unbound and bound partial unique indexes", () => {
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "course_offering_unbound_identity_uq"\s+ON "course_offerings"\("department_id", "academic_term_id", "course_id", "section_code"\)\s+WHERE "curriculum_course_id" IS NULL;/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "course_offering_bound_curriculum_identity_uq"\s+ON "course_offerings"\("department_id", "academic_term_id", "curriculum_course_id", "section_code"\)\s+WHERE "curriculum_course_id" IS NOT NULL;/,
  );
  assert.match(
    migration,
    /DROP INDEX "course_offerings_department_id_academic_term_id_course_id_s_key";/,
  );
  assert.equal((migration.match(/CREATE UNIQUE INDEX/g) ?? []).length, 2);
  assert.doesNotMatch(migration, /archived_at/i);
  assert.doesNotMatch(migration, /^\s*(?:UPDATE|DELETE|INSERT)\b/im);
  assert.doesNotMatch(migration, /ALTER TABLE|ADD COLUMN|DROP COLUMN/i);
  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /^COMMIT;/m);
});

test("all prior migration files retain their reviewed hashes", () => {
  const expected = {
    "20260521_add_notice_foundation":
      "A332164758A2E49BF0D1B9DC4AE47194C76FED27A501725FA0F1F030A5CA6B2B",
    "20260805_add_file_malware_scan_job_ledger":
      "628E852605F01340B9A982374321266C47BEF383D62BEFF545903170F9AFEEB3",
    "202608060001_add_curriculum_assessment_foundation":
      "2E319C1C5B773B7C3AD255EC5AB2DE9DCEB1891DBAF081C7254FC9A7C0E0ED33",
    "202608070001_add_course_offering_curriculum_binding":
      "0D549E1B1A125FA7F7BEB57C896147541BE0A98EC94B6C03787D5A624F0DB5BC",
    "202608090001_add_student_curriculum_assignment":
      "59C6E224B94EAB0BC466879E8F9D10D206F89A39AF5C1CB7C79025C5088BCF89",
    "202608090002_add_enrollment_curriculum_binding_foundation":
      "A991D2679E732F2868EBF61FB4CFF8E7FB6CF402BDE10B21ED8DCEB475C26B32",
    "202608100001_harden_enrollment_course_offering_delete":
      "0009DB953E2751EA7A74023CE845D09BEF12782971C2DE85397A25BA6A52759A",
  } as const;

  for (const [directory, hash] of Object.entries(expected)) {
    const contents = readFileSync(
      join(prismaRoot, "migrations", directory, "migration.sql"),
      "utf8",
    );
    assert.equal(canonicalMigrationHash(contents), hash);
  }
});

test("historical migration hashes tolerate only line-ending representation", () => {
  const lf = "BEGIN;\nSELECT 1;\nCOMMIT;\n";
  const crlf = lf.replace(/\n/g, "\r\n");
  const loneCr = lf.replace(/\n/g, "\r");
  const contentMutation = "BEGIN;\nSELECT 2;\nCOMMIT;\n";

  assert.equal(canonicalMigrationHash(lf), canonicalMigrationHash(crlf));
  assert.equal(canonicalMigrationHash(lf), canonicalMigrationHash(loneCr));
  assert.notEqual(
    canonicalMigrationHash(lf),
    canonicalMigrationHash(contentMutation),
  );
});
