-- Additive Chairman Attendance generation and irreversible freeze. Historical migrations remain unchanged.
BEGIN;
-- AlterTable
ALTER TABLE "formative_attendance_versions" ADD COLUMN     "examination_course_id" TEXT,
ADD COLUMN     "examination_id" TEXT,
ADD COLUMN     "generation_id" TEXT,
ALTER COLUMN "coordinator_assignment_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "formative_attendance_generations" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "examination_id" TEXT NOT NULL,
    "academic_program_id" TEXT NOT NULL,
    "academic_session_id" TEXT NOT NULL,
    "academic_term_id" TEXT NOT NULL,
    "committee_id" TEXT NOT NULL,
    "chairman_assignment_id" TEXT NOT NULL,
    "chairman_user_id" TEXT NOT NULL,
    "chairman_assigned_at_snapshot" TIMESTAMP(3) NOT NULL,
    "user_role_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "rule_version_code" TEXT NOT NULL,
    "course_count" INTEGER NOT NULL,
    "result_count" INTEGER NOT NULL,
    "source_fingerprint" VARCHAR(64) NOT NULL,
    "scope_json" JSONB NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formative_attendance_generations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_generation_exam_uq" ON "formative_attendance_generations"("department_id", "examination_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_generation_identity_uq" ON "formative_attendance_generations"("id", "department_id", "examination_id", "chairman_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_generation_enrollment_uq" ON "formative_attendance_versions"("generation_id", "enrollment_id");

