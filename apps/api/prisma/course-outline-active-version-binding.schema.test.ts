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
    "202608270001_add_course_outline_active_version_binding",
    "migration.sql",
  ),
  "utf8",
);
const provisioning = readFileSync(
  join(prismaRoot, "authorization", "authorization-provisioning.definition.ts"),
  "utf8",
);

function model(name: string) {
  return (
    schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? ""
  );
}

const courseOffering = model("CourseOffering");
const courseOutlineVersion = model("CourseOutlineVersion");

test("CourseOffering stores a nullable exact active CourseOutlineVersion binding", () => {
  assert.match(
    courseOffering,
    /activeCourseOutlineVersionId\s+String\?\s+@map\("active_course_outline_version_id"\)/,
  );
  assert.match(
    courseOffering,
    /activeCourseOutlineVersion\s+CourseOutlineVersion\?\s+@relation\("CourseOfferingActiveOutline", fields: \[activeCourseOutlineVersionId, departmentId, id\], references: \[id, departmentId, courseOfferingId\], onDelete: Restrict, onUpdate: Restrict, map: "course_offering_active_outline_identity_fkey"\)/,
  );
  assert.match(
    courseOutlineVersion,
    /activeForOffering\s+CourseOffering\?\s+@relation\("CourseOfferingActiveOutline"\)/,
  );
});

test("exact active binding retains the candidate identity and uses RESTRICT composite FK semantics", () => {
  assert.match(
    courseOutlineVersion,
    /@@unique\(\[id, departmentId, courseOfferingId\], map: "course_outline_version_id_dept_offering_uq"\)/,
  );
  assert.match(
    migration,
    /FOREIGN KEY \("active_course_outline_version_id", "department_id", "id"\)\s+REFERENCES "course_outline_versions"\("id", "department_id", "course_offering_id"\)\s+ON DELETE RESTRICT ON UPDATE RESTRICT;/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "course_offering_active_outline_relation_uq"\s+ON "course_offerings"\("active_course_outline_version_id", "department_id", "id"\);/,
  );
});

test("raw PostgreSQL partial unique index enforces one ACTIVE outline per scoped offering", () => {
  assert.match(
    courseOutlineVersion,
    /PostgreSQL partial unique index because Prisma 6\.x cannot represent partial indexes/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "course_outline_version_one_active_per_offering_uq"\s+ON "course_outline_versions"\("department_id", "course_offering_id"\)\s+WHERE "status" = 'ACTIVE'::"CourseOutlineStatus";/,
  );
});

test("active binding migration is additive and performs no inference, backfill, archival, or replacement", () => {
  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /^COMMIT;/m);
  assert.match(
    migration,
    /ADD COLUMN "active_course_outline_version_id" TEXT;/,
  );
  assert.doesNotMatch(migration, /^\s*(?:UPDATE|DELETE|TRUNCATE|INSERT)\b/im);
  assert.doesNotMatch(
    migration,
    /DROP\s+(?:TABLE|COLUMN|CONSTRAINT|INDEX|TYPE)|CASCADE/i,
  );
  assert.doesNotMatch(migration, /\b(?:MAX|ORDER BY|LIMIT|latest|archive)\b/i);
  assert.doesNotMatch(migration, /SET\s+"status"|SET\s+"archived_at"/i);
});

test("activation permission is deliberately absent from permanent provisioning", () => {
  assert.doesNotMatch(
    provisioning,
    /COURSE_OUTLINE_ACTIVATE|course-management\.course-outline\.activate/,
  );
});
