BEGIN;

CREATE TYPE "BatchCoordinatorAssignmentStatus" AS ENUM (
  'ACTIVE',
  'INACTIVE',
  'ARCHIVED'
);

CREATE UNIQUE INDEX "user_id_department_uq"
ON "users"("id", "department_id");

CREATE UNIQUE INDEX "academic_term_id_department_uq"
ON "academic_terms"("id", "department_id");

CREATE TABLE "batch_coordinator_assignments" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "student_batch_id" TEXT NOT NULL,
  "academic_term_id" TEXT NOT NULL,
  "coordinator_user_id" TEXT NOT NULL,
  "assigned_by_user_id" TEXT NOT NULL,
  "status" "BatchCoordinatorAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3),
  "unassigned_at" TIMESTAMP(3),
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "batch_coordinator_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "batch_coordinator_assignment_id_department_uq"
ON "batch_coordinator_assignments"("id", "department_id");

CREATE UNIQUE INDEX "batch_coord_assign_scope_user_uq"
ON "batch_coordinator_assignments"(
  "department_id",
  "student_batch_id",
  "academic_term_id",
  "coordinator_user_id"
);

CREATE INDEX "batch_coord_assign_scope_status_idx"
ON "batch_coordinator_assignments"(
  "department_id",
  "student_batch_id",
  "academic_term_id",
  "status"
);

CREATE INDEX "batch_coord_assign_user_status_idx"
ON "batch_coordinator_assignments"(
  "department_id",
  "coordinator_user_id",
  "status"
);

CREATE INDEX "batch_coord_assign_assigner_idx"
ON "batch_coordinator_assignments"("department_id", "assigned_by_user_id");

ALTER TABLE "batch_coordinator_assignments"
ADD CONSTRAINT "batch_coord_assign_expiry_after_assignment_ck"
CHECK ("expires_at" IS NULL OR "expires_at" > "assigned_at");

ALTER TABLE "batch_coordinator_assignments"
ADD CONSTRAINT "batch_coord_assign_unassigned_after_assignment_ck"
CHECK ("unassigned_at" IS NULL OR "unassigned_at" >= "assigned_at");

ALTER TABLE "batch_coordinator_assignments"
ADD CONSTRAINT "batch_coordinator_assignment_department_fkey"
FOREIGN KEY ("department_id")
REFERENCES "departments"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "batch_coordinator_assignments"
ADD CONSTRAINT "batch_coordinator_assignment_batch_identity_fkey"
FOREIGN KEY ("student_batch_id", "department_id")
REFERENCES "student_batches"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "batch_coordinator_assignments"
ADD CONSTRAINT "batch_coordinator_assignment_term_identity_fkey"
FOREIGN KEY ("academic_term_id", "department_id")
REFERENCES "academic_terms"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "batch_coordinator_assignments"
ADD CONSTRAINT "batch_coordinator_assignment_user_identity_fkey"
FOREIGN KEY ("coordinator_user_id", "department_id")
REFERENCES "users"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "batch_coordinator_assignments"
ADD CONSTRAINT "batch_coordinator_assignment_assigner_identity_fkey"
FOREIGN KEY ("assigned_by_user_id", "department_id")
REFERENCES "users"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;