-- AddForeignKey
ALTER TABLE "formative_attendance_versions" ADD CONSTRAINT "attendance_generated_parent_fk" FOREIGN KEY ("generation_id", "department_id", "examination_id", "actor_user_id") REFERENCES "formative_attendance_generations"("id", "department_id", "examination_id", "chairman_user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "formative_attendance_versions" ADD CONSTRAINT "attendance_generated_course_fk" FOREIGN KEY ("examination_course_id", "department_id", "examination_id", "course_offering_id") REFERENCES "examination_courses"("id", "department_id", "examination_id", "course_offering_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "formative_attendance_generations" ADD CONSTRAINT "attendance_generation_exam_fk" FOREIGN KEY ("examination_id", "department_id", "academic_program_id", "academic_session_id", "academic_term_id") REFERENCES "examinations"("id", "department_id", "academic_program_id", "academic_session_id", "academic_term_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "formative_attendance_generations" ADD CONSTRAINT "attendance_generation_committee_fk" FOREIGN KEY ("committee_id", "department_id", "examination_id") REFERENCES "examination_committees"("id", "department_id", "examination_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "formative_attendance_generations" ADD CONSTRAINT "attendance_generation_assignment_fk" FOREIGN KEY ("chairman_assignment_id", "department_id", "committee_id") REFERENCES "examination_committee_assignments"("id", "department_id", "committee_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "formative_attendance_generations" ADD CONSTRAINT "attendance_generation_chairman_fk" FOREIGN KEY ("chairman_user_id", "department_id") REFERENCES "users"("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE formative_attendance_versions ADD CONSTRAINT attendance_provenance_mode CHECK (
 (generation_id IS NULL AND examination_id IS NULL AND examination_course_id IS NULL AND coordinator_assignment_id IS NOT NULL)
 OR (generation_id IS NOT NULL AND examination_id IS NOT NULL AND examination_course_id IS NOT NULL AND coordinator_assignment_id IS NULL
   AND status='READY' AND percentage IS NOT NULL AND mark IS NOT NULL AND diagnostics_json='[]'::jsonb));
ALTER TABLE formative_attendance_generations ADD CONSTRAINT attendance_generation_shape CHECK (
 rule_version_code='FORMATIVE_ATTENDANCE_5_APPROVED_20260920_V1' AND course_count>0 AND result_count>0
 AND source_fingerprint ~ '^[0-9a-f]{64}$' AND jsonb_typeof(scope_json)='array');
CREATE UNIQUE INDEX attendance_generation_success_audit_uq ON audit_logs(target_id)
  WHERE action='attendance.mark.generated' AND outcome='SUCCESS';

-- Exact live appointment and permission; no other Committee seat is a prerequisite.
CREATE FUNCTION attendance_generation_authority(g formative_attendance_generations) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM a.id FROM examinations x
    JOIN examination_committees c ON c.examination_id=x.id AND c.department_id=x.department_id
    JOIN examination_committee_assignments a ON a.committee_id=c.id AND a.examination_id=x.id AND a.department_id=x.department_id
    JOIN users u ON u.id=a.assigned_user_id AND u.department_id=a.department_id
    JOIN departments d ON d.id=u.department_id
    JOIN user_roles ur ON ur.user_id=u.id AND ur.department_id=d.id
    JOIN roles r ON r.id=ur.role_id AND r.department_id=d.id
    JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id
    WHERE x.id=g.examination_id AND x.department_id=g.department_id AND x.archived_at IS NULL
      AND x.academic_program_id=g.academic_program_id AND x.academic_session_id=g.academic_session_id AND x.academic_term_id=g.academic_term_id
      AND c.id=g.committee_id AND c.archived_at IS NULL
      AND a.id=g.chairman_assignment_id AND a.assigned_user_id=g.chairman_user_id
      AND a.seat::text='CHAIRMAN' AND a.status::text='ACTIVE' AND a.assigned_at=g.chairman_assigned_at_snapshot
      AND a.assigned_at<=clock_timestamp() AND (a.expires_at IS NULL OR a.expires_at>clock_timestamp())
      AND a.unassigned_at IS NULL AND a.archived_at IS NULL AND a.external_member_name IS NULL AND a.external_member_affiliation IS NULL
      AND u.status::text='ACTIVE' AND u.archived_at IS NULL AND u.deleted_at IS NULL
      AND d.status::text='ACTIVE' AND d.archived_at IS NULL AND d.deleted_at IS NULL
      AND ur.id=g.user_role_id AND ur.role_id=g.role_id AND ur.revoked_at IS NULL
      AND (ur.expires_at IS NULL OR ur.expires_at>clock_timestamp()) AND r.code='teacher' AND r.archived_at IS NULL
      AND p.code='attendance.mark.generate_department' AND p.resource='attendance.mark' AND p.action='generate' AND p.scope::text='DEPARTMENT'
    FOR UPDATE OF c,a,ur FOR SHARE OF x,u,d,r,rp,p;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exact current Attendance Chairman authority required' USING ERRCODE='42501'; END IF;
END;
$$;

-- Shared scope resolver: locks the full Examination boundary, then every offering mutex
-- in deterministic order. The same function is used by the service and deferred guard.
CREATE FUNCTION attendance_generation_scope(dept TEXT, exam TEXT) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE x examinations%ROWTYPE; ec examination_courses%ROWTYPE; o course_offerings%ROWTYPE;
  components JSONB; members JSONB; result JSONB := '[]';
BEGIN
  SELECT * INTO x FROM examinations WHERE id=exam AND department_id=dept AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Examination not found' USING ERRCODE='P0002'; END IF;
  -- A write mutex also makes stale repeatable-read snapshots fail after waiting
  -- for an ExaminationCourse membership writer, in either acquisition order.
  UPDATE examinations SET id=id WHERE id=x.id AND department_id=dept;
  PERFORM id FROM examination_courses WHERE examination_id=exam AND department_id=dept AND archived_at IS NULL ORDER BY id FOR UPDATE;
  FOR o IN SELECT co.* FROM course_offerings co JOIN examination_courses c ON c.course_offering_id=co.id
    WHERE c.examination_id=exam AND c.department_id=dept AND c.archived_at IS NULL ORDER BY co.id LOOP
    UPDATE course_offerings SET id=id WHERE id=o.id;
  END LOOP;
  FOR ec IN SELECT * FROM examination_courses WHERE examination_id=exam AND archived_at IS NULL ORDER BY id LOOP
    SELECT * INTO o FROM course_offerings WHERE id=ec.course_offering_id;
    IF ec.department_id<>dept OR ec.academic_term_id<>x.academic_term_id OR ec.academic_program_id<>x.academic_program_id
      OR ec.academic_session_id<>x.academic_session_id OR o.department_id<>dept OR o.academic_term_id<>x.academic_term_id
      OR o.archived_at IS NOT NULL OR o.status::text IN ('CANCELED','ARCHIVED') OR ec.student_batch_id IS NULL
      OR o.student_batch_id IS DISTINCT FROM ec.student_batch_id OR o.curriculum_course_id IS DISTINCT FROM ec.curriculum_course_id
      OR o.syllabus_version_id IS DISTINCT FROM ec.syllabus_version_id THEN
      RAISE EXCEPTION 'Invalid or unbound ExaminationCourse' USING ERRCODE='23514';
    END IF;
    PERFORM b.id FROM student_batches b JOIN academic_programs p ON p.id=b.academic_program_id AND p.department_id=b.department_id
      JOIN academic_sessions s ON s.id=b.academic_session_id AND s.department_id=b.department_id
      JOIN academic_terms t ON t.id=x.academic_term_id AND t.department_id=b.department_id
      WHERE b.id=o.student_batch_id AND b.department_id=dept AND b.academic_program_id=x.academic_program_id
        AND b.academic_session_id=x.academic_session_id AND b.archived_at IS NULL AND p.archived_at IS NULL
        AND s.archived_at IS NULL AND t.archived_at IS NULL FOR SHARE OF b,p,s,t;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid Attendance academic scope' USING ERRCODE='23514'; END IF;
    PERFORM cc.id FROM curriculum_courses cc
      JOIN curriculum_versions cv ON cv.id=cc.curriculum_version_id AND cv.department_id=cc.department_id
      JOIN syllabus_versions sv ON sv.id=ec.syllabus_version_id AND sv.curriculum_course_id=cc.id AND sv.department_id=cc.department_id
      JOIN course_assessment_templates at ON at.id=cc.assessment_template_id AND at.department_id=cc.department_id
      WHERE cc.id=ec.curriculum_course_id AND cc.department_id=dept AND cc.course_id=o.course_id
        AND cc.curriculum_version_id=ec.curriculum_version_id AND cv.academic_program_id=x.academic_program_id
        AND cc.assessment_template_id=ec.assessment_template_id AND at.archived_at IS NULL AND at.total_marks=100
      FOR SHARE OF cc,cv,sv,at;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid Attendance curriculum identity' USING ERRCODE='23514'; END IF;
    PERFORM id FROM assessment_template_components WHERE assessment_template_id=ec.assessment_template_id ORDER BY id FOR SHARE;
    SELECT jsonb_agg(jsonb_build_object('templateId',at.id,'version',at.version_number,'code',c.code,
      'maximum',c.maximum_marks::text,'total',at.total_marks::text,'required',c.is_required) ORDER BY c.code)
      INTO components FROM course_assessment_templates at JOIN assessment_template_components c ON c.assessment_template_id=at.id
      WHERE at.id=ec.assessment_template_id AND c.department_id=dept;
    IF jsonb_array_length(components) IS DISTINCT FROM 4 OR EXISTS(SELECT 1 FROM jsonb_array_elements(components) a
      WHERE (a->>'required')::boolean IS NOT TRUE OR (a->>'maximum')::numeric IS DISTINCT FROM
        CASE a->>'code' WHEN 'FORMATIVE_ACTIVITIES' THEN 30 WHEN 'ATTENDANCE' THEN 5
          WHEN 'COMPREHENSIVE_EXAMINATION' THEN 5 WHEN 'SUMMATIVE_EXAMINATION' THEN 60 END) THEN
      RAISE EXCEPTION 'A bound standard 30/5/5/60 assessment template is required' USING ERRCODE='23514';
    END IF;
    IF EXISTS(SELECT 1 FROM class_sessions WHERE department_id=dept AND course_offering_id=o.id
      AND canceled_at IS NULL AND status::text IN ('COMPLETED','LOCKED','ARCHIVED')
      AND (actual_start_at IS NULL OR actual_end_at IS NULL OR actual_end_at<=actual_start_at)) THEN
      RAISE EXCEPTION 'Structurally inconsistent Attendance class evidence' USING ERRCODE='23514'; END IF;
    IF EXISTS(SELECT 1 FROM class_sessions WHERE department_id=dept AND course_offering_id=o.id
      AND canceled_at IS NULL AND status::text IN ('SCHEDULED','ACTIVE')) THEN
      RAISE EXCEPTION 'ATTENDANCE_PERIOD_OPEN' USING ERRCODE='23514';
    END IF;
    PERFORM id FROM enrollments WHERE department_id=dept AND course_offering_id=o.id AND academic_term_id=x.academic_term_id
      AND status::text='APPROVED' AND archived_at IS NULL AND dropped_at IS NULL ORDER BY id FOR SHARE;
    IF EXISTS(SELECT 1 FROM enrollments e LEFT JOIN users u ON u.id=e.student_user_id AND u.department_id=e.department_id
      WHERE e.department_id=dept AND e.course_offering_id=o.id AND e.academic_term_id=x.academic_term_id
        AND e.status::text='APPROVED' AND e.archived_at IS NULL AND e.dropped_at IS NULL AND u.id IS NULL) THEN
      RAISE EXCEPTION 'Invalid Attendance enrollment student identity' USING ERRCODE='23514'; END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'studentUserId',student_user_id) ORDER BY id),'[]') INTO members
      FROM enrollments WHERE department_id=dept AND course_offering_id=o.id AND academic_term_id=x.academic_term_id
        AND status::text='APPROVED' AND archived_at IS NULL AND dropped_at IS NULL;
    result := result || jsonb_build_array(jsonb_build_object('examinationCourseId',ec.id,'courseOfferingId',o.id,
      'studentBatchId',o.student_batch_id,'academicTermId',o.academic_term_id,'configuration',components,'enrollments',members));
  END LOOP;
  IF jsonb_array_length(result)=0 THEN RAISE EXCEPTION 'Examination has no applicable courses' USING ERRCODE='23514'; END IF;
  RETURN result;
