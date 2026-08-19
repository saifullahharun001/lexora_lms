BEGIN;

ALTER TABLE "syllabus_versions"
ADD COLUMN "course_description" TEXT;

CREATE TABLE "syllabus_objectives" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "curriculum_course_id" TEXT NOT NULL,
  "syllabus_version_id" TEXT NOT NULL,
  "statement" TEXT NOT NULL,
  "display_order" SMALLINT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "syllabus_objectives_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "syllabus_objectives_positive_display_order" CHECK ("display_order" > 0)
);

CREATE TABLE "syllabus_content_topics" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "curriculum_course_id" TEXT NOT NULL,
  "syllabus_version_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT,
  "display_order" SMALLINT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "syllabus_content_topics_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "syllabus_content_topics_positive_display_order" CHECK ("display_order" > 0)
);

CREATE TABLE "syllabus_learning_resources" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "curriculum_course_id" TEXT NOT NULL,
  "syllabus_version_id" TEXT NOT NULL,
  "resource_type_code" VARCHAR(64) NOT NULL,
  "citation_text" TEXT NOT NULL,
  "display_order" SMALLINT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "syllabus_learning_resources_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "syllabus_learning_resources_positive_display_order" CHECK ("display_order" > 0)
);

CREATE TABLE "curriculum_course_prerequisites" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "curriculum_version_id" TEXT NOT NULL,
  "curriculum_course_id" TEXT NOT NULL,
  "prerequisite_curriculum_course_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "curriculum_course_prerequisites_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "curriculum_course_prerequisites_not_self" CHECK ("curriculum_course_id" <> "prerequisite_curriculum_course_id")
);

CREATE UNIQUE INDEX "syllabus_objective_dept_syllabus_order_uq"
ON "syllabus_objectives"("department_id", "syllabus_version_id", "display_order");

CREATE UNIQUE INDEX "syllabus_content_topic_dept_syllabus_order_uq"
ON "syllabus_content_topics"("department_id", "syllabus_version_id", "display_order");

CREATE UNIQUE INDEX "syllabus_learning_resource_dept_syllabus_order_uq"
ON "syllabus_learning_resources"("department_id", "syllabus_version_id", "display_order");

CREATE UNIQUE INDEX "curriculum_course_prerequisite_pair_uq"
ON "curriculum_course_prerequisites"("department_id", "curriculum_version_id", "curriculum_course_id", "prerequisite_curriculum_course_id");

CREATE INDEX "curriculum_course_prerequisite_required_idx"
ON "curriculum_course_prerequisites"("department_id", "curriculum_version_id", "prerequisite_curriculum_course_id");

ALTER TABLE "syllabus_objectives"
ADD CONSTRAINT "syllabus_objective_department_fkey"
FOREIGN KEY ("department_id") REFERENCES "departments"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "syllabus_objectives"
ADD CONSTRAINT "syllabus_objective_syllabus_identity_fkey"
FOREIGN KEY ("syllabus_version_id", "department_id", "curriculum_course_id")
REFERENCES "syllabus_versions"("id", "department_id", "curriculum_course_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "syllabus_content_topics"
ADD CONSTRAINT "syllabus_content_topic_department_fkey"
FOREIGN KEY ("department_id") REFERENCES "departments"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "syllabus_content_topics"
ADD CONSTRAINT "syllabus_content_topic_syllabus_identity_fkey"
FOREIGN KEY ("syllabus_version_id", "department_id", "curriculum_course_id")
REFERENCES "syllabus_versions"("id", "department_id", "curriculum_course_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "syllabus_learning_resources"
ADD CONSTRAINT "syllabus_learning_resource_department_fkey"
FOREIGN KEY ("department_id") REFERENCES "departments"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "syllabus_learning_resources"
ADD CONSTRAINT "syllabus_learning_resource_syllabus_identity_fkey"
FOREIGN KEY ("syllabus_version_id", "department_id", "curriculum_course_id")
REFERENCES "syllabus_versions"("id", "department_id", "curriculum_course_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "curriculum_course_prerequisites"
ADD CONSTRAINT "curriculum_course_prerequisite_department_fkey"
FOREIGN KEY ("department_id") REFERENCES "departments"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "curriculum_course_prerequisites"
ADD CONSTRAINT "curriculum_course_prerequisite_dept_version_fkey"
FOREIGN KEY ("curriculum_version_id", "department_id")
REFERENCES "curriculum_versions"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "curriculum_course_prerequisites"
ADD CONSTRAINT "curriculum_course_prerequisite_course_identity_fkey"
FOREIGN KEY ("curriculum_course_id", "department_id", "curriculum_version_id")
REFERENCES "curriculum_courses"("id", "department_id", "curriculum_version_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "curriculum_course_prerequisites"
ADD CONSTRAINT "curriculum_course_prerequisite_required_course_fkey"
FOREIGN KEY ("prerequisite_curriculum_course_id", "department_id", "curriculum_version_id")
REFERENCES "curriculum_courses"("id", "department_id", "curriculum_version_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;
