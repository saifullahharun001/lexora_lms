-- AlterTable
ALTER TABLE "assessment_template_components"
ADD CONSTRAINT "assessment_component_id_dept_template_uq"
UNIQUE ("id", "department_id", "assessment_template_id");

-- AlterTable
ALTER TABLE "curriculum_courses"
ADD CONSTRAINT "curriculum_course_id_department_template_uq"
UNIQUE ("id", "department_id", "assessment_template_id");

-- AlterTable
ALTER TABLE "syllabus_content_topics"
ADD CONSTRAINT "syllabus_content_topic_identity_uq"
UNIQUE ("id", "department_id", "syllabus_version_id", "curriculum_course_id");

-- AlterTable
ALTER TABLE "course_outline_versions"
ADD CONSTRAINT "course_outline_version_full_identity_uq"
UNIQUE (
  "id",
  "department_id",
  "course_offering_id",
  "curriculum_course_id",
  "syllabus_version_id"
);

-- CreateTable
CREATE TABLE "course_outline_topic_plans" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "course_outline_version_id" TEXT NOT NULL,
    "course_offering_id" TEXT NOT NULL,
    "curriculum_course_id" TEXT NOT NULL,
    "syllabus_version_id" TEXT NOT NULL,
    "syllabus_content_topic_id" TEXT NOT NULL,
    "assessment_technique" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_outline_topic_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_outline_topic_clo_mappings" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "topic_plan_id" TEXT NOT NULL,
    "course_learning_outcome_id" TEXT NOT NULL,
    "curriculum_course_id" TEXT NOT NULL,
    "curriculum_version_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_outline_topic_clo_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_outline_supplemental_resources" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "course_outline_version_id" TEXT NOT NULL,
    "course_offering_id" TEXT NOT NULL,
    "curriculum_course_id" TEXT NOT NULL,
    "syllabus_version_id" TEXT NOT NULL,
    "resource_type_code" VARCHAR(64) NOT NULL,
    "citation_text" TEXT NOT NULL,
    "display_order" SMALLINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_outline_supplemental_resources_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "course_outline_supplemental_resource_display_order_check"
      CHECK ("display_order" > 0)
);

