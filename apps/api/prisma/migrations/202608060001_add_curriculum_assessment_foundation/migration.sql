CREATE TYPE "AcademicVersionStatus" AS ENUM ('DRAFT', 'APPROVED', 'ACTIVE', 'RETIRED', 'ARCHIVED');

CREATE TABLE "curriculum_versions" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "academic_program_id" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "status" "AcademicVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "effective_academic_session_code" VARCHAR(64) NOT NULL,
  "effective_from" TIMESTAMP(3),
  "effective_to" TIMESTAMP(3),
  "duration_years" SMALLINT NOT NULL,
  "total_semesters" SMALLINT NOT NULL,
  "credits_offered" DECIMAL(6,2) NOT NULL,
  "minimum_credits_required" DECIMAL(6,2) NOT NULL,
  "total_courses" SMALLINT NOT NULL,
  "total_programme_marks" DECIMAL(8,2) NOT NULL,
  "core_credits" DECIMAL(6,2) NOT NULL,
  "ged_credits" DECIMAL(6,2) NOT NULL,
  "capstone_credits" DECIMAL(6,2) NOT NULL,
  "core_course_count" SMALLINT NOT NULL,
  "ged_course_count" SMALLINT NOT NULL,
  "capstone_course_count" SMALLINT NOT NULL,
  "teaching_weeks_per_semester" SMALLINT,
  "notional_hours_per_credit" SMALLINT,
  "approved_at" TIMESTAMP(3),
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "curriculum_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "curriculum_versions_positive_structure" CHECK ("duration_years" > 0 AND "total_semesters" > 0),
  CONSTRAINT "curriculum_versions_credit_bounds" CHECK ("credits_offered" >= 0 AND "minimum_credits_required" >= 0 AND "minimum_credits_required" <= "credits_offered"),
  CONSTRAINT "curriculum_versions_nonnegative_totals" CHECK ("total_courses" >= 0 AND "total_programme_marks" >= 0 AND "core_credits" >= 0 AND "ged_credits" >= 0 AND "capstone_credits" >= 0 AND "core_course_count" >= 0 AND "ged_course_count" >= 0 AND "capstone_course_count" >= 0),
  CONSTRAINT "curriculum_versions_optional_positive_values" CHECK (("teaching_weeks_per_semester" IS NULL OR "teaching_weeks_per_semester" > 0) AND ("notional_hours_per_credit" IS NULL OR "notional_hours_per_credit" > 0)),
  CONSTRAINT "curriculum_versions_effective_date_order" CHECK ("effective_from" IS NULL OR "effective_to" IS NULL OR "effective_to" > "effective_from")
);

CREATE TABLE "course_assessment_templates" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "academic_program_id" TEXT,
  "code" VARCHAR(64) NOT NULL,
  "version_number" SMALLINT NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "status" "AcademicVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "total_marks" DECIMAL(6,2) NOT NULL,
  "effective_from" TIMESTAMP(3),
  "effective_to" TIMESTAMP(3),
  "approved_at" TIMESTAMP(3),
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "course_assessment_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "course_assessment_templates_positive_version" CHECK ("version_number" > 0),
  CONSTRAINT "course_assessment_templates_positive_total_marks" CHECK ("total_marks" > 0),
  CONSTRAINT "course_assessment_templates_effective_date_order" CHECK ("effective_from" IS NULL OR "effective_to" IS NULL OR "effective_to" > "effective_from")
);

CREATE TABLE "assessment_template_components" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "assessment_template_id" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "display_name" VARCHAR(255) NOT NULL,
  "group_code" VARCHAR(64),
  "maximum_marks" DECIMAL(6,2) NOT NULL,
  "display_order" SMALLINT NOT NULL,
  "is_required" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "assessment_template_components_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assessment_template_components_positive_marks" CHECK ("maximum_marks" > 0),
  CONSTRAINT "assessment_template_components_nonnegative_order" CHECK ("display_order" >= 0)
);

