BEGIN;

CREATE TYPE "CourseOutlineStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED_BY_TEACHER',
  'COORDINATOR_REVIEW',
  'RETURNED_FOR_CORRECTION',
  'APPROVED',
  'ACTIVE',
  'ARCHIVED'
);

CREATE UNIQUE INDEX "course_offering_outline_identity_uq"
ON "course_offerings"("id", "department_id", "curriculum_course_id", "syllabus_version_id");

CREATE TABLE "course_outline_versions" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "course_offering_id" TEXT NOT NULL,
  "curriculum_course_id" TEXT NOT NULL,
  "syllabus_version_id" TEXT NOT NULL,
  "version_number" SMALLINT NOT NULL,
  "status" "CourseOutlineStatus" NOT NULL DEFAULT 'DRAFT',
  "submitted_at" TIMESTAMP(3),
  "approved_at" TIMESTAMP(3),
  "activated_at" TIMESTAMP(3),
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "course_outline_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "course_outline_versions_positive_version" CHECK ("version_number" > 0)
);

CREATE UNIQUE INDEX "course_outline_version_dept_offering_number_uq"
ON "course_outline_versions"("department_id", "course_offering_id", "version_number");

CREATE UNIQUE INDEX "course_outline_version_id_dept_offering_uq"
ON "course_outline_versions"("id", "department_id", "course_offering_id");

CREATE INDEX "course_outline_version_dept_offering_status_idx"
ON "course_outline_versions"("department_id", "course_offering_id", "status");

CREATE INDEX "course_outline_version_dept_syllabus_idx"
ON "course_outline_versions"("department_id", "syllabus_version_id");

ALTER TABLE "course_outline_versions"
ADD CONSTRAINT "course_outline_version_department_fkey"
FOREIGN KEY ("department_id") REFERENCES "departments"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "course_outline_versions"
ADD CONSTRAINT "course_outline_version_offering_identity_fkey"
FOREIGN KEY ("course_offering_id", "department_id", "curriculum_course_id", "syllabus_version_id")
REFERENCES "course_offerings"("id", "department_id", "curriculum_course_id", "syllabus_version_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "course_outline_versions"
ADD CONSTRAINT "course_outline_version_curriculum_course_fkey"
FOREIGN KEY ("curriculum_course_id", "department_id")
REFERENCES "curriculum_courses"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "course_outline_versions"
ADD CONSTRAINT "course_outline_version_syllabus_identity_fkey"
FOREIGN KEY ("syllabus_version_id", "department_id", "curriculum_course_id")
REFERENCES "syllabus_versions"("id", "department_id", "curriculum_course_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;
