BEGIN;

-- Durable department-role lifecycle: no user appointment or permission is implied.
-- Existing roles are never renamed, unarchived or reassigned. The permission
-- provisioner still requires one exact active role and checks every grant collision.
CREATE FUNCTION bootstrap_department_chairman_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO roles(id, department_id, code, name, description, created_at, updated_at)
    VALUES ('department_chairman:' || NEW.id, NEW.id, 'department_chairman', 'Department Chairman',
      'Department-scoped ordinary academic authority', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (department_id, code) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER department_chairman_role_bootstrap AFTER INSERT ON departments
FOR EACH ROW EXECUTE FUNCTION bootstrap_department_chairman_role();
INSERT INTO roles(id, department_id, code, name, description, created_at, updated_at)
  SELECT 'department_chairman:' || id, id, 'department_chairman', 'Department Chairman',
    'Department-scoped ordinary academic authority', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM departments
  ON CONFLICT (department_id, code) DO NOTHING;

ALTER TABLE formative_attendance_corrections
  ALTER COLUMN version_id DROP NOT NULL,
  ALTER COLUMN coordinator_assignment_id DROP NOT NULL,
  ADD COLUMN authority_kind VARCHAR(32) NOT NULL DEFAULT 'LEGACY_COORDINATOR',
  ADD COLUMN authority_json JSONB,
  ADD COLUMN previous_evidence_json JSONB;

ALTER TABLE formative_attendance_corrections ADD CONSTRAINT attendance_correction_offering_scope_fk
  FOREIGN KEY (course_offering_id, department_id, student_batch_id, academic_term_id)
  REFERENCES course_offerings(id, department_id, student_batch_id, academic_term_id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Defaults classify old rows without rewriting their evidence or Coordinator linkage.
ALTER TABLE formative_attendance_corrections ADD CONSTRAINT attendance_correction_authority_shape CHECK (
  (authority_kind = 'LEGACY_COORDINATOR' AND version_id IS NOT NULL AND coordinator_assignment_id IS NOT NULL
    AND authority_json IS NULL AND previous_evidence_json IS NULL)
  OR (authority_kind IN ('ASSIGNED_TEACHER','DEPARTMENT_CHAIRMAN','DEPARTMENT_ADMIN')
    AND version_id IS NULL AND coordinator_assignment_id IS NULL
    AND authority_json IS NOT NULL AND jsonb_typeof(authority_json) = 'object'
    AND previous_evidence_json IS NOT NULL AND jsonb_typeof(previous_evidence_json) = 'object'
    AND length(reason) BETWEEN 1 AND 2000 AND reason !~ '^[[:space:]]*$'
    AND reason = btrim(reason, E' \t\n\r\f' || chr(11)))
);

-- Integration point for later authoritative freeze sources. Historical LOCKED
-- evidence is permanent for ordinary corrections, including after legacy reopening.
CREATE FUNCTION attendance_assert_correction_open(dept TEXT, offering TEXT, enrollment TEXT)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM formative_attendance_versions v
    JOIN formative_attendance_transitions t ON t.version_id = v.id AND t.state = 'LOCKED'
    WHERE v.department_id = dept AND v.course_offering_id = offering AND v.enrollment_id = enrollment) THEN
    RAISE EXCEPTION 'Attendance is frozen for ordinary correction' USING ERRCODE = '23514';
  END IF;
END;
$$;

-- One authority/object resolver shared by the application and direct INSERT guard.
-- The offering write mutex serializes source writers and forces stale serializable
-- snapshots to retry. Academic and permission rows remain locked until audit commits.
CREATE FUNCTION attendance_resolve_correction_scope(dept TEXT, actor TEXT, session_id TEXT,
  enrollment_id_input TEXT, mode TEXT, authority JSONB) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE o course_offerings%ROWTYPE; e enrollments%ROWTYPE; grant_row RECORD; teacher_id TEXT;
  role_code TEXT;
BEGIN
  role_code := CASE mode WHEN 'ASSIGNED_TEACHER' THEN 'teacher'
    WHEN 'DEPARTMENT_CHAIRMAN' THEN 'department_chairman' WHEN 'DEPARTMENT_ADMIN' THEN 'department_admin' END;
  IF role_code IS NULL THEN RAISE EXCEPTION 'Correction authority required' USING ERRCODE = '42501'; END IF;
  SELECT co.* INTO o FROM course_offerings co JOIN class_sessions cs
    ON cs.course_offering_id = co.id AND cs.department_id = co.department_id
    WHERE cs.id = session_id AND co.department_id = dept AND co.archived_at IS NULL
      AND co.status::text NOT IN ('CANCELED','ARCHIVED') AND co.student_batch_id IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attendance scope not found' USING ERRCODE = 'P0002'; END IF;
  UPDATE course_offerings SET id = id WHERE id = o.id AND department_id = dept
    AND student_batch_id = o.student_batch_id AND academic_term_id = o.academic_term_id
    AND archived_at IS NULL AND status::text NOT IN ('CANCELED','ARCHIVED');
  IF NOT FOUND THEN RAISE EXCEPTION 'Attendance scope not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM d.id FROM departments d JOIN student_batches b ON b.department_id = d.id
    JOIN academic_terms t ON t.department_id = d.id
    JOIN academic_programs p ON p.id = b.academic_program_id AND p.department_id = d.id
    JOIN academic_sessions ac ON ac.id = b.academic_session_id AND ac.department_id = d.id
    WHERE d.id = dept AND d.status::text = 'ACTIVE' AND d.archived_at IS NULL AND d.deleted_at IS NULL
      AND b.id = o.student_batch_id AND t.id = o.academic_term_id
      AND b.archived_at IS NULL AND t.archived_at IS NULL AND p.archived_at IS NULL AND ac.archived_at IS NULL
    FOR SHARE OF d,b,t,p,ac;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attendance scope not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM id FROM users WHERE id = actor AND department_id = dept AND status::text = 'ACTIVE'
    AND archived_at IS NULL AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Correction authority required' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = actor AND ur.department_id = dept AND r.department_id = dept AND r.code = 'student'
      AND ur.revoked_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at > clock_timestamp()) AND r.archived_at IS NULL) THEN
    RAISE EXCEPTION 'Students cannot correct Attendance' USING ERRCODE = '42501';
  END IF;
  SELECT ur.id INTO grant_row FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.department_id = ur.department_id
    JOIN role_permissions rp ON rp.role_id = r.id JOIN permissions pm ON pm.id = rp.permission_id
    WHERE ur.id = authority->>'userRoleId' AND r.id = authority->>'roleId'
      AND rp.id = authority->>'rolePermissionId' AND pm.id = authority->>'permissionId'
      AND ur.user_id = actor AND ur.department_id = dept AND r.code = role_code
      AND ur.revoked_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at > clock_timestamp()) AND r.archived_at IS NULL
      AND pm.code = 'attendance.record.correct_department' AND pm.resource = 'attendance.record'
      AND pm.action = 'correct' AND pm.scope::text = 'DEPARTMENT' FOR SHARE OF ur,r,rp,pm;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exact persisted correction grant required' USING ERRCODE = '42501'; END IF;
  IF mode = 'ASSIGNED_TEACHER' THEN
    SELECT a.id INTO teacher_id FROM teacher_course_assignments a
      WHERE a.department_id = dept AND a.course_offering_id = o.id AND a.teacher_user_id = actor
        AND a.status::text = 'ACTIVE' AND a.assigned_at <= clock_timestamp()
        AND a.unassigned_at IS NULL AND a.archived_at IS NULL ORDER BY a.id LIMIT 1 FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Attendance scope not found' USING ERRCODE = 'P0002'; END IF;
  END IF;
  PERFORM id FROM class_sessions WHERE id = session_id AND department_id = dept AND course_offering_id = o.id
    AND status::text IN ('COMPLETED','LOCKED','ARCHIVED') AND canceled_at IS NULL
    AND actual_start_at IS NOT NULL AND actual_end_at > actual_start_at FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attendance scope not found' USING ERRCODE = 'P0002'; END IF;
  SELECT en.* INTO e FROM enrollments en JOIN users u ON u.id = en.student_user_id AND u.department_id = en.department_id
    WHERE en.id = enrollment_id_input AND en.department_id = dept AND en.course_offering_id = o.id
      AND en.academic_term_id = o.academic_term_id AND en.status::text = 'APPROVED'
      AND en.archived_at IS NULL AND en.dropped_at IS NULL AND u.status::text = 'ACTIVE'
      AND u.archived_at IS NULL AND u.deleted_at IS NULL FOR SHARE OF en,u;
  IF NOT FOUND OR e.student_user_id = actor THEN RAISE EXCEPTION 'Attendance scope not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM attendance_assert_correction_open(dept, o.id, e.id);
  RETURN jsonb_build_object('departmentId',dept,'courseOfferingId',o.id,'enrollmentId',e.id,
    'studentUserId',e.student_user_id,'studentBatchId',o.student_batch_id,'academicTermId',o.academic_term_id);
