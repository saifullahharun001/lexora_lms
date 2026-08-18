BEGIN;

CREATE UNIQUE INDEX "curriculum_version_id_department_uq"
ON "curriculum_versions"("id", "department_id");

CREATE UNIQUE INDEX "curriculum_course_id_department_version_uq"
ON "curriculum_courses"("id", "department_id", "curriculum_version_id");

CREATE TABLE "program_learning_outcomes" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "curriculum_version_id" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "statement" TEXT NOT NULL,
  "display_order" SMALLINT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "program_learning_outcomes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "program_learning_outcomes_positive_display_order" CHECK ("display_order" > 0)
);

CREATE TABLE "course_learning_outcomes" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "curriculum_version_id" TEXT NOT NULL,
  "curriculum_course_id" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "statement" TEXT NOT NULL,
  "display_order" SMALLINT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "course_learning_outcomes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "course_learning_outcomes_positive_display_order" CHECK ("display_order" > 0)
);

CREATE TABLE "course_learning_outcome_plo_mappings" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "curriculum_version_id" TEXT NOT NULL,
  "course_learning_outcome_id" TEXT NOT NULL,
  "program_learning_outcome_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "course_learning_outcome_plo_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "program_learning_outcome_id_dept_version_uq"
ON "program_learning_outcomes"("id", "department_id", "curriculum_version_id");

CREATE UNIQUE INDEX "program_learning_outcome_dept_version_code_uq"
ON "program_learning_outcomes"("department_id", "curriculum_version_id", "code");

CREATE UNIQUE INDEX "program_learning_outcome_dept_version_order_uq"
ON "program_learning_outcomes"("department_id", "curriculum_version_id", "display_order");

CREATE UNIQUE INDEX "course_learning_outcome_id_dept_version_uq"
ON "course_learning_outcomes"("id", "department_id", "curriculum_version_id");

CREATE UNIQUE INDEX "course_learning_outcome_dept_version_course_code_uq"
ON "course_learning_outcomes"("department_id", "curriculum_version_id", "curriculum_course_id", "code");

CREATE UNIQUE INDEX "course_learning_outcome_dept_version_course_order_uq"
ON "course_learning_outcomes"("department_id", "curriculum_version_id", "curriculum_course_id", "display_order");

CREATE UNIQUE INDEX "clo_plo_mapping_dept_version_pair_uq"
ON "course_learning_outcome_plo_mappings"("department_id", "curriculum_version_id", "course_learning_outcome_id", "program_learning_outcome_id");

CREATE INDEX "clo_plo_mapping_clo_identity_idx"
ON "course_learning_outcome_plo_mappings"("course_learning_outcome_id", "department_id", "curriculum_version_id");

CREATE INDEX "clo_plo_mapping_plo_identity_idx"
ON "course_learning_outcome_plo_mappings"("program_learning_outcome_id", "department_id", "curriculum_version_id");

ALTER TABLE "program_learning_outcomes"
ADD CONSTRAINT "program_learning_outcome_department_fkey"
FOREIGN KEY ("department_id") REFERENCES "departments"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "program_learning_outcomes"
ADD CONSTRAINT "program_learning_outcome_dept_version_fkey"
FOREIGN KEY ("curriculum_version_id", "department_id")
REFERENCES "curriculum_versions"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "course_learning_outcomes"
ADD CONSTRAINT "course_learning_outcome_department_fkey"
FOREIGN KEY ("department_id") REFERENCES "departments"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "course_learning_outcomes"
ADD CONSTRAINT "course_learning_outcome_dept_version_fkey"
FOREIGN KEY ("curriculum_version_id", "department_id")
REFERENCES "curriculum_versions"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "course_learning_outcomes"
ADD CONSTRAINT "course_learning_outcome_course_identity_fkey"
FOREIGN KEY ("curriculum_course_id", "department_id", "curriculum_version_id")
REFERENCES "curriculum_courses"("id", "department_id", "curriculum_version_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "course_learning_outcome_plo_mappings"
ADD CONSTRAINT "clo_plo_mapping_department_fkey"
FOREIGN KEY ("department_id") REFERENCES "departments"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "course_learning_outcome_plo_mappings"
ADD CONSTRAINT "clo_plo_mapping_dept_version_fkey"
FOREIGN KEY ("curriculum_version_id", "department_id")
REFERENCES "curriculum_versions"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "course_learning_outcome_plo_mappings"
ADD CONSTRAINT "clo_plo_mapping_clo_identity_fkey"
FOREIGN KEY ("course_learning_outcome_id", "department_id", "curriculum_version_id")
REFERENCES "course_learning_outcomes"("id", "department_id", "curriculum_version_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "course_learning_outcome_plo_mappings"
ADD CONSTRAINT "clo_plo_mapping_plo_identity_fkey"
FOREIGN KEY ("program_learning_outcome_id", "department_id", "curriculum_version_id")
REFERENCES "program_learning_outcomes"("id", "department_id", "curriculum_version_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;