-- CreateTable
CREATE TABLE "course_outline_assessment_schedule_items" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "course_outline_version_id" TEXT NOT NULL,
    "course_offering_id" TEXT NOT NULL,
    "curriculum_course_id" TEXT NOT NULL,
    "syllabus_version_id" TEXT NOT NULL,
    "assessment_template_id" TEXT NOT NULL,
    "assessment_template_component_id" TEXT NOT NULL,
    "planned_week_number" SMALLINT,
    "scheduled_at" TIMESTAMP(3),
    "notes" TEXT,
    "display_order" SMALLINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_outline_assessment_schedule_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "course_outline_assessment_schedule_display_order_check"
      CHECK ("display_order" > 0),
    CONSTRAINT "course_outline_assessment_schedule_week_check"
      CHECK ("planned_week_number" IS NULL OR "planned_week_number" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "course_outline_topic_plan_version_topic_uq"
ON "course_outline_topic_plans"(
  "course_outline_version_id",
  "department_id",
  "syllabus_content_topic_id"
);

-- CreateIndex
CREATE UNIQUE INDEX "course_outline_topic_plan_id_dept_course_uq"
ON "course_outline_topic_plans"("id", "department_id", "curriculum_course_id");

-- CreateIndex
CREATE INDEX "course_outline_topic_plan_topic_identity_idx"
ON "course_outline_topic_plans"(
  "syllabus_content_topic_id",
  "department_id",
  "syllabus_version_id",
  "curriculum_course_id"
);

-- CreateIndex
CREATE UNIQUE INDEX "course_outline_topic_clo_mapping_plan_clo_uq"
ON "course_outline_topic_clo_mappings"(
  "topic_plan_id",
  "course_learning_outcome_id"
);

-- CreateIndex
CREATE INDEX "course_outline_topic_clo_mapping_clo_identity_idx"
ON "course_outline_topic_clo_mappings"(
  "course_learning_outcome_id",
  "department_id",
  "curriculum_version_id",
  "curriculum_course_id"
);

-- CreateIndex
CREATE UNIQUE INDEX "course_outline_supplemental_resource_version_order_uq"
ON "course_outline_supplemental_resources"(
  "course_outline_version_id",
  "department_id",
  "display_order"
);

-- CreateIndex
CREATE UNIQUE INDEX "course_outline_assessment_schedule_version_component_uq"
ON "course_outline_assessment_schedule_items"(
  "course_outline_version_id",
  "department_id",
  "assessment_template_component_id"
);

-- CreateIndex
CREATE UNIQUE INDEX "course_outline_assessment_schedule_version_order_uq"
ON "course_outline_assessment_schedule_items"(
  "course_outline_version_id",
  "department_id",
  "display_order"
);

-- CreateIndex
CREATE INDEX "course_outline_assessment_schedule_course_template_idx"
ON "course_outline_assessment_schedule_items"(
  "curriculum_course_id",
  "department_id",
  "assessment_template_id"
);

-- CreateIndex
CREATE INDEX "course_outline_assessment_schedule_component_identity_idx"
ON "course_outline_assessment_schedule_items"(
  "assessment_template_component_id",
  "department_id",
  "assessment_template_id"
);

-- AddForeignKey
ALTER TABLE "course_outline_topic_plans"
ADD CONSTRAINT "course_outline_topic_plan_version_identity_fkey"
FOREIGN KEY (
  "course_outline_version_id",
  "department_id",
  "course_offering_id",
  "curriculum_course_id",
  "syllabus_version_id"
) REFERENCES "course_outline_versions"(
  "id",
  "department_id",
  "course_offering_id",
  "curriculum_course_id",
  "syllabus_version_id"
) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "course_outline_topic_plans"
ADD CONSTRAINT "course_outline_topic_plan_topic_identity_fkey"
FOREIGN KEY (
  "syllabus_content_topic_id",
  "department_id",
  "syllabus_version_id",
  "curriculum_course_id"
) REFERENCES "syllabus_content_topics"(
  "id",
  "department_id",
  "syllabus_version_id",
  "curriculum_course_id"
) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "course_outline_topic_clo_mappings"
ADD CONSTRAINT "course_outline_topic_clo_mapping_topic_plan_fkey"
FOREIGN KEY ("topic_plan_id", "department_id", "curriculum_course_id")
REFERENCES "course_outline_topic_plans"(
  "id",
  "department_id",
  "curriculum_course_id"
) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "course_outline_topic_clo_mappings"
ADD CONSTRAINT "course_outline_topic_clo_mapping_clo_fkey"
FOREIGN KEY (
  "course_learning_outcome_id",
  "department_id",
  "curriculum_version_id",
  "curriculum_course_id"
) REFERENCES "course_learning_outcomes"(
  "id",
  "department_id",
  "curriculum_version_id",
  "curriculum_course_id"
) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "course_outline_supplemental_resources"
ADD CONSTRAINT "course_outline_supplemental_resource_version_identity_fkey"
FOREIGN KEY (
  "course_outline_version_id",
  "department_id",
  "course_offering_id",
  "curriculum_course_id",
  "syllabus_version_id"
) REFERENCES "course_outline_versions"(
  "id",
  "department_id",
  "course_offering_id",
  "curriculum_course_id",
  "syllabus_version_id"
) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "course_outline_assessment_schedule_items"
ADD CONSTRAINT "course_outline_assessment_schedule_version_identity_fkey"
FOREIGN KEY (
  "course_outline_version_id",
  "department_id",
  "course_offering_id",
  "curriculum_course_id",
  "syllabus_version_id"
) REFERENCES "course_outline_versions"(
  "id",
  "department_id",
  "course_offering_id",
  "curriculum_course_id",
  "syllabus_version_id"
) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "course_outline_assessment_schedule_items"
ADD CONSTRAINT "course_outline_assessment_schedule_course_template_fkey"
FOREIGN KEY (
  "curriculum_course_id",
  "department_id",
  "assessment_template_id"
) REFERENCES "curriculum_courses"(
  "id",
  "department_id",
  "assessment_template_id"
) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "course_outline_assessment_schedule_items"
ADD CONSTRAINT "course_outline_assessment_schedule_component_identity_fkey"
FOREIGN KEY (
  "assessment_template_component_id",
  "department_id",
  "assessment_template_id"
) REFERENCES "assessment_template_components"(
  "id",
  "department_id",
  "assessment_template_id"
) ON DELETE RESTRICT ON UPDATE RESTRICT;
