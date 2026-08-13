CREATE TABLE "syllabus_versions" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "curriculum_course_id" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "version_number" SMALLINT NOT NULL,
  "status" "AcademicVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "effective_from" TIMESTAMP(3),
  "effective_to" TIMESTAMP(3),
  "approved_at" TIMESTAMP(3),
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "syllabus_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "syllabus_versions_positive_version" CHECK ("version_number" > 0),
  CONSTRAINT "syllabus_versions_effective_date_order" CHECK ("effective_from" IS NULL OR "effective_to" IS NULL OR "effective_to" > "effective_from"),
  CONSTRAINT "syllabus_versions_lifecycle_metadata" CHECK (
    ("status" = 'DRAFT' AND "approved_at" IS NULL AND "archived_at" IS NULL)
    OR ("status" IN ('APPROVED', 'ACTIVE', 'RETIRED') AND "approved_at" IS NOT NULL AND "archived_at" IS NULL)
    OR ("status" = 'ARCHIVED' AND "approved_at" IS NOT NULL AND "archived_at" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "curriculum_course_id_department_uq"
ON "curriculum_courses"("id", "department_id");

CREATE UNIQUE INDEX "syllabus_version_dept_curriculum_course_code_uq"
ON "syllabus_versions"("department_id", "curriculum_course_id", "code");

CREATE UNIQUE INDEX "syllabus_version_dept_curriculum_course_number_uq"
ON "syllabus_versions"("department_id", "curriculum_course_id", "version_number");

CREATE INDEX "syllabus_version_dept_status_idx"
ON "syllabus_versions"("department_id", "status");

CREATE INDEX "syllabus_version_dept_curriculum_status_idx"
ON "syllabus_versions"("department_id", "curriculum_course_id", "status");

ALTER TABLE "syllabus_versions"
ADD CONSTRAINT "syllabus_versions_department_id_fkey"
FOREIGN KEY ("department_id") REFERENCES "departments"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "syllabus_versions"
ADD CONSTRAINT "syllabus_version_dept_curriculum_course_fkey"
FOREIGN KEY ("curriculum_course_id", "department_id")
REFERENCES "curriculum_courses"("id", "department_id")
ON DELETE RESTRICT ON UPDATE CASCADE;
