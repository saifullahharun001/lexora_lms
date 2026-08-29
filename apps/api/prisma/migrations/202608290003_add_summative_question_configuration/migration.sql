-- PASS A: Corrected migration for summative_question_configurations
-- DO NOT MODIFY any committed migration.
-- This file replaces the previous draft 202608290003 migration.

-- CreateEnum
CREATE TYPE "BloomLevel" AS ENUM ('REMEMBERING', 'UNDERSTANDING', 'APPLYING', 'ANALYZING', 'EVALUATING', 'CREATING');

-- CreateEnum
CREATE TYPE "SummativeQuestionConfigurationStatus" AS ENUM ('DRAFT', 'LOCKED', 'ARCHIVED');

-- AlterTable: add locked_question_configuration_id to examination_courses
ALTER TABLE "examination_courses" ADD COLUMN "locked_question_configuration_id" TEXT;

-- Add 4-field composite unique to course_learning_outcomes for full-identity FK target
CREATE UNIQUE INDEX "course_learning_outcome_id_dept_version_course_uq"
    ON "course_learning_outcomes"("id", "department_id", "curriculum_version_id", "curriculum_course_id");

-- CreateTable: summative_question_configurations
CREATE TABLE "summative_question_configurations" (
    "id"                   TEXT        NOT NULL,
    "department_id"        TEXT        NOT NULL,
    "examination_id"       TEXT        NOT NULL,
    "examination_course_id" TEXT       NOT NULL,
    "version_number"       SMALLINT    NOT NULL,
    "status"               "SummativeQuestionConfigurationStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_user_id"   TEXT        NOT NULL,
    "locked_at"            TIMESTAMP(3),
    "archived_at"          TIMESTAMP(3),
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "summative_question_configurations_pkey" PRIMARY KEY ("id"),
    -- versionNumber must be positive
    CONSTRAINT "summative_question_config_version_number_pos_chk"
        CHECK ("version_number" > 0),
    -- Lifecycle coherence:
    --   DRAFT  : locked_at IS NULL AND archived_at IS NULL
    --   LOCKED : locked_at IS NOT NULL AND archived_at IS NULL
    --   ARCHIVED: archived_at IS NOT NULL
    --   (ARCHIVED may or may not have locked_at – preserve history)
    CONSTRAINT "summative_question_config_lifecycle_chk" CHECK (
        ("status" = 'DRAFT'     AND "locked_at" IS NULL     AND "archived_at" IS NULL) OR
        ("status" = 'LOCKED'    AND "locked_at" IS NOT NULL AND "archived_at" IS NULL) OR
        ("status" = 'ARCHIVED'  AND "archived_at" IS NOT NULL)
    )
);

-- CreateTable: summative_question_configuration_items
CREATE TABLE "summative_question_configuration_items" (
    "id"                    TEXT          NOT NULL,
    "department_id"         TEXT          NOT NULL,
    "configuration_id"      TEXT          NOT NULL,
    "examination_course_id" TEXT          NOT NULL,
    "question_label"        VARCHAR(16)   NOT NULL,
    "sub_question_label"    VARCHAR(16),
    "display_order"         SMALLINT      NOT NULL,
    "full_mark"             DECIMAL(6,2)  NOT NULL,
    "is_required"           BOOLEAN       NOT NULL DEFAULT true,
    "clo_id"                TEXT,
    "curriculum_version_id" TEXT,
    "curriculum_course_id"  TEXT,
    "bloom_level"           "BloomLevel",
    "is_active"             BOOLEAN       NOT NULL DEFAULT true,
    "created_at"            TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3)  NOT NULL,

    CONSTRAINT "summative_question_configuration_items_pkey" PRIMARY KEY ("id"),
    -- display_order must be positive
    CONSTRAINT "summative_question_config_item_display_order_pos_chk"
        CHECK ("display_order" > 0),
    -- full_mark must be positive
    CONSTRAINT "summative_question_config_item_full_mark_pos_chk"
        CHECK ("full_mark" > 0),
    -- CLO composite identity: all-NULL or all-NOT-NULL
    CONSTRAINT "summative_question_config_item_clo_identity_chk" CHECK (
        ("clo_id" IS NULL AND "curriculum_version_id" IS NULL AND "curriculum_course_id" IS NULL) OR
        ("clo_id" IS NOT NULL AND "curriculum_version_id" IS NOT NULL AND "curriculum_course_id" IS NOT NULL)
    )
);

