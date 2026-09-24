-- Additive Attendance /5 evidence. DDL generated from the Prisma datamodel diff; custom integrity guards follow.
-- No database was connected or migrated to generate this file.
BEGIN;

-- Tokens are assigned only by database triggers; callers cannot choose or reuse them.
CREATE SEQUENCE attendance_evidence_revision_seq AS INTEGER;
ALTER TABLE class_sessions ADD COLUMN attendance_evidence_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attendance_records ADD COLUMN attendance_evidence_revision INTEGER NOT NULL DEFAULT 0;
UPDATE class_sessions SET attendance_evidence_revision = nextval('attendance_evidence_revision_seq');
UPDATE attendance_records SET attendance_evidence_revision = nextval('attendance_evidence_revision_seq');

-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "conflict_evidence_json" JSONB,
ADD COLUMN     "resolution_status" VARCHAR(32) NOT NULL DEFAULT 'RESOLVED';

-- CreateTable
CREATE TABLE "formative_attendance_versions" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "course_offering_id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "student_user_id" TEXT NOT NULL,
    "student_batch_id" TEXT NOT NULL,
    "academic_term_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "previous_id" TEXT,
    "reason" VARCHAR(2000),
    "rule_version_code" TEXT NOT NULL,
    "calculation_basis" TEXT NOT NULL,
    "present_count" INTEGER NOT NULL,
    "conducted_count" INTEGER NOT NULL,
    "percentage" DECIMAL(12,6),
    "mark" DECIMAL(2,1),
    "status" VARCHAR(16) NOT NULL,
    "source_fingerprint" VARCHAR(64) NOT NULL,
    "configuration_json" JSONB NOT NULL,
    "diagnostics_json" JSONB NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "coordinator_assignment_id" TEXT NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formative_attendance_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formative_attendance_source_items" (
    "session_evidence_revision" INTEGER NOT NULL DEFAULT 0,
    "record_evidence_revision" INTEGER,
    "id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "course_offering_id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "class_session_id" TEXT NOT NULL,
    "attendance_record_id" TEXT,
    "correction_id" TEXT,
    "status" VARCHAR(16),
    "basis_fingerprint" VARCHAR(64) NOT NULL,
    "evidence_json" JSONB NOT NULL,

    CONSTRAINT "formative_attendance_source_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formative_attendance_transitions" (
    "id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "course_offering_id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "student_batch_id" TEXT NOT NULL,
    "academic_term_id" TEXT NOT NULL,
    "state" VARCHAR(16) NOT NULL,
    "reason" VARCHAR(2000),
    "actor_user_id" TEXT NOT NULL,
    "coordinator_assignment_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formative_attendance_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formative_attendance_corrections" (
    "session_evidence_revision" INTEGER NOT NULL DEFAULT 0,
    "record_evidence_revision" INTEGER,
    "id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "course_offering_id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "student_user_id" TEXT NOT NULL,
    "student_batch_id" TEXT NOT NULL,
    "academic_term_id" TEXT NOT NULL,
    "class_session_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "basis_fingerprint" VARCHAR(64) NOT NULL,
    "original_evidence_json" JSONB NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "coordinator_assignment_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formative_attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "formative_attendance_versions_previous_id_key" ON "formative_attendance_versions"("previous_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_revision_uq" ON "formative_attendance_versions"("department_id", "enrollment_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_version_scope_uq" ON "formative_attendance_versions"("id", "department_id", "course_offering_id", "enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "formative_attendance_source_items_version_id_class_session__key" ON "formative_attendance_source_items"("version_id", "class_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "formative_attendance_transitions_version_id_state_key" ON "formative_attendance_transitions"("version_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "formative_attendance_corrections_enrollment_id_class_sessio_key" ON "formative_attendance_corrections"("enrollment_id", "class_session_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_coordinator_scope_uq" ON "batch_coordinator_assignments"("id", "department_id", "student_batch_id", "academic_term_id", "coordinator_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_offering_scope_uq" ON "course_offerings"("id", "department_id", "student_batch_id", "academic_term_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_session_scope_uq" ON "class_sessions"("id", "department_id", "course_offering_id");

-- AddForeignKey
ALTER TABLE "formative_attendance_versions" ADD CONSTRAINT "formative_attendance_versions_course_offering_id_departmen_fkey" FOREIGN KEY ("course_offering_id", "department_id", "student_batch_id", "academic_term_id") REFERENCES "course_offerings"("id", "department_id", "student_batch_id", "academic_term_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "formative_attendance_versions" ADD CONSTRAINT "formative_attendance_versions_enrollment_id_department_id__fkey" FOREIGN KEY ("enrollment_id", "department_id", "course_offering_id", "student_user_id") REFERENCES "enrollments"("id", "department_id", "course_offering_id", "student_user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "formative_attendance_versions" ADD CONSTRAINT "formative_attendance_versions_coordinator_assignment_id_de_fkey" FOREIGN KEY ("coordinator_assignment_id", "department_id", "student_batch_id", "academic_term_id", "actor_user_id") REFERENCES "batch_coordinator_assignments"("id", "department_id", "student_batch_id", "academic_term_id", "coordinator_user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "formative_attendance_versions" ADD CONSTRAINT "formative_attendance_versions_previous_id_fkey" FOREIGN KEY ("previous_id") REFERENCES "formative_attendance_versions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "formative_attendance_source_items" ADD CONSTRAINT "formative_attendance_source_items_version_id_department_id_fkey" FOREIGN KEY ("version_id", "department_id", "course_offering_id", "enrollment_id") REFERENCES "formative_attendance_versions"("id", "department_id", "course_offering_id", "enrollment_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "formative_attendance_source_items" ADD CONSTRAINT "formative_attendance_source_items_class_session_id_departm_fkey" FOREIGN KEY ("class_session_id", "department_id", "course_offering_id") REFERENCES "class_sessions"("id", "department_id", "course_offering_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "formative_attendance_source_items" ADD CONSTRAINT "formative_attendance_source_items_attendance_record_id_fkey" FOREIGN KEY ("attendance_record_id") REFERENCES "attendance_records"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "formative_attendance_source_items" ADD CONSTRAINT "formative_attendance_source_items_correction_id_fkey" FOREIGN KEY ("correction_id") REFERENCES "formative_attendance_corrections"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "formative_attendance_transitions" ADD CONSTRAINT "formative_attendance_transitions_version_id_department_id__fkey" FOREIGN KEY ("version_id", "department_id", "course_offering_id", "enrollment_id") REFERENCES "formative_attendance_versions"("id", "department_id", "course_offering_id", "enrollment_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "formative_attendance_transitions" ADD CONSTRAINT "formative_attendance_transitions_coordinator_assignment_id_fkey" FOREIGN KEY ("coordinator_assignment_id", "department_id", "student_batch_id", "academic_term_id", "actor_user_id") REFERENCES "batch_coordinator_assignments"("id", "department_id", "student_batch_id", "academic_term_id", "coordinator_user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "formative_attendance_corrections" ADD CONSTRAINT "formative_attendance_corrections_version_id_department_id__fkey" FOREIGN KEY ("version_id", "department_id", "course_offering_id", "enrollment_id") REFERENCES "formative_attendance_versions"("id", "department_id", "course_offering_id", "enrollment_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "formative_attendance_corrections" ADD CONSTRAINT "formative_attendance_corrections_enrollment_id_department__fkey" FOREIGN KEY ("enrollment_id", "department_id", "course_offering_id", "student_user_id") REFERENCES "enrollments"("id", "department_id", "course_offering_id", "student_user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "formative_attendance_corrections" ADD CONSTRAINT "formative_attendance_corrections_class_session_id_departme_fkey" FOREIGN KEY ("class_session_id", "department_id", "course_offering_id") REFERENCES "class_sessions"("id", "department_id", "course_offering_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "formative_attendance_corrections" ADD CONSTRAINT "formative_attendance_corrections_coordinator_assignment_id_fkey" FOREIGN KEY ("coordinator_assignment_id", "department_id", "student_batch_id", "academic_term_id", "actor_user_id") REFERENCES "batch_coordinator_assignments"("id", "department_id", "student_batch_id", "academic_term_id", "coordinator_user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE attendance_records ADD CONSTRAINT attendance_resolution_status_check CHECK (resolution_status IN ('RESOLVED','CONFLICT','PENDING_REVIEW'));

ALTER TABLE formative_attendance_versions ADD CONSTRAINT attendance_calculation_check CHECK (
  revision > 0 AND present_count >= 0 AND conducted_count >= present_count
  AND rule_version_code = 'FORMATIVE_ATTENDANCE_5_APPROVED_20260920_V1'
  AND ((revision = 1 AND previous_id IS NULL) OR (revision > 1 AND previous_id IS NOT NULL))
  AND ((status = 'BLOCKED' AND mark IS NULL AND percentage IS NULL AND jsonb_array_length(diagnostics_json) > 0)
    OR (status = 'READY' AND conducted_count > 0 AND jsonb_array_length(diagnostics_json) = 0
      AND percentage IS NOT NULL AND percentage = round(present_count::numeric * 100 / conducted_count, 6)
      AND mark IS NOT NULL AND mark = CASE
        WHEN present_count::bigint * 100 >= conducted_count::bigint * 90 THEN 5.0
        WHEN present_count::bigint * 100 >= conducted_count::bigint * 85 THEN 4.5
        WHEN present_count::bigint * 100 >= conducted_count::bigint * 80 THEN 4.0
        WHEN present_count::bigint * 100 >= conducted_count::bigint * 75 THEN 3.5
        WHEN present_count::bigint * 100 >= conducted_count::bigint * 70 THEN 3.0
        WHEN present_count::bigint * 100 >= conducted_count::bigint * 65 THEN 2.5
        WHEN present_count::bigint * 100 >= conducted_count::bigint * 60 THEN 2.0 ELSE 0 END))
);
ALTER TABLE formative_attendance_source_items ADD CHECK (status IS NULL OR status IN ('PRESENT','ABSENT'));
ALTER TABLE formative_attendance_corrections ADD CHECK (status IN ('PRESENT','ABSENT') AND length(btrim(reason)) > 0 AND revision > 0);
ALTER TABLE formative_attendance_transitions ADD CHECK (state IN ('VERIFIED','FINALISED','LOCKED','REOPENED') AND (state <> 'REOPENED' OR (reason IS NOT NULL AND length(btrim(reason)) > 0)));

CREATE FUNCTION attendance_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Attendance academic evidence is immutable' USING ERRCODE = '23514'; END;
$$;
CREATE TRIGGER attendance_version_immutable BEFORE UPDATE OR DELETE ON formative_attendance_versions FOR EACH ROW EXECUTE FUNCTION attendance_immutable();
CREATE TRIGGER attendance_source_immutable BEFORE UPDATE OR DELETE ON formative_attendance_source_items FOR EACH ROW EXECUTE FUNCTION attendance_immutable();
CREATE TRIGGER attendance_transition_immutable BEFORE UPDATE OR DELETE ON formative_attendance_transitions FOR EACH ROW EXECUTE FUNCTION attendance_immutable();
CREATE TRIGGER attendance_correction_immutable BEFORE UPDATE OR DELETE ON formative_attendance_corrections FOR EACH ROW EXECUTE FUNCTION attendance_immutable();

-- Offering mutex uses a row write so stale repeatable-read/serializable snapshots fail after waiting.
-- Current assignment is rechecked at every academic insert, also guarding direct ORM writes.
CREATE FUNCTION attendance_academic_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v formative_attendance_versions%ROWTYPE; prior formative_attendance_versions%ROWTYPE; expected TEXT; student_identity TEXT;
BEGIN
  UPDATE course_offerings SET id = id WHERE id = NEW.course_offering_id AND department_id = NEW.department_id
    AND student_batch_id = NEW.student_batch_id AND academic_term_id = NEW.academic_term_id
    AND student_batch_id IS NOT NULL AND archived_at IS NULL AND status::text NOT IN ('CANCELED','ARCHIVED');
  IF NOT FOUND THEN RAISE EXCEPTION 'Attendance academic offering scope is invalid or not current' USING ERRCODE = '23514'; END IF;
  IF TG_TABLE_NAME = 'formative_attendance_versions' THEN
    student_identity := NEW.student_user_id;
  ELSE
    SELECT * INTO v FROM formative_attendance_versions WHERE id = NEW.version_id
      AND department_id = NEW.department_id AND course_offering_id = NEW.course_offering_id AND enrollment_id = NEW.enrollment_id
      AND student_batch_id = NEW.student_batch_id AND academic_term_id = NEW.academic_term_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Attendance action must target the current exact version' USING ERRCODE = '23514'; END IF;
    student_identity := v.student_user_id;
  END IF;
  -- The offering row above is locked; hold the current enrollment through this transaction too.
  PERFORM e.id FROM enrollments e WHERE e.id = NEW.enrollment_id AND e.department_id = NEW.department_id
    AND e.course_offering_id = NEW.course_offering_id AND e.student_user_id = student_identity
    AND e.academic_term_id = NEW.academic_term_id AND e.status::text = 'APPROVED'
    AND e.archived_at IS NULL AND e.dropped_at IS NULL FOR SHARE OF e;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attendance academic enrollment scope is invalid or not current' USING ERRCODE = '23514'; END IF;
  PERFORM a.id FROM batch_coordinator_assignments a
    JOIN departments d ON d.id = a.department_id
    JOIN users u ON u.id = a.coordinator_user_id AND u.department_id = d.id
    JOIN student_batches b ON b.id = a.student_batch_id AND b.department_id = d.id
    JOIN academic_terms t ON t.id = a.academic_term_id AND t.department_id = d.id
    WHERE a.id = NEW.coordinator_assignment_id AND a.department_id = NEW.department_id
      AND a.student_batch_id = NEW.student_batch_id AND a.academic_term_id = NEW.academic_term_id
      AND a.coordinator_user_id = NEW.actor_user_id AND a.status = 'ACTIVE'
      AND a.assigned_at <= clock_timestamp() AND (a.expires_at IS NULL OR a.expires_at > clock_timestamp())
      AND a.unassigned_at IS NULL AND a.archived_at IS NULL
      AND d.status = 'ACTIVE' AND d.archived_at IS NULL AND d.deleted_at IS NULL
      AND u.status = 'ACTIVE' AND u.archived_at IS NULL AND u.deleted_at IS NULL
      AND b.archived_at IS NULL AND t.archived_at IS NULL FOR SHARE OF a, d, u, b, t;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exact current Attendance Coordinator authority required' USING ERRCODE = '23514'; END IF;
  SELECT * INTO prior FROM formative_attendance_versions WHERE department_id = NEW.department_id AND enrollment_id = NEW.enrollment_id ORDER BY revision DESC LIMIT 1;
  IF TG_TABLE_NAME = 'formative_attendance_versions' THEN
    IF (prior.id IS NULL AND (NEW.previous_id IS NOT NULL OR NEW.revision <> 1)) OR
       (prior.id IS NOT NULL AND (NEW.previous_id IS DISTINCT FROM prior.id OR NEW.revision <> prior.revision + 1
         OR NEW.course_offering_id <> prior.course_offering_id OR NEW.student_user_id <> prior.student_user_id)) THEN
      RAISE EXCEPTION 'Attendance revision must extend the current immutable version' USING ERRCODE = '23514';
    END IF;
    IF EXISTS(SELECT 1 FROM formative_attendance_transitions WHERE version_id = prior.id AND state = 'LOCKED') AND
       NOT EXISTS(SELECT 1 FROM formative_attendance_transitions WHERE version_id = prior.id AND state = 'REOPENED') THEN
      RAISE EXCEPTION 'Attendance must be explicitly reopened' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF v.id IS NULL OR v.id IS DISTINCT FROM prior.id OR v.student_batch_id <> NEW.student_batch_id OR v.academic_term_id <> NEW.academic_term_id THEN
      RAISE EXCEPTION 'Attendance action must target the current exact version' USING ERRCODE = '23514';
    END IF;
    IF TG_TABLE_NAME = 'formative_attendance_transitions' THEN
      IF NEW.state IN ('VERIFIED','FINALISED','LOCKED') THEN
        PERFORM attendance_validate_package(v.id);
      END IF;
      IF NEW.state IN ('FINALISED','LOCKED') AND EXISTS(SELECT 1 FROM class_sessions
          WHERE department_id = NEW.department_id AND course_offering_id = NEW.course_offering_id
            AND status::text IN ('SCHEDULED','ACTIVE') AND canceled_at IS NULL) THEN
        RAISE EXCEPTION 'ATTENDANCE_PERIOD_OPEN: complete or cancel open classes' USING ERRCODE = '23514';
      END IF;
      expected := CASE NEW.state WHEN 'VERIFIED' THEN 'READY' WHEN 'FINALISED' THEN 'VERIFIED' WHEN 'LOCKED' THEN 'FINALISED' WHEN 'REOPENED' THEN 'LOCKED' END;
      IF v.status <> 'READY' OR EXISTS(SELECT 1 FROM formative_attendance_transitions WHERE version_id = v.id AND state = 'REOPENED') OR
        (expected <> 'READY' AND NOT EXISTS(SELECT 1 FROM formative_attendance_transitions WHERE version_id = v.id AND state = expected)) OR
        (NEW.state <> 'REOPENED' AND EXISTS(SELECT 1 FROM formative_attendance_transitions WHERE version_id = v.id AND state = 'LOCKED')) THEN
        RAISE EXCEPTION 'Invalid Attendance lifecycle transition' USING ERRCODE = '23514';
      END IF;
    ELSE
      IF EXISTS(SELECT 1 FROM formative_attendance_transitions WHERE version_id = v.id AND state IN ('LOCKED','REOPENED')) THEN
        RAISE EXCEPTION 'Correction requires a fresh calculated or reopened version' USING ERRCODE = '23514';
      END IF;
      IF NEW.student_user_id <> v.student_user_id OR NEW.revision <> 1 + COALESCE((SELECT max(revision)
          FROM formative_attendance_corrections WHERE enrollment_id = NEW.enrollment_id AND class_session_id = NEW.class_session_id), 0) THEN
        RAISE EXCEPTION 'Correction must extend the exact current source lineage' USING ERRCODE = '23514';
      END IF;
      SELECT attendance_evidence_revision INTO NEW.session_evidence_revision FROM class_sessions
        WHERE id = NEW.class_session_id AND department_id = NEW.department_id AND course_offering_id = NEW.course_offering_id
          AND status::text IN ('COMPLETED','LOCKED','ARCHIVED') AND canceled_at IS NULL
          AND actual_start_at IS NOT NULL AND actual_end_at > actual_start_at;
      IF NOT FOUND THEN RAISE EXCEPTION 'Correction requires a conducted class' USING ERRCODE = '23514'; END IF;
      IF EXISTS(SELECT 1 FROM attendance_records WHERE class_session_id = NEW.class_session_id AND enrollment_id = NEW.enrollment_id
          AND (department_id <> NEW.department_id OR student_user_id <> NEW.student_user_id)) THEN
        RAISE EXCEPTION 'Correction source identity mismatch' USING ERRCODE = '23514';
      END IF;
      SELECT attendance_evidence_revision INTO NEW.record_evidence_revision FROM attendance_records
        WHERE class_session_id = NEW.class_session_id AND enrollment_id = NEW.enrollment_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER attendance_version_insert BEFORE INSERT ON formative_attendance_versions FOR EACH ROW EXECUTE FUNCTION attendance_academic_insert();
CREATE TRIGGER attendance_transition_insert BEFORE INSERT ON formative_attendance_transitions FOR EACH ROW EXECUTE FUNCTION attendance_academic_insert();
CREATE TRIGGER attendance_correction_insert BEFORE INSERT ON formative_attendance_corrections FOR EACH ROW EXECUTE FUNCTION attendance_academic_insert();

-- Snapshot tokens are derived from relational rows, never from caller JSON or fingerprints.
CREATE FUNCTION attendance_item_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE course_offerings SET id = id WHERE id = NEW.course_offering_id AND department_id = NEW.department_id;
  SELECT attendance_evidence_revision INTO NEW.session_evidence_revision FROM class_sessions WHERE id = NEW.class_session_id;
  SELECT attendance_evidence_revision INTO NEW.record_evidence_revision FROM attendance_records
    WHERE class_session_id = NEW.class_session_id AND enrollment_id = NEW.enrollment_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER attendance_item_snapshot BEFORE INSERT ON formative_attendance_source_items FOR EACH ROW EXECUTE FUNCTION attendance_item_snapshot();

-- Shared by package creation and every authoritative transition. No cryptographic extension required.
CREATE FUNCTION attendance_validate_package(target TEXT) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v formative_attendance_versions%ROWTYPE; i RECORD; r attendance_records%ROWTYPE;
  c formative_attendance_corrections%ROWTYPE; expected_status TEXT; expected_record TEXT;
  total INTEGER; present INTEGER; resolved INTEGER;
BEGIN
  SELECT * INTO v FROM formative_attendance_versions WHERE id = target;
  UPDATE course_offerings SET id = id WHERE id = v.course_offering_id AND department_id = v.department_id;
  IF EXISTS(
    (SELECT id FROM class_sessions WHERE department_id = v.department_id AND course_offering_id = v.course_offering_id
      AND status::text IN ('COMPLETED','LOCKED','ARCHIVED') AND canceled_at IS NULL
      AND actual_start_at IS NOT NULL AND actual_end_at > actual_start_at
     EXCEPT SELECT class_session_id FROM formative_attendance_source_items WHERE version_id = target)
    UNION ALL
    (SELECT class_session_id FROM formative_attendance_source_items WHERE version_id = target
     EXCEPT SELECT id FROM class_sessions WHERE department_id = v.department_id AND course_offering_id = v.course_offering_id
      AND status::text IN ('COMPLETED','LOCKED','ARCHIVED') AND canceled_at IS NULL
      AND actual_start_at IS NOT NULL AND actual_end_at > actual_start_at)
  ) THEN RAISE EXCEPTION 'Attendance conducted source set is incomplete or inconsistent' USING ERRCODE = '23514'; END IF;

  FOR i IN SELECT item.*, s.attendance_evidence_revision AS current_session_revision
      FROM formative_attendance_source_items item JOIN class_sessions s ON s.id = item.class_session_id WHERE item.version_id = target LOOP
    SELECT * INTO r FROM attendance_records WHERE class_session_id = i.class_session_id AND enrollment_id = v.enrollment_id;
    SELECT * INTO c FROM formative_attendance_corrections WHERE department_id = v.department_id
      AND course_offering_id = v.course_offering_id AND enrollment_id = v.enrollment_id AND class_session_id = i.class_session_id
      ORDER BY revision DESC LIMIT 1;
    IF i.session_evidence_revision IS DISTINCT FROM i.current_session_revision OR
       i.record_evidence_revision IS DISTINCT FROM r.attendance_evidence_revision THEN
      RAISE EXCEPTION 'Stale Attendance source evidence' USING ERRCODE = '23514';
    END IF;
    expected_status := NULL;
    expected_record := CASE WHEN r.archived_at IS NULL THEN r.id ELSE NULL END;
    IF r.id IS NOT NULL AND (r.department_id <> v.department_id OR r.student_user_id <> v.student_user_id) THEN
      RAISE EXCEPTION 'Attendance source reference identity mismatch' USING ERRCODE = '23514';
    END IF;
    IF i.attendance_record_id IS DISTINCT FROM expected_record OR i.correction_id IS DISTINCT FROM c.id THEN
      RAISE EXCEPTION 'Attendance effective source reference mismatch' USING ERRCODE = '23514';
    END IF;
    IF c.id IS NOT NULL THEN
      IF c.student_user_id <> v.student_user_id OR c.student_batch_id <> v.student_batch_id OR c.academic_term_id <> v.academic_term_id OR
        NOT EXISTS(WITH RECURSIVE lineage AS (
          SELECT id, previous_id FROM formative_attendance_versions WHERE id = target
          UNION ALL SELECT p.id, p.previous_id FROM formative_attendance_versions p JOIN lineage l ON p.id = l.previous_id
        ) SELECT 1 FROM lineage WHERE id = c.version_id) THEN
        RAISE EXCEPTION 'Attendance correction lineage mismatch' USING ERRCODE = '23514';
      END IF;
      -- A stale correction is representable only as unresolved BLOCKED evidence.
      IF c.session_evidence_revision = i.current_session_revision AND
         c.record_evidence_revision IS NOT DISTINCT FROM r.attendance_evidence_revision THEN expected_status := c.status; END IF;
    ELSIF r.id IS NOT NULL AND r.archived_at IS NULL AND r.resolution_status = 'RESOLVED' AND r.status::text IN ('PRESENT','ABSENT') THEN
      expected_status := r.status::text;
    END IF;
    IF i.status IS DISTINCT FROM expected_status THEN
      RAISE EXCEPTION 'Attendance source status does not match current effective evidence' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  SELECT count(*), count(*) FILTER(WHERE status = 'PRESENT'), count(*) FILTER(WHERE status IS NOT NULL)
    INTO total, present, resolved FROM formative_attendance_source_items WHERE version_id = target;
  IF total <> v.conducted_count OR present <> v.present_count OR (v.status = 'READY' AND resolved <> total) THEN
    RAISE EXCEPTION 'Attendance source package is incomplete or inconsistent' USING ERRCODE = '23514';
  END IF;
END;
$$;

-- Deferred validation lets a version and its complete relational source package be inserted atomically.
CREATE FUNCTION attendance_package_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'formative_attendance_versions' THEN PERFORM attendance_validate_package(NEW.id);
  ELSE PERFORM attendance_validate_package(NEW.version_id); END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER attendance_version_package AFTER INSERT ON formative_attendance_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION attendance_package_check();
CREATE CONSTRAINT TRIGGER attendance_item_package AFTER INSERT ON formative_attendance_source_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION attendance_package_check();

-- Recheck at commit: a transaction must not finalise and then change its sources.
CREATE FUNCTION attendance_transition_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state IN ('VERIFIED','FINALISED','LOCKED') THEN PERFORM attendance_validate_package(NEW.version_id); END IF;
  IF NEW.state IN ('FINALISED','LOCKED') AND EXISTS(SELECT 1 FROM class_sessions
      WHERE department_id = NEW.department_id AND course_offering_id = NEW.course_offering_id
        AND status::text IN ('SCHEDULED','ACTIVE') AND canceled_at IS NULL) THEN
    RAISE EXCEPTION 'ATTENDANCE_PERIOD_OPEN: complete or cancel open classes' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER attendance_transition_current AFTER INSERT ON formative_attendance_transitions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION attendance_transition_check();

-- All source writers participate in the offering mutex, including legacy routes and direct SQL.
-- Historical locks survive reopening. Counted session changes require a future controlled
-- ClassSession correction workflow; that workflow is deliberately not implemented here.
CREATE FUNCTION attendance_source_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE offering TEXT; dept TEXT; enrollment TEXT;
BEGIN
  IF TG_TABLE_NAME = 'class_sessions' THEN
    IF TG_OP = 'DELETE' THEN offering := OLD.course_offering_id; dept := OLD.department_id;
    ELSE offering := NEW.course_offering_id; dept := NEW.department_id; END IF;
    IF TG_OP = 'UPDATE' AND (OLD.id <> NEW.id OR OLD.course_offering_id <> NEW.course_offering_id OR OLD.department_id <> NEW.department_id) THEN
      RAISE EXCEPTION 'Class session source identity is immutable' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      SELECT course_offering_id, department_id INTO offering, dept FROM class_sessions WHERE id = OLD.class_session_id;
      enrollment := OLD.enrollment_id;
    ELSE
      SELECT course_offering_id, department_id INTO offering, dept FROM class_sessions WHERE id = NEW.class_session_id;
      enrollment := NEW.enrollment_id;
      IF NEW.status::text NOT IN ('PRESENT','ABSENT') THEN RAISE EXCEPTION 'Current attendance must be PRESENT or ABSENT' USING ERRCODE = '23514'; END IF;
      IF TG_OP = 'UPDATE' AND (OLD.id <> NEW.id OR OLD.department_id <> NEW.department_id OR OLD.class_session_id <> NEW.class_session_id OR OLD.enrollment_id <> NEW.enrollment_id OR OLD.student_user_id <> NEW.student_user_id) THEN
        RAISE EXCEPTION 'Attendance source identity is immutable' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  UPDATE course_offerings SET id = id WHERE id = offering AND department_id = dept;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attendance source offering not found' USING ERRCODE = '23514'; END IF;
  IF TG_TABLE_NAME = 'attendance_records' AND TG_OP <> 'DELETE' THEN
    PERFORM e.id FROM enrollments e WHERE e.id = NEW.enrollment_id AND e.department_id = NEW.department_id
      AND e.department_id = dept AND e.course_offering_id = offering AND e.student_user_id = NEW.student_user_id
      AND e.status::text = 'APPROVED' AND e.archived_at IS NULL AND e.dropped_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Attendance enrollment source identity is invalid or not current' USING ERRCODE = '23514'; END IF;
  END IF;
  IF TG_TABLE_NAME = 'attendance_records' AND EXISTS(SELECT 1 FROM formative_attendance_versions v
      JOIN formative_attendance_transitions t ON t.version_id = v.id AND t.state = 'LOCKED'
      WHERE v.department_id = dept AND v.enrollment_id = enrollment) THEN
    RAISE EXCEPTION 'Historical locked Attendance records require correction overlay, including after reopening' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'class_sessions' AND TG_OP <> 'INSERT' AND EXISTS(
      SELECT 1 FROM formative_attendance_source_items i JOIN formative_attendance_transitions t ON t.version_id = i.version_id
      WHERE i.class_session_id = OLD.id AND t.state = 'LOCKED') THEN
    RAISE EXCEPTION 'Historical locked class evidence cannot change, including after reopening' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'class_sessions' AND TG_OP = 'INSERT' AND EXISTS(
      SELECT 1 FROM formative_attendance_versions v JOIN formative_attendance_transitions t ON t.version_id = v.id
      WHERE v.course_offering_id = offering AND v.department_id = dept AND t.state = 'LOCKED') THEN
    RAISE EXCEPTION 'Historical locked class set cannot be extended, including after reopening' USING ERRCODE = '23514';
  END IF;
  IF EXISTS(SELECT 1 FROM formative_attendance_versions v
      WHERE v.course_offering_id = offering AND v.department_id = dept AND (enrollment IS NULL OR v.enrollment_id = enrollment)
      AND NOT EXISTS(SELECT 1 FROM formative_attendance_versions n WHERE n.previous_id = v.id)
      AND EXISTS(SELECT 1 FROM formative_attendance_transitions t WHERE t.version_id = v.id AND t.state = 'LOCKED')) THEN
    RAISE EXCEPTION 'Locked Attendance source requires explicit Coordinator reopening' USING ERRCODE = '23514';
  END IF;
  IF TG_OP <> 'DELETE' THEN
    IF TG_TABLE_NAME = 'class_sessions' AND TG_OP = 'UPDATE' THEN
      IF ROW(NEW.status, NEW.actual_start_at, NEW.actual_end_at, NEW.canceled_at) IS NOT DISTINCT FROM
         ROW(OLD.status, OLD.actual_start_at, OLD.actual_end_at, OLD.canceled_at) THEN
        NEW.attendance_evidence_revision := OLD.attendance_evidence_revision;
      ELSE NEW.attendance_evidence_revision := nextval('attendance_evidence_revision_seq'); END IF;
    ELSE NEW.attendance_evidence_revision := nextval('attendance_evidence_revision_seq'); END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
CREATE TRIGGER attendance_record_write_guard BEFORE INSERT OR UPDATE OR DELETE ON attendance_records FOR EACH ROW EXECUTE FUNCTION attendance_source_write_guard();
CREATE TRIGGER attendance_session_write_guard BEFORE INSERT OR UPDATE OR DELETE ON class_sessions FOR EACH ROW EXECUTE FUNCTION attendance_source_write_guard();
COMMIT;
