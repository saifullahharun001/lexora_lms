ALTER TABLE "course_offerings"
ADD COLUMN "curriculum_course_id" TEXT;

CREATE INDEX "course_offering_dept_curriculum_course_idx"
ON "course_offerings"("department_id", "curriculum_course_id");

ALTER TABLE "course_offerings"
ADD CONSTRAINT "course_offerings_curriculum_course_id_fkey"
FOREIGN KEY ("curriculum_course_id") REFERENCES "curriculum_courses"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
