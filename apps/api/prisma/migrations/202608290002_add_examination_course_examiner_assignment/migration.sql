BEGIN;

CREATE TYPE "ExaminationCourseExaminerSeat" AS ENUM (
  'FIRST_EXAMINER',
  'SECOND_EXAMINER'
);

CREATE TYPE "ExaminationCourseExaminerAssignmentStatus" AS ENUM (
  'ACTIVE',
  'INACTIVE',
  'ARCHIVED'
);

CREATE TABLE "examination_course_examiner_assignments" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "examination_id" TEXT NOT NULL,
  "examination_course_id" TEXT NOT NULL,
  "assigned_user_id" TEXT NOT NULL,
  "assigned_by_user_id" TEXT NOT NULL,
  "seat" "ExaminationCourseExaminerSeat" NOT NULL,
  "status" "ExaminationCourseExaminerAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3),
  "unassigned_at" TIMESTAMP(3),
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "examination_course_examiner_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exam_course_examiner_assignment_scope_identity_uq"
ON "examination_course_examiner_assignments"(
  "id",
  "department_id",
  "examination_id",
  "examination_course_id"
);

CREATE INDEX "exam_course_examiner_assignment_scope_status_idx"
ON "examination_course_examiner_assignments"(
  "department_id",
  "examination_course_id",
  "examination_id",
  "status"
);

CREATE INDEX "exam_course_examiner_assignment_user_status_idx"
ON "examination_course_examiner_assignments"(
  "department_id",
  "assigned_user_id",
  "status"
);

CREATE INDEX "exam_course_examiner_assignment_assigner_idx"
ON "examination_course_examiner_assignments"(
  "department_id",
  "assigned_by_user_id"
);

CREATE UNIQUE INDEX "exam_course_examiner_assignment_active_seat_uq"
ON "examination_course_examiner_assignments"(
  "department_id",
  "examination_id",
  "examination_course_id",
  "seat"
)
WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "exam_course_examiner_assignment_active_user_uq"
ON "examination_course_examiner_assignments"(
  "department_id",
  "examination_id",
  "examination_course_id",
  "assigned_user_id"
)
WHERE "status" = 'ACTIVE';

ALTER TABLE "examination_course_examiner_assignments"
ADD CONSTRAINT "exam_course_examiner_assignment_expiry_order_ck"
CHECK ("expires_at" IS NULL OR "expires_at" > "assigned_at");

ALTER TABLE "examination_course_examiner_assignments"
ADD CONSTRAINT "exam_course_examiner_assignment_unassigned_order_ck"
CHECK ("unassigned_at" IS NULL OR "unassigned_at" >= "assigned_at");

ALTER TABLE "examination_course_examiner_assignments"
ADD CONSTRAINT "exam_course_examiner_assignment_archived_order_ck"
CHECK ("archived_at" IS NULL OR "archived_at" >= "assigned_at");

ALTER TABLE "examination_course_examiner_assignments"
ADD CONSTRAINT "exam_course_examiner_assignment_lifecycle_ck"
CHECK (
  (
    "status" = 'ACTIVE'
    AND "unassigned_at" IS NULL
    AND "archived_at" IS NULL
  )
  OR (
    "status" = 'INACTIVE'
    AND "unassigned_at" IS NOT NULL
    AND "archived_at" IS NULL
  )
  OR (
    "status" = 'ARCHIVED'
    AND "archived_at" IS NOT NULL
  )
);

ALTER TABLE "examination_course_examiner_assignments"
ADD CONSTRAINT "exam_course_examiner_assignment_department_fkey"
FOREIGN KEY ("department_id")
REFERENCES "departments"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_course_examiner_assignments"
ADD CONSTRAINT "exam_course_examiner_assignment_examination_fkey"
FOREIGN KEY ("examination_id", "department_id")
REFERENCES "examinations"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_course_examiner_assignments"
ADD CONSTRAINT "exam_course_examiner_assignment_course_fkey"
FOREIGN KEY (
  "examination_course_id",
  "department_id",
  "examination_id"
)
REFERENCES "examination_courses"(
  "id",
  "department_id",
  "examination_id"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_course_examiner_assignments"
ADD CONSTRAINT "exam_course_examiner_assignment_user_fkey"
FOREIGN KEY ("assigned_user_id", "department_id")
REFERENCES "users"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_course_examiner_assignments"
ADD CONSTRAINT "exam_course_examiner_assignment_assigner_fkey"
FOREIGN KEY ("assigned_by_user_id", "department_id")
REFERENCES "users"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMENT ON TABLE "examination_course_examiner_assignments" IS
'First/Second Examiner authority is independent, department-scoped, time-bounded, and derived only from a current explicit assignment. Course Teacher status alone grants no Examiner authority.';

COMMIT;
