BEGIN;

CREATE UNIQUE INDEX "academic_program_id_department_uq"
ON "academic_programs"("id", "department_id");

CREATE TABLE "academic_sessions" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "name" TEXT NOT NULL,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academic_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "academic_session_id_department_uq"
ON "academic_sessions"("id", "department_id");

CREATE UNIQUE INDEX "academic_session_department_code_uq"
ON "academic_sessions"("department_id", "code");

CREATE INDEX "academic_session_department_idx"
ON "academic_sessions"("department_id");

CREATE TABLE "student_batches" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "academic_program_id" TEXT NOT NULL,
  "academic_session_id" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "name" TEXT NOT NULL,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "student_batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "student_batch_id_department_uq"
ON "student_batches"("id", "department_id");

CREATE UNIQUE INDEX "student_batch_department_program_session_code_uq"
ON "student_batches"("department_id", "academic_program_id", "academic_session_id", "code");

CREATE INDEX "student_batch_department_program_session_idx"
ON "student_batches"("department_id", "academic_program_id", "academic_session_id");

ALTER TABLE "academic_sessions"
ADD CONSTRAINT "academic_session_department_fkey"
FOREIGN KEY ("department_id") REFERENCES "departments"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "student_batches"
ADD CONSTRAINT "student_batch_department_fkey"
FOREIGN KEY ("department_id") REFERENCES "departments"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "student_batches"
ADD CONSTRAINT "student_batch_program_identity_fkey"
FOREIGN KEY ("academic_program_id", "department_id")
REFERENCES "academic_programs"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "student_batches"
ADD CONSTRAINT "student_batch_session_identity_fkey"
FOREIGN KEY ("academic_session_id", "department_id")
REFERENCES "academic_sessions"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;