END;
$$;

CREATE FUNCTION attendance_ordinary_correction_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE scope JSONB; previous formative_attendance_corrections%ROWTYPE; r attendance_records%ROWTYPE;
  teacher_id TEXT; role_code TEXT; stale BOOLEAN;
BEGIN
  scope := attendance_resolve_correction_scope(NEW.department_id, NEW.actor_user_id, NEW.class_session_id,
    NEW.enrollment_id, NEW.authority_kind, NEW.authority_json);
  IF scope->>'courseOfferingId' IS DISTINCT FROM NEW.course_offering_id OR
    scope->>'studentUserId' IS DISTINCT FROM NEW.student_user_id OR scope->>'studentBatchId' IS DISTINCT FROM NEW.student_batch_id OR
    scope->>'academicTermId' IS DISTINCT FROM NEW.academic_term_id THEN
    RAISE EXCEPTION 'Correction academic identity mismatch' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO previous FROM formative_attendance_corrections WHERE enrollment_id = NEW.enrollment_id
    AND class_session_id = NEW.class_session_id ORDER BY revision DESC LIMIT 1;
  IF NEW.revision <> COALESCE(previous.revision,0) + 1 THEN
    RAISE EXCEPTION 'Correction must extend current immutable lineage' USING ERRCODE = '23514';
  END IF;
  SELECT attendance_evidence_revision INTO NEW.session_evidence_revision FROM class_sessions WHERE id = NEW.class_session_id;
  SELECT * INTO r FROM attendance_records WHERE class_session_id = NEW.class_session_id AND enrollment_id = NEW.enrollment_id FOR SHARE;
  IF r.id IS NOT NULL AND (r.department_id <> NEW.department_id OR r.student_user_id <> NEW.student_user_id) THEN
    RAISE EXCEPTION 'Correction source identity mismatch' USING ERRCODE = '23514';
  END IF;
  NEW.record_evidence_revision := r.attendance_evidence_revision;
  stale := previous.id IS NOT NULL AND (previous.session_evidence_revision IS DISTINCT FROM NEW.session_evidence_revision
    OR previous.record_evidence_revision IS DISTINCT FROM NEW.record_evidence_revision);
  NEW.previous_evidence_json := jsonb_build_object('correctionId',previous.id,'correctionStatus',previous.status,
    'basisFingerprint',previous.basis_fingerprint,'stale',stale,'rawRecordId',r.id,'rawStatus',r.status,
    'resolutionStatus',r.resolution_status,'effectiveStatus', CASE WHEN previous.id IS NOT NULL AND NOT stale THEN previous.status
      WHEN previous.id IS NULL AND r.archived_at IS NULL AND r.resolution_status = 'RESOLVED'
        AND r.status::text IN ('PRESENT','ABSENT') THEN r.status::text ELSE NULL END);
  role_code := CASE NEW.authority_kind WHEN 'ASSIGNED_TEACHER' THEN 'teacher'
    WHEN 'DEPARTMENT_CHAIRMAN' THEN 'department_chairman' WHEN 'DEPARTMENT_ADMIN' THEN 'department_admin' END;
  IF NEW.authority_kind = 'ASSIGNED_TEACHER' THEN
    SELECT id INTO teacher_id FROM teacher_course_assignments WHERE department_id = NEW.department_id
      AND course_offering_id = NEW.course_offering_id AND teacher_user_id = NEW.actor_user_id
      AND status::text = 'ACTIVE' AND assigned_at <= clock_timestamp() AND unassigned_at IS NULL AND archived_at IS NULL
      ORDER BY id LIMIT 1 FOR SHARE;
  END IF;
  -- Canonical immutable authorization snapshot. Mutable display names are never authority.
  NEW.authority_json := jsonb_build_object('userRoleId',NEW.authority_json->>'userRoleId',
    'roleId',NEW.authority_json->>'roleId','rolePermissionId',NEW.authority_json->>'rolePermissionId',
    'permissionId',NEW.authority_json->>'permissionId','roleCode',role_code,'departmentId',NEW.department_id,
    'permissionCode','attendance.record.correct_department','resource','attendance.record','action','correct',
    'scope','DEPARTMENT','teacherCourseAssignmentId',teacher_id);
  NEW.occurred_at := clock_timestamp() AT TIME ZONE 'UTC';
  RETURN NEW;
