BEGIN;

ALTER TABLE "course_offerings"
ADD COLUMN "student_batch_id" TEXT;

CREATE INDEX "course_offering_department_term_student_batch_idx"
ON "course_offerings"("department_id", "academic_term_id", "student_batch_id");

ALTER TABLE "course_offerings"
ADD CONSTRAINT "course_offering_batch_requires_curriculum"
CHECK (
  "student_batch_id" IS NULL
  OR "curriculum_course_id" IS NOT NULL
);

ALTER TABLE "course_offerings"
ADD CONSTRAINT "course_offering_student_batch_identity_fkey"
FOREIGN KEY ("student_batch_id", "department_id")
REFERENCES "student_batches"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE UNIQUE INDEX "course_offering_bound_curriculum_identity_tmp_uq"
ON "course_offerings"("department_id", "academic_term_id", "curriculum_course_id", "section_code")
WHERE "curriculum_course_id" IS NOT NULL
  AND "student_batch_id" IS NULL;

CREATE UNIQUE INDEX "course_offering_bound_batched_curriculum_identity_uq"
ON "course_offerings"("department_id", "academic_term_id", "student_batch_id", "curriculum_course_id", "section_code")
WHERE "curriculum_course_id" IS NOT NULL
  AND "student_batch_id" IS NOT NULL;

DROP INDEX "course_offering_bound_curriculum_identity_uq";

ALTER INDEX "course_offering_bound_curriculum_identity_tmp_uq"
RENAME TO "course_offering_bound_curriculum_identity_uq";

COMMIT;
