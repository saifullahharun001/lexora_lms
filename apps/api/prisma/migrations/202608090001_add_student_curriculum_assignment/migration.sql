CREATE TABLE "student_curriculum_assignments" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "student_user_id" TEXT NOT NULL,
    "academic_program_id" TEXT NOT NULL,
    "curriculum_version_id" TEXT NOT NULL,
    "assigned_by_user_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_curriculum_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "student_curriculum_assignment_dept_student_program_uq"
ON "student_curriculum_assignments"("department_id", "student_user_id", "academic_program_id");

CREATE INDEX "student_curriculum_assignment_dept_version_idx"
ON "student_curriculum_assignments"("department_id", "curriculum_version_id");

CREATE INDEX "student_curriculum_assignment_dept_assigner_idx"
ON "student_curriculum_assignments"("department_id", "assigned_by_user_id");

ALTER TABLE "student_curriculum_assignments"
ADD CONSTRAINT "student_curriculum_assignments_department_id_fkey"
FOREIGN KEY ("department_id") REFERENCES "departments"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_curriculum_assignments"
ADD CONSTRAINT "student_curriculum_assignments_student_user_id_fkey"
FOREIGN KEY ("student_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_curriculum_assignments"
ADD CONSTRAINT "student_curriculum_assignments_academic_program_id_fkey"
FOREIGN KEY ("academic_program_id") REFERENCES "academic_programs"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_curriculum_assignments"
ADD CONSTRAINT "student_curriculum_assignments_curriculum_version_id_fkey"
FOREIGN KEY ("curriculum_version_id") REFERENCES "curriculum_versions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_curriculum_assignments"
ADD CONSTRAINT "student_curriculum_assignments_assigned_by_user_id_fkey"
FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
