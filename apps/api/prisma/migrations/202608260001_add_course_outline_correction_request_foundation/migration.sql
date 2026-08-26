-- CreateTable
CREATE TABLE "course_outline_correction_requests" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "course_offering_id" TEXT NOT NULL,
    "course_outline_version_id" TEXT NOT NULL,
    "batch_coordinator_assignment_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "returned_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_outline_correction_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "course_outline_correction_req_reason_length_check" CHECK (length(regexp_replace(reason, '^[[:space:]]+|[[:space:]]+$', '', 'g')) BETWEEN 1 AND 1000)
);

-- CreateIndex
CREATE INDEX "course_outline_correction_request_dept_outline_idx" ON "course_outline_correction_requests"("department_id", "course_outline_version_id");

-- CreateIndex
CREATE INDEX "course_outline_correction_request_dept_offering_idx" ON "course_outline_correction_requests"("department_id", "course_offering_id");

-- CreateIndex
CREATE INDEX "course_outline_correction_request_dept_assignment_idx" ON "course_outline_correction_requests"("department_id", "batch_coordinator_assignment_id");

-- AddForeignKey
ALTER TABLE "course_outline_correction_requests" ADD CONSTRAINT "course_outline_correction_request_department_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "course_outline_correction_requests" ADD CONSTRAINT "course_outline_correction_request_outline_identity_fkey" FOREIGN KEY ("course_outline_version_id", "department_id", "course_offering_id") REFERENCES "course_outline_versions"("id", "department_id", "course_offering_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "course_outline_correction_requests" ADD CONSTRAINT "course_outline_correction_request_coordinator_identity_fkey" FOREIGN KEY ("batch_coordinator_assignment_id", "department_id") REFERENCES "batch_coordinator_assignments"("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "course_outline_correction_requests" ADD CONSTRAINT "course_outline_correction_request_actor_identity_fkey" FOREIGN KEY ("actor_user_id", "department_id") REFERENCES "users"("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
