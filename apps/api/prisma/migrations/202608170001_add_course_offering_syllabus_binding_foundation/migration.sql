BEGIN;

ALTER TABLE "course_offerings"
ADD COLUMN "syllabus_version_id" TEXT;

CREATE UNIQUE INDEX "syllabus_version_id_department_curriculum_course_uq"
ON "syllabus_versions"("id", "department_id", "curriculum_course_id");

CREATE INDEX "course_offering_dept_syllabus_version_idx"
ON "course_offerings"("department_id", "syllabus_version_id");

ALTER TABLE "course_offerings"
ADD CONSTRAINT "course_offering_syllabus_requires_curriculum"
CHECK (
  "syllabus_version_id" IS NULL
  OR "curriculum_course_id" IS NOT NULL
);

ALTER TABLE "course_offerings"
ADD CONSTRAINT "course_offering_syllabus_identity_fkey"
FOREIGN KEY ("syllabus_version_id", "department_id", "curriculum_course_id")
REFERENCES "syllabus_versions"("id", "department_id", "curriculum_course_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;
