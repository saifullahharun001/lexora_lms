ALTER TABLE "enrollments"
ADD COLUMN "student_curriculum_assignment_id" TEXT,
ADD COLUMN "curriculum_course_id" TEXT,
ADD CONSTRAINT "enrollment_curriculum_pair_ck"
CHECK (("student_curriculum_assignment_id" IS NULL) = ("curriculum_course_id" IS NULL));

CREATE INDEX "enrollment_dept_student_curriculum_idx"
ON "enrollments"("department_id", "student_curriculum_assignment_id");

CREATE INDEX "enrollment_dept_curriculum_course_idx"
ON "enrollments"("department_id", "curriculum_course_id");

ALTER TABLE "enrollments"
ADD CONSTRAINT "enrollment_student_curriculum_assignment_fk"
FOREIGN KEY ("student_curriculum_assignment_id")
REFERENCES "student_curriculum_assignments"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "enrollments"
ADD CONSTRAINT "enrollment_curriculum_course_fk"
FOREIGN KEY ("curriculum_course_id") REFERENCES "curriculum_courses"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