CREATE TABLE "curriculum_courses" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "curriculum_version_id" TEXT NOT NULL,
  "course_id" TEXT NOT NULL,
  "assessment_template_id" TEXT NOT NULL,
  "category_code" VARCHAR(64) NOT NULL,
  "academic_year_number" SMALLINT NOT NULL,
  "semester_number" SMALLINT NOT NULL,
  "display_order" SMALLINT NOT NULL,
  "course_code_snapshot" VARCHAR(64) NOT NULL,
  "course_title_snapshot" VARCHAR(255) NOT NULL,
  "credit_hours_snapshot" DECIMAL(6,2) NOT NULL,
  "total_marks_snapshot" DECIMAL(6,2) NOT NULL,
  "is_required" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "curriculum_courses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "curriculum_courses_positive_placement" CHECK ("academic_year_number" > 0 AND "semester_number" > 0),
  CONSTRAINT "curriculum_courses_nonnegative_order" CHECK ("display_order" >= 0),
  CONSTRAINT "curriculum_courses_nonnegative_credits" CHECK ("credit_hours_snapshot" >= 0),
  CONSTRAINT "curriculum_courses_positive_total_marks" CHECK ("total_marks_snapshot" > 0)
);

CREATE UNIQUE INDEX "curriculum_version_dept_program_code_uq" ON "curriculum_versions"("department_id", "academic_program_id", "code");
CREATE INDEX "curriculum_version_dept_status_idx" ON "curriculum_versions"("department_id", "status");
CREATE INDEX "curriculum_version_dept_session_idx" ON "curriculum_versions"("department_id", "effective_academic_session_code");
CREATE INDEX "curriculum_version_dept_program_status_idx" ON "curriculum_versions"("department_id", "academic_program_id", "status");
CREATE UNIQUE INDEX "assessment_template_dept_code_version_uq" ON "course_assessment_templates"("department_id", "code", "version_number");
CREATE INDEX "assessment_template_dept_status_idx" ON "course_assessment_templates"("department_id", "status");
CREATE INDEX "assessment_template_dept_program_idx" ON "course_assessment_templates"("department_id", "academic_program_id");
CREATE UNIQUE INDEX "assessment_component_template_code_uq" ON "assessment_template_components"("assessment_template_id", "code");
CREATE UNIQUE INDEX "assessment_component_template_order_uq" ON "assessment_template_components"("assessment_template_id", "display_order");
CREATE INDEX "assessment_component_dept_template_idx" ON "assessment_template_components"("department_id", "assessment_template_id");
CREATE UNIQUE INDEX "curriculum_course_version_course_uq" ON "curriculum_courses"("curriculum_version_id", "course_id");
CREATE UNIQUE INDEX "curriculum_course_version_term_order_uq" ON "curriculum_courses"("curriculum_version_id", "academic_year_number", "semester_number", "display_order");
CREATE INDEX "curriculum_course_dept_version_idx" ON "curriculum_courses"("department_id", "curriculum_version_id");
CREATE INDEX "curriculum_course_dept_version_term_order_idx" ON "curriculum_courses"("department_id", "curriculum_version_id", "academic_year_number", "semester_number", "display_order");
CREATE INDEX "curriculum_course_dept_course_idx" ON "curriculum_courses"("department_id", "course_id");
CREATE INDEX "curriculum_course_dept_template_idx" ON "curriculum_courses"("department_id", "assessment_template_id");

ALTER TABLE "curriculum_versions" ADD CONSTRAINT "curriculum_versions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curriculum_versions" ADD CONSTRAINT "curriculum_versions_academic_program_id_fkey" FOREIGN KEY ("academic_program_id") REFERENCES "academic_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "course_assessment_templates" ADD CONSTRAINT "course_assessment_templates_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "course_assessment_templates" ADD CONSTRAINT "course_assessment_templates_academic_program_id_fkey" FOREIGN KEY ("academic_program_id") REFERENCES "academic_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_template_components" ADD CONSTRAINT "assessment_template_components_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_template_components" ADD CONSTRAINT "assessment_template_components_assessment_template_id_fkey" FOREIGN KEY ("assessment_template_id") REFERENCES "course_assessment_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curriculum_courses" ADD CONSTRAINT "curriculum_courses_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curriculum_courses" ADD CONSTRAINT "curriculum_courses_curriculum_version_id_fkey" FOREIGN KEY ("curriculum_version_id") REFERENCES "curriculum_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curriculum_courses" ADD CONSTRAINT "curriculum_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curriculum_courses" ADD CONSTRAINT "curriculum_courses_assessment_template_id_fkey" FOREIGN KEY ("assessment_template_id") REFERENCES "course_assessment_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