END;
$$;

-- The complete historical trigger function is retained, without weakening its checks.
DROP TRIGGER attendance_correction_insert ON formative_attendance_corrections;
CREATE TRIGGER attendance_correction_insert BEFORE INSERT ON formative_attendance_corrections
FOR EACH ROW WHEN (NEW.authority_kind = 'LEGACY_COORDINATOR') EXECUTE FUNCTION attendance_academic_insert();
CREATE TRIGGER attendance_ordinary_correction_insert BEFORE INSERT ON formative_attendance_corrections
FOR EACH ROW WHEN (NEW.authority_kind <> 'LEGACY_COORDINATOR') EXECUTE FUNCTION attendance_ordinary_correction_insert();

-- Package validator replacement follows: only the legacy-version lineage predicate
-- changes. Ordinary corrections retain exact academic identity and database-owned
-- stale-source tokens; all source-set, status and aggregate checks remain unchanged.

CREATE OR REPLACE FUNCTION attendance_validate_package(target TEXT) RETURNS void LANGUAGE plpgsql AS $$
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
        (c.authority_kind = 'LEGACY_COORDINATOR' AND NOT EXISTS(WITH RECURSIVE lineage AS (
          SELECT id, previous_id FROM formative_attendance_versions WHERE id = target
          UNION ALL SELECT p.id, p.previous_id FROM formative_attendance_versions p JOIN lineage l ON p.id = l.previous_id
        ) SELECT 1 FROM lineage WHERE id = c.version_id)) THEN
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


COMMIT;
