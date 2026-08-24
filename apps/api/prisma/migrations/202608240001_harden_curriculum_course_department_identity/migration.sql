BEGIN;

CREATE UNIQUE INDEX "course_id_department_uq"
ON "courses"("id", "department_id");

CREATE UNIQUE INDEX "assessment_template_id_department_uq"
ON "course_assessment_templates"("id", "department_id");

ALTER TABLE "curriculum_courses"
DROP CONSTRAINT "curriculum_courses_course_id_fkey";

ALTER TABLE "curriculum_courses"
DROP CONSTRAINT "curriculum_courses_curriculum_version_id_fkey";

ALTER TABLE "curriculum_courses"
DROP CONSTRAINT "curriculum_courses_assessment_template_id_fkey";

ALTER TABLE "curriculum_courses"
ADD CONSTRAINT "curriculum_course_dept_course_fkey"
FOREIGN KEY ("course_id", "department_id")
REFERENCES "courses"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "curriculum_courses"
ADD CONSTRAINT "curriculum_course_dept_version_fkey"
FOREIGN KEY ("curriculum_version_id", "department_id")
REFERENCES "curriculum_versions"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "curriculum_courses"
ADD CONSTRAINT "curriculum_course_dept_template_fkey"
FOREIGN KEY ("assessment_template_id", "department_id")
REFERENCES "course_assessment_templates"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;
