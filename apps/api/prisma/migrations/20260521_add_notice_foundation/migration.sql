-- Notice / Announcement foundation

CREATE TYPE "NoticeStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TYPE "NoticeAudienceType" AS ENUM ('DEPARTMENT', 'PROGRAM', 'ACADEMIC_TERM', 'COURSE_OFFERING');

CREATE TYPE "NoticePriority" AS ENUM ('NORMAL', 'IMPORTANT', 'URGENT');

CREATE TABLE "notices" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "academic_program_id" TEXT,
  "academic_term_id" TEXT,
  "course_offering_id" TEXT,
  "created_by_user_id" TEXT NOT NULL,
  "updated_by_user_id" TEXT,
  "published_by_user_id" TEXT,
  "notification_event_id" TEXT,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "audience_type" "NoticeAudienceType" NOT NULL DEFAULT 'DEPARTMENT',
  "priority" "NoticePriority" NOT NULL DEFAULT 'NORMAL',
  "status" "NoticeStatus" NOT NULL DEFAULT 'DRAFT',
  "publish_notification" BOOLEAN NOT NULL DEFAULT false,
  "published_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notices_department_id_status_created_at_idx" ON "notices"("department_id", "status", "created_at");
CREATE INDEX "notices_department_id_audience_type_status_idx" ON "notices"("department_id", "audience_type", "status");
CREATE INDEX "notices_academic_program_id_idx" ON "notices"("academic_program_id");
CREATE INDEX "notices_academic_term_id_idx" ON "notices"("academic_term_id");
CREATE INDEX "notices_course_offering_id_idx" ON "notices"("course_offering_id");
CREATE INDEX "notices_created_by_user_id_idx" ON "notices"("created_by_user_id");
CREATE INDEX "notices_notification_event_id_idx" ON "notices"("notification_event_id");

ALTER TABLE "notices"
  ADD CONSTRAINT "notices_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notices"
  ADD CONSTRAINT "notices_academic_program_id_fkey"
  FOREIGN KEY ("academic_program_id") REFERENCES "academic_programs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notices"
  ADD CONSTRAINT "notices_academic_term_id_fkey"
  FOREIGN KEY ("academic_term_id") REFERENCES "academic_terms"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notices"
  ADD CONSTRAINT "notices_course_offering_id_fkey"
  FOREIGN KEY ("course_offering_id") REFERENCES "course_offerings"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notices"
  ADD CONSTRAINT "notices_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notices"
  ADD CONSTRAINT "notices_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notices"
  ADD CONSTRAINT "notices_published_by_user_id_fkey"
  FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notices"
  ADD CONSTRAINT "notices_notification_event_id_fkey"
  FOREIGN KEY ("notification_event_id") REFERENCES "notification_events"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
