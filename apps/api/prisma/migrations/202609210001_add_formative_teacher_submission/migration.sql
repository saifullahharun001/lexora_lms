-- Reconstructed from the reviewed Teacher-submission schema. Do NOT deploy the
-- ignored 202609040001 prototype migration alongside this migration.
BEGIN;

CREATE TYPE "FormativeActivityState" AS ENUM ('DRAFT', 'MARKING');
CREATE TYPE "FormativeIntegrityState" AS ENUM ('CLEAR', 'PENDING_REVIEW', 'BLOCKED');
CREATE TYPE "FormativeTeacherSubmissionState" AS ENUM ('MARKS_SUBMITTED');

CREATE UNIQUE INDEX "formative_offering_scope_uq" ON "course_offerings"("id", "department_id");
CREATE UNIQUE INDEX "formative_assignment_scope_uq" ON "teacher_course_assignments"("id", "department_id", "course_offering_id", "teacher_user_id");
CREATE UNIQUE INDEX "formative_enrollment_scope_uq" ON "enrollments"("id", "department_id", "course_offering_id");

CREATE TABLE "formative_activities" (
  "id" TEXT PRIMARY KEY,
  "department_id" TEXT NOT NULL,
  "course_offering_id" TEXT NOT NULL,
  "title" VARCHAR(255) NOT NULL CHECK (length(btrim(title)) > 0),
  "method" VARCHAR(32) NOT NULL CHECK (method IN ('CLASS_TEST','TUTORIAL','QUIZ','ASSIGNMENT','PRESENTATION','CASE_STUDY','PROBLEM_QUESTION','LEGAL_WRITING','ORAL_EXERCISE','REPORT','SPOT_TEST','SIMULATED_EXERCISE','GROUP_WORK','MOOT_COURT','OTHER')),
  "raw_maximum" DECIMAL(6,2) NOT NULL CHECK (raw_maximum > 0),
  "assigned_weight" DECIMAL(6,2) NOT NULL CHECK (assigned_weight > 0 AND assigned_weight <= 30),
  "status" "FormativeActivityState" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "formative_activities_course_offering_id_department_id_fkey" FOREIGN KEY (course_offering_id, department_id)
    REFERENCES course_offerings(id, department_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "formative_activity_scope_uq" ON formative_activities(id, department_id, course_offering_id);
CREATE INDEX "formative_activity_offering_idx" ON formative_activities(department_id, course_offering_id);

CREATE TABLE "formative_mark_evidence" (
  "id" TEXT PRIMARY KEY,
  "department_id" TEXT NOT NULL,
  "course_offering_id" TEXT NOT NULL,
  "activity_id" TEXT NOT NULL,
  "enrollment_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL CHECK (revision > 0),
  "previous_id" TEXT,
  "raw_maximum" DECIMAL(6,2) NOT NULL CHECK (raw_maximum > 0),
  "assigned_weight" DECIMAL(6,2) NOT NULL CHECK (assigned_weight > 0 AND assigned_weight <= 30),
  "raw_mark" DECIMAL(6,2),
  "weighted_mark" DECIMAL(6,2),
  "feedback" TEXT,
  "feedback_completed" BOOLEAN NOT NULL DEFAULT false,
  "integrity_status" "FormativeIntegrityState" NOT NULL DEFAULT 'PENDING_REVIEW',
  "reason" VARCHAR(2000),
  "actor_user_id" TEXT NOT NULL,
  "teacher_assignment_id" TEXT NOT NULL,
  "assignment_assigned_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT formative_mark_values_check CHECK (
    (raw_mark IS NULL AND weighted_mark IS NULL) OR
    (raw_mark IS NOT NULL AND weighted_mark IS NOT NULL AND raw_mark >= 0 AND raw_mark <= raw_maximum
      AND weighted_mark = round(raw_mark / raw_maximum * assigned_weight, 2))),
  CONSTRAINT formative_feedback_check CHECK (NOT feedback_completed OR (feedback IS NOT NULL AND length(btrim(feedback)) > 0)),
  CONSTRAINT formative_revision_link_check CHECK ((revision = 1 AND previous_id IS NULL) OR (revision > 1 AND previous_id IS NOT NULL)),
  CONSTRAINT "formative_mark_evidence_activity_scope_fkey" FOREIGN KEY(activity_id, department_id, course_offering_id)
    REFERENCES formative_activities(id, department_id, course_offering_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "formative_mark_evidence_enrollment_scope_fkey" FOREIGN KEY(enrollment_id, department_id, course_offering_id)
    REFERENCES enrollments(id, department_id, course_offering_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "formative_mark_evidence_assignment_scope_fkey" FOREIGN KEY(teacher_assignment_id, department_id, course_offering_id, actor_user_id)
    REFERENCES teacher_course_assignments(id, department_id, course_offering_id, teacher_user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "formative_mark_evidence_previous_id_key" ON formative_mark_evidence(previous_id);
CREATE UNIQUE INDEX "formative_mark_scope_uq" ON formative_mark_evidence(id, department_id, course_offering_id, enrollment_id, activity_id);
CREATE UNIQUE INDEX "formative_mark_revision_uq" ON formative_mark_evidence(department_id, activity_id, enrollment_id, revision);
CREATE INDEX "formative_mark_enrollment_idx" ON formative_mark_evidence(department_id, course_offering_id, enrollment_id);
ALTER TABLE formative_mark_evidence ADD CONSTRAINT "formative_mark_previous_scope_fkey"
  FOREIGN KEY(previous_id, department_id, course_offering_id, enrollment_id, activity_id)
  REFERENCES formative_mark_evidence(id, department_id, course_offering_id, enrollment_id, activity_id) ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "formative_teacher_submissions" (
  "id" TEXT PRIMARY KEY,
  "department_id" TEXT NOT NULL,
  "course_offering_id" TEXT NOT NULL,
  "enrollment_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK (version = 1),
  "status" "FormativeTeacherSubmissionState" NOT NULL DEFAULT 'MARKS_SUBMITTED',
  "total_weighted_mark" DECIMAL(6,2) NOT NULL CHECK (total_weighted_mark BETWEEN 0 AND 30),
  "total_weight" DECIMAL(6,2) NOT NULL CHECK (total_weight = 30),
  "rule_version_code" VARCHAR(64) NOT NULL CHECK (rule_version_code = 'FORMATIVE_ACTIVITIES_30_HALF_UP_2DP_V1'),
  "source_snapshot_json" JSONB NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "teacher_assignment_id" TEXT NOT NULL,
  "assignment_assigned_at" TIMESTAMP(3) NOT NULL,
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "formative_submission_enrollment_scope_fkey" FOREIGN KEY(enrollment_id, department_id, course_offering_id)
    REFERENCES enrollments(id, department_id, course_offering_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "formative_submission_assignment_scope_fkey" FOREIGN KEY(teacher_assignment_id, department_id, course_offering_id, actor_user_id)
    REFERENCES teacher_course_assignments(id, department_id, course_offering_id, teacher_user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "formative_submission_enrollment_uq" ON formative_teacher_submissions(department_id, enrollment_id);
CREATE UNIQUE INDEX "formative_submission_scope_uq" ON formative_teacher_submissions(id, department_id, course_offering_id, enrollment_id);
CREATE INDEX "formative_submission_offering_idx" ON formative_teacher_submissions(department_id, course_offering_id);

CREATE TABLE "formative_submission_items" (
  "id" TEXT PRIMARY KEY,
  "department_id" TEXT NOT NULL,
  "course_offering_id" TEXT NOT NULL,
  "enrollment_id" TEXT NOT NULL,
  "activity_id" TEXT NOT NULL,
  "submission_id" TEXT NOT NULL,
  "mark_evidence_id" TEXT NOT NULL,
  CONSTRAINT "formative_item_submission_scope_fkey" FOREIGN KEY(submission_id, department_id, course_offering_id, enrollment_id)
    REFERENCES formative_teacher_submissions(id, department_id, course_offering_id, enrollment_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "formative_item_mark_scope_fkey" FOREIGN KEY(mark_evidence_id, department_id, course_offering_id, enrollment_id, activity_id)
    REFERENCES formative_mark_evidence(id, department_id, course_offering_id, enrollment_id, activity_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "formative_submission_activity_uq" ON formative_submission_items(submission_id, activity_id);
CREATE INDEX "formative_submission_mark_idx" ON formative_submission_items(mark_evidence_id);

CREATE FUNCTION formative_evidence_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Formative evidence is immutable; correction authority is not implemented' USING ERRCODE = '23514'; END;
$$;
CREATE TRIGGER formative_mark_immutable BEFORE UPDATE OR DELETE ON formative_mark_evidence FOR EACH ROW EXECUTE FUNCTION formative_evidence_immutable();
CREATE TRIGGER formative_submission_immutable BEFORE UPDATE OR DELETE ON formative_teacher_submissions FOR EACH ROW EXECUTE FUNCTION formative_evidence_immutable();
CREATE TRIGGER formative_item_immutable BEFORE UPDATE OR DELETE ON formative_submission_items FOR EACH ROW EXECUTE FUNCTION formative_evidence_immutable();

CREATE FUNCTION formative_activity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Formative activities cannot be deleted' USING ERRCODE = '23514';
  END IF;
  PERFORM id FROM course_offerings WHERE id = NEW.course_offering_id AND department_id = NEW.department_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM formative_teacher_submissions WHERE department_id = NEW.department_id AND course_offering_id = NEW.course_offering_id) THEN
    RAISE EXCEPTION 'Submitted activity configuration is frozen' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'DRAFT' OR NEW.id <> OLD.id OR NEW.department_id <> OLD.department_id OR NEW.course_offering_id <> OLD.course_offering_id
       OR NEW.version <> OLD.version + 1 THEN
      RAISE EXCEPTION 'Only draft configuration can be revised' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER formative_activity_guard BEFORE INSERT OR UPDATE OR DELETE ON formative_activities FOR EACH ROW EXECUTE FUNCTION formative_activity_guard();

CREATE FUNCTION formative_mark_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a formative_activities; previous formative_mark_evidence;
BEGIN
  PERFORM id FROM course_offerings WHERE id = NEW.course_offering_id AND department_id = NEW.department_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM formative_teacher_submissions WHERE department_id = NEW.department_id AND enrollment_id = NEW.enrollment_id) THEN
    RAISE EXCEPTION 'Teacher submitted marks cannot be revised' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO a FROM formative_activities WHERE id = NEW.activity_id;
  IF a.status <> 'MARKING' OR a.raw_maximum <> NEW.raw_maximum OR a.assigned_weight <> NEW.assigned_weight THEN
    RAISE EXCEPTION 'Mark activity snapshot mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW.previous_id IS NOT NULL THEN
    SELECT * INTO previous FROM formative_mark_evidence WHERE id = NEW.previous_id;
    IF previous.integrity_status <> 'CLEAR' AND NEW.integrity_status = 'CLEAR' THEN
      RAISE EXCEPTION 'Integrity resolution authority is not implemented' USING ERRCODE = '23514';
    END IF;
    IF NEW.revision <> previous.revision + 1 OR
      (previous.raw_mark IS NOT NULL AND previous.raw_mark IS DISTINCT FROM NEW.raw_mark AND (NEW.reason IS NULL OR length(btrim(NEW.reason)) = 0)) THEN
      RAISE EXCEPTION 'Invalid mark adjustment history' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER formative_mark_guard BEFORE INSERT ON formative_mark_evidence FOR EACH ROW EXECUTE FUNCTION formative_mark_guard();

-- Commit-time checks bind the whole counted activity set, not just existing marks.
CREATE FUNCTION formative_submission_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE package formative_teacher_submissions; activity_count INTEGER; item_count INTEGER; weight NUMERIC; total NUMERIC;
BEGIN
  IF TG_TABLE_NAME = 'formative_submission_items' THEN
    SELECT * INTO package FROM formative_teacher_submissions WHERE id = NEW.submission_id;
  ELSE
    package := NEW;
  END IF;
  PERFORM id FROM course_offerings WHERE id = package.course_offering_id AND department_id = package.department_id FOR UPDATE;
  SELECT count(*) INTO activity_count FROM formative_activities WHERE department_id = package.department_id AND course_offering_id = package.course_offering_id;
  SELECT count(*), sum(m.assigned_weight), sum(m.weighted_mark) INTO item_count, weight, total
    FROM formative_submission_items i JOIN formative_mark_evidence m ON m.id = i.mark_evidence_id
    JOIN formative_activities a ON a.id = i.activity_id
    WHERE i.submission_id = package.id AND a.status = 'MARKING' AND m.raw_mark IS NOT NULL
      AND m.feedback_completed AND m.integrity_status = 'CLEAR'
      AND NOT EXISTS (SELECT 1 FROM formative_mark_evidence later WHERE later.previous_id = m.id);
  IF activity_count = 0 OR item_count <> activity_count OR weight IS DISTINCT FROM 30::NUMERIC OR total IS DISTINCT FROM package.total_weighted_mark THEN
    RAISE EXCEPTION 'Incomplete Teacher submission sources' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER formative_submission_complete AFTER INSERT ON formative_teacher_submissions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION formative_submission_complete();
CREATE CONSTRAINT TRIGGER formative_item_complete AFTER INSERT ON formative_submission_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION formative_submission_complete();

COMMIT;