-- Unique index: version_number uniqueness within (department, examination_course)
CREATE UNIQUE INDEX "summative_question_config_version_uq"
    ON "summative_question_configurations"("department_id", "examination_course_id", "version_number");

-- Composite scope unique (used as FK target by examination_courses.locked_question_configuration_id)
CREATE UNIQUE INDEX "summative_question_config_scope_uq"
    ON "summative_question_configurations"("id", "department_id", "examination_course_id");

-- Status index
CREATE INDEX "summative_question_config_status_idx"
    ON "summative_question_configurations"("department_id", "examination_course_id", "status");

-- Item scope unique (id, dept, config) – for lookups
CREATE UNIQUE INDEX "summative_question_config_item_scope_uq"
    ON "summative_question_configuration_items"("id", "department_id", "configuration_id");

-- Item lookup index
CREATE INDEX "summative_question_config_item_order_idx"
    ON "summative_question_configuration_items"("department_id", "configuration_id", "is_active", "display_order");

-- PARTIAL unique index: active display_order must be unique per configuration
-- Inactive rows are exempt – they are historical.
CREATE UNIQUE INDEX "summative_question_config_item_active_order_uq"
    ON "summative_question_configuration_items"("department_id", "configuration_id", "display_order")
    WHERE "is_active" = true;

-- examination_courses locked config scope unique (FK target)
CREATE UNIQUE INDEX "examination_course_locked_config_uq"
    ON "examination_courses"("locked_question_configuration_id", "department_id", "id");

-- AddForeignKey: examination_courses -> summative_question_configurations (composite: locked_config, dept, exam_course)
ALTER TABLE "examination_courses"
    ADD CONSTRAINT "examination_course_locked_config_fkey"
    FOREIGN KEY ("locked_question_configuration_id", "department_id", "id")
    REFERENCES "summative_question_configurations"("id", "department_id", "examination_course_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey: summative_question_configurations -> departments
ALTER TABLE "summative_question_configurations"
    ADD CONSTRAINT "summative_question_config_department_fkey"
    FOREIGN KEY ("department_id")
    REFERENCES "departments"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey: summative_question_configurations -> examination_courses (composite: id, dept, examination_id)
ALTER TABLE "summative_question_configurations"
    ADD CONSTRAINT "summative_question_config_exam_course_fkey"
    FOREIGN KEY ("examination_course_id", "department_id", "examination_id")
    REFERENCES "examination_courses"("id", "department_id", "examination_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey: summative_question_configurations -> users (created_by, composite: user_id, dept)
ALTER TABLE "summative_question_configurations"
    ADD CONSTRAINT "summative_question_config_created_by_fkey"
    FOREIGN KEY ("created_by_user_id", "department_id")
    REFERENCES "users"("id", "department_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey: summative_question_configuration_items -> departments
ALTER TABLE "summative_question_configuration_items"
    ADD CONSTRAINT "summative_question_config_item_department_fkey"
    FOREIGN KEY ("department_id")
    REFERENCES "departments"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey: items -> summative_question_configurations (composite: config_id, dept, exam_course)
ALTER TABLE "summative_question_configuration_items"
    ADD CONSTRAINT "summative_question_config_item_config_fkey"
    FOREIGN KEY ("configuration_id", "department_id", "examination_course_id")
    REFERENCES "summative_question_configurations"("id", "department_id", "examination_course_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey: items -> course_learning_outcomes (4-field composite: clo_id, dept, version, course)
-- This enforces cross-department/cross-course CLO isolation at DB level.
-- NULL clo_id rows skip this FK (PostgreSQL skips FK check if any key column is NULL).
ALTER TABLE "summative_question_configuration_items"
    ADD CONSTRAINT "summative_question_config_item_clo_fkey"
    FOREIGN KEY ("clo_id", "department_id", "curriculum_version_id", "curriculum_course_id")
    REFERENCES "course_learning_outcomes"("id", "department_id", "curriculum_version_id", "curriculum_course_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