END;
$$;

CREATE FUNCTION attendance_generation_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM examinations WHERE id=NEW.examination_id AND department_id=NEW.department_id FOR UPDATE;
  IF NEW.scope_json IS DISTINCT FROM attendance_generation_scope(NEW.department_id,NEW.examination_id) THEN
    RAISE EXCEPTION 'Attendance generation scope mismatch' USING ERRCODE='23514'; END IF;
  PERFORM attendance_generation_authority(NEW);
  NEW.generated_at := clock_timestamp() AT TIME ZONE 'UTC'; NEW.created_at := NEW.generated_at;
  RETURN NEW;
END;
$$;
CREATE TRIGGER attendance_generation_insert BEFORE INSERT ON formative_attendance_generations FOR EACH ROW EXECUTE FUNCTION attendance_generation_insert();
CREATE TRIGGER attendance_generation_immutable BEFORE UPDATE OR DELETE ON formative_attendance_generations FOR EACH ROW EXECUTE FUNCTION attendance_immutable();

CREATE FUNCTION attendance_validate_generation(target TEXT) RETURNS void LANGUAGE plpgsql AS $$
DECLARE g formative_attendance_generations%ROWTYPE; scope JSONB; child_row RECORD; expected_count INTEGER;
BEGIN
  SELECT * INTO g FROM formative_attendance_generations WHERE id=target;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attendance generation missing' USING ERRCODE='23514'; END IF;
  scope := attendance_generation_scope(g.department_id,g.examination_id);
  PERFORM attendance_generation_authority(g);
  SELECT count(*) INTO expected_count FROM jsonb_array_elements(scope) c, jsonb_array_elements(c->'enrollments') e;
  IF expected_count=0 OR g.result_count<=0 OR g.scope_json IS DISTINCT FROM scope OR g.course_count<>jsonb_array_length(scope) OR g.result_count<>expected_count
    OR (SELECT count(*) FROM formative_attendance_versions WHERE generation_id=target)<>expected_count
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(scope) c, jsonb_array_elements(c->'enrollments') e
      WHERE NOT EXISTS(SELECT 1 FROM formative_attendance_versions fv WHERE fv.generation_id=target
        AND fv.examination_course_id=c->>'examinationCourseId' AND fv.course_offering_id=c->>'courseOfferingId'
        AND fv.enrollment_id=e->>'id' AND fv.student_user_id=e->>'studentUserId' AND fv.academic_term_id=g.academic_term_id
        AND fv.student_batch_id=c->>'studentBatchId' AND fv.configuration_json=c->'configuration')) THEN
    RAISE EXCEPTION 'Attendance generation child package incomplete or inconsistent' USING ERRCODE='23514'; END IF;
  FOR child_row IN SELECT * FROM formative_attendance_versions WHERE generation_id=target ORDER BY examination_course_id,enrollment_id LOOP
    IF child_row.status<>'READY' OR child_row.mark IS NULL OR child_row.percentage IS NULL OR child_row.diagnostics_json<>'[]'::jsonb
      OR child_row.actor_user_id<>g.chairman_user_id OR child_row.rule_version_code<>g.rule_version_code
      OR EXISTS(SELECT 1 FROM formative_attendance_transitions WHERE version_id=child_row.id) THEN
      RAISE EXCEPTION 'Generated Attendance must be complete without lifecycle transitions' USING ERRCODE='23514'; END IF;
    PERFORM attendance_validate_package(child_row.id);
  END LOOP;
  IF (SELECT count(*) FROM audit_logs WHERE action='attendance.mark.generated' AND target_id=g.id
    AND department_id=g.department_id AND actor_user_id=g.chairman_user_id AND outcome::text='SUCCESS'
    AND actor_type::text='USER' AND target_type='formative_attendance_generation'
    -- Compare typed JSON values, not text-coerced counts. Stored timestamps are
    -- UTC timestamp(3); format canonical ISO UTC strings without parsing untrusted JSON.
    AND context_json @> jsonb_build_object(
      'generationId',g.id,'examinationId',g.examination_id,'academicTermId',g.academic_term_id,
      'committeeId',g.committee_id,'chairmanAssignmentId',g.chairman_assignment_id,'chairmanUserId',g.chairman_user_id,
      'chairmanAssignedAtSnapshot',to_char(g.chairman_assigned_at_snapshot,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'ruleVersionCode',g.rule_version_code,'courseCount',g.course_count,'resultCount',g.result_count,
      'sourceFingerprint',g.source_fingerprint,'generatedAt',to_char(g.generated_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))<>1 THEN
    RAISE EXCEPTION 'Attendance generation requires exactly one success audit' USING ERRCODE='23514'; END IF;
END;
$$;
CREATE FUNCTION attendance_generation_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='formative_attendance_generations' THEN PERFORM attendance_validate_generation(NEW.id);
  ELSIF NEW.generation_id IS NOT NULL THEN PERFORM attendance_validate_generation(NEW.generation_id); END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER attendance_generation_package AFTER INSERT ON formative_attendance_generations
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION attendance_generation_check();
CREATE CONSTRAINT TRIGGER attendance_generated_child_package AFTER INSERT ON formative_attendance_versions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION attendance_generation_check();

-- Freeze Attendance course membership, not subsequent Summative workflow state.
-- Examination writers share the generation write mutex, including direct SQL.
CREATE FUNCTION attendance_generation_course_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_exam TEXT; old_dept TEXT; new_exam TEXT; new_dept TEXT; exam_row RECORD;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF ROW(NEW.id,NEW.department_id,NEW.examination_id,NEW.academic_program_id,NEW.academic_session_id,
      NEW.academic_term_id,NEW.course_offering_id,NEW.student_batch_id,NEW.curriculum_version_id,
      NEW.curriculum_course_id,NEW.syllabus_version_id,NEW.assessment_template_id,NEW.archived_at)
      IS NOT DISTINCT FROM ROW(OLD.id,OLD.department_id,OLD.examination_id,OLD.academic_program_id,OLD.academic_session_id,
      OLD.academic_term_id,OLD.course_offering_id,OLD.student_batch_id,OLD.curriculum_version_id,
      OLD.curriculum_course_id,OLD.syllabus_version_id,OLD.assessment_template_id,OLD.archived_at) THEN
      RETURN NEW;
    END IF;
  END IF;
  IF TG_OP<>'INSERT' THEN old_exam:=OLD.examination_id; old_dept:=OLD.department_id; END IF;
  IF TG_OP<>'DELETE' THEN new_exam:=NEW.examination_id; new_dept:=NEW.department_id; END IF;
  FOR exam_row IN SELECT id,department_id FROM examinations
    WHERE (id=old_exam AND department_id=old_dept) OR (id=new_exam AND department_id=new_dept)
    ORDER BY id,department_id LOOP
    UPDATE examinations SET id=id WHERE id=exam_row.id AND department_id=exam_row.department_id;
  END LOOP;
  IF TG_OP<>'INSERT' THEN
    IF EXISTS(SELECT 1 FROM formative_attendance_generations g, jsonb_array_elements(g.scope_json) c
      WHERE g.department_id=old_dept AND g.examination_id=old_exam AND c->>'examinationCourseId'=OLD.id) THEN
      RAISE EXCEPTION 'Generated Attendance ExaminationCourse scope is immutable' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_OP<>'DELETE' THEN
    IF NEW.archived_at IS NULL AND EXISTS(SELECT 1 FROM formative_attendance_generations g
      WHERE g.department_id=new_dept AND g.examination_id=new_exam) THEN
      RAISE EXCEPTION 'Generated Attendance Examination scope cannot expand' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER attendance_generation_course_scope_guard BEFORE INSERT OR UPDATE OR DELETE ON examination_courses
  FOR EACH ROW EXECUTE FUNCTION attendance_generation_course_scope_guard();

-- Do not prevent ordinary non-membership updates or leaving the applicable set.
-- Only creating a newly applicable member (including identity movement) is barred.
CREATE FUNCTION attendance_generation_enrollment_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status::text<>'APPROVED' OR NEW.archived_at IS NOT NULL OR NEW.dropped_at IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.status::text='APPROVED' AND OLD.archived_at IS NULL AND OLD.dropped_at IS NULL
      AND ROW(NEW.id,NEW.department_id,NEW.course_offering_id,NEW.academic_term_id,NEW.student_user_id)
        IS NOT DISTINCT FROM ROW(OLD.id,OLD.department_id,OLD.course_offering_id,OLD.academic_term_id,OLD.student_user_id) THEN
      RETURN NEW;
    END IF;
  END IF;
  UPDATE course_offerings SET id=id WHERE id=NEW.course_offering_id AND department_id=NEW.department_id;
  IF EXISTS(SELECT 1 FROM formative_attendance_generations g, jsonb_array_elements(g.scope_json) c
    WHERE g.department_id=NEW.department_id AND c->>'courseOfferingId'=NEW.course_offering_id
      AND c->>'academicTermId'=NEW.academic_term_id) THEN
    RAISE EXCEPTION 'Generated Attendance enrollment scope cannot expand' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER attendance_generation_enrollment_scope_guard BEFORE INSERT OR UPDATE ON enrollments
  FOR EACH ROW EXECUTE FUNCTION attendance_generation_enrollment_scope_guard();

CREATE OR REPLACE FUNCTION attendance_academic_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v formative_attendance_versions%ROWTYPE; prior formative_attendance_versions%ROWTYPE; expected TEXT; student_identity TEXT; generated BOOLEAN := false; g formative_attendance_generations%ROWTYPE;
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
  IF EXISTS(SELECT 1 FROM formative_attendance_versions fv WHERE fv.department_id=NEW.department_id
    AND fv.enrollment_id=NEW.enrollment_id AND fv.generation_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Generated Attendance is irreversible' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='formative_attendance_versions' THEN
    generated := NEW.generation_id IS NOT NULL;
  END IF;
  IF generated THEN
    SELECT * INTO g FROM formative_attendance_generations WHERE id=NEW.generation_id AND department_id=NEW.department_id
      AND examination_id=NEW.examination_id AND chairman_user_id=NEW.actor_user_id;
    IF NOT FOUND OR NEW.coordinator_assignment_id IS NOT NULL OR NEW.status<>'READY' THEN
      RAISE EXCEPTION 'Invalid generated Attendance provenance' USING ERRCODE='23514'; END IF;
    PERFORM attendance_generation_authority(g);
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(g.scope_json) c, jsonb_array_elements(c->'enrollments') e
      WHERE c->>'examinationCourseId'=NEW.examination_course_id AND c->>'courseOfferingId'=NEW.course_offering_id
        AND e->>'id'=NEW.enrollment_id AND e->>'studentUserId'=NEW.student_user_id) THEN
      RAISE EXCEPTION 'Generated Attendance outside Examination scope' USING ERRCODE='23514'; END IF;
  ELSE
  IF EXISTS(SELECT 1 FROM formative_attendance_generations fg, jsonb_array_elements(fg.scope_json) c
    WHERE fg.department_id=NEW.department_id AND c->>'courseOfferingId'=NEW.course_offering_id) THEN
    RAISE EXCEPTION 'Generated Attendance is irreversible' USING ERRCODE='23514'; END IF;
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
  END IF;
  SELECT * INTO prior FROM formative_attendance_versions WHERE department_id = NEW.department_id AND enrollment_id = NEW.enrollment_id ORDER BY revision DESC LIMIT 1;
  IF TG_TABLE_NAME = 'formative_attendance_versions' THEN
    IF (prior.id IS NULL AND (NEW.previous_id IS NOT NULL OR NEW.revision <> 1)) OR
       (prior.id IS NOT NULL AND (NEW.previous_id IS DISTINCT FROM prior.id OR NEW.revision <> prior.revision + 1
         OR NEW.course_offering_id <> prior.course_offering_id OR NEW.student_user_id <> prior.student_user_id)) THEN
      RAISE EXCEPTION 'Attendance revision must extend the current immutable version' USING ERRCODE = '23514';
    END IF;
    IF NOT generated AND EXISTS(SELECT 1 FROM formative_attendance_transitions WHERE version_id = prior.id AND state = 'LOCKED') AND
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
CREATE OR REPLACE FUNCTION attendance_validate_package(target TEXT) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v formative_attendance_versions%ROWTYPE; i RECORD; r attendance_records%ROWTYPE;
  c formative_attendance_corrections%ROWTYPE; expected_status TEXT; expected_record TEXT;
  total INTEGER; present INTEGER; resolved INTEGER;
BEGIN
  SELECT * INTO v FROM formative_attendance_versions WHERE id = target;
  IF v.generation_id IS NOT NULL AND (v.status<>'READY' OR v.mark IS NULL OR v.percentage IS NULL
    OR v.diagnostics_json<>'[]'::jsonb OR EXISTS(SELECT 1 FROM formative_attendance_transitions WHERE version_id=target)) THEN
    RAISE EXCEPTION 'Generated Attendance package must be complete' USING ERRCODE='23514'; END IF;
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
CREATE OR REPLACE FUNCTION attendance_source_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF (TG_TABLE_NAME='class_sessions' AND EXISTS(SELECT 1 FROM formative_attendance_generations g,
      jsonb_array_elements(g.scope_json) c WHERE g.department_id=dept AND c->>'courseOfferingId'=offering))
    OR (TG_TABLE_NAME='attendance_records' AND EXISTS(SELECT 1 FROM formative_attendance_versions v
      JOIN formative_attendance_generations g ON g.id=v.generation_id
      WHERE v.department_id=dept AND v.course_offering_id=offering AND v.enrollment_id=enrollment)) THEN
    RAISE EXCEPTION 'Generated Attendance source is frozen' USING ERRCODE='23514'; END IF;
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
CREATE OR REPLACE FUNCTION attendance_assert_correction_open(dept TEXT, offering TEXT, enrollment TEXT)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM formative_attendance_versions v JOIN formative_attendance_generations g ON g.id=v.generation_id
    WHERE v.department_id=dept AND v.course_offering_id=offering AND v.enrollment_id=enrollment) THEN
    RAISE EXCEPTION 'Generated Attendance is frozen for ordinary correction' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM formative_attendance_versions v
    JOIN formative_attendance_transitions t ON t.version_id = v.id AND t.state = 'LOCKED'
    WHERE v.department_id = dept AND v.course_offering_id = offering AND v.enrollment_id = enrollment) THEN
    RAISE EXCEPTION 'Attendance is frozen for ordinary correction' USING ERRCODE = '23514';
  END IF;
END;
$$;
COMMIT;
