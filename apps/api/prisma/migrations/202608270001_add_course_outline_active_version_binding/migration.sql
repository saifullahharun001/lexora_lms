BEGIN;

ALTER TABLE "course_offerings"
ADD COLUMN "active_course_outline_version_id" TEXT;

CREATE INDEX "course_offering_dept_active_outline_idx"
ON "course_offerings"("department_id", "active_course_outline_version_id");

CREATE UNIQUE INDEX "course_offering_active_outline_relation_uq"
ON "course_offerings"("active_course_outline_version_id", "department_id", "id");

ALTER TABLE "course_offerings"
ADD CONSTRAINT "course_offering_active_outline_identity_fkey"
FOREIGN KEY ("active_course_outline_version_id", "department_id", "id")
REFERENCES "course_outline_versions"("id", "department_id", "course_offering_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Prisma 6.x cannot represent PostgreSQL partial indexes. This reviewed index
-- enforces one ACTIVE CourseOutlineVersion per department-scoped CourseOffering.
CREATE UNIQUE INDEX "course_outline_version_one_active_per_offering_uq"
ON "course_outline_versions"("department_id", "course_offering_id")
WHERE "status" = 'ACTIVE'::"CourseOutlineStatus";

COMMIT;
