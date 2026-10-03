BEGIN;

CREATE UNIQUE INDEX fa_final_submission_binding_uq ON formative_activity_submissions(id,activity_id,version,source_fingerprint);
CREATE UNIQUE INDEX fa_final_item_binding_uq ON formative_activity_submission_items(id,submission_id,activity_id,mark_evidence_id);

CREATE TABLE formative_activities_finalisations (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL,
  CONSTRAINT faf_finalisations_department_id_fk FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  examination_id TEXT NOT NULL,
  CONSTRAINT faf_finalisations_examination_id_fk FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  examination_course_id TEXT NOT NULL,
  CONSTRAINT faf_finalisations_examination_course_id_fk FOREIGN KEY (examination_course_id,department_id,examination_id,course_offering_id) REFERENCES examination_courses(id,department_id,examination_id,course_offering_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  course_offering_id TEXT NOT NULL CONSTRAINT fa_final_offering_uq UNIQUE,
  CONSTRAINT faf_finalisations_course_offering_id_fk FOREIGN KEY (course_offering_id) REFERENCES course_offerings(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  committee_id TEXT NOT NULL,
  CONSTRAINT faf_finalisations_committee_id_fk FOREIGN KEY (committee_id,department_id,examination_id) REFERENCES examination_committees(id,department_id,examination_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  chairman_assignment_id TEXT NOT NULL,
  CONSTRAINT faf_finalisations_chairman_assignment_id_fk FOREIGN KEY (chairman_assignment_id,department_id,committee_id) REFERENCES examination_committee_assignments(id,department_id,committee_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  chairman_user_id TEXT NOT NULL,
  CONSTRAINT faf_finalisations_chairman_user_id_fk FOREIGN KEY (chairman_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  chairman_assigned_at_snapshot TIMESTAMP(3) NOT NULL,
  user_role_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  role_permission_id TEXT NOT NULL,
  authority_snapshot_json JSONB NOT NULL,
  rule_version_code VARCHAR(64) NOT NULL,
  activity_count INTEGER NOT NULL,
  result_count INTEGER NOT NULL,
  source_fingerprint VARCHAR(64) NOT NULL,
  scope_json JSONB NOT NULL,
  finalised_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(rule_version_code='FORMATIVE_ACTIVITIES_FINAL_30_SUM_V1' AND activity_count>0 AND result_count>0)
);

CREATE TABLE formative_activities_final_results (
  id TEXT PRIMARY KEY,
  finalisation_id TEXT NOT NULL,
  CONSTRAINT faf_final_results_finalisation_id_fk FOREIGN KEY (finalisation_id) REFERENCES formative_activities_finalisations(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  enrollment_id TEXT NOT NULL,
  CONSTRAINT faf_final_results_enrollment_id_fk FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  student_user_id TEXT NOT NULL,
  CONSTRAINT faf_final_results_student_user_id_fk FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  mark DECIMAL(6,2) NOT NULL,
  full_mark DECIMAL(6,2) NOT NULL,
  source_fingerprint VARCHAR(64) NOT NULL,
  CONSTRAINT fa_final_result_enrollment_uq UNIQUE(finalisation_id,enrollment_id),
  CHECK(full_mark=30.00 AND mark BETWEEN 0.00 AND 30.00)
);

CREATE TABLE formative_activities_final_source_items (
  id TEXT PRIMARY KEY,
  result_id TEXT NOT NULL,
  CONSTRAINT faf_final_source_items_result_id_fk FOREIGN KEY (result_id) REFERENCES formative_activities_final_results(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  activity_id TEXT NOT NULL,
  CONSTRAINT faf_final_source_items_activity_id_fk FOREIGN KEY (activity_id) REFERENCES formative_activities(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  submission_id TEXT NOT NULL,
  CONSTRAINT faf_final_source_items_submission_id_fk FOREIGN KEY (submission_id,activity_id,submission_version,submission_fingerprint) REFERENCES formative_activity_submissions(id,activity_id,version,source_fingerprint) ON DELETE RESTRICT ON UPDATE RESTRICT,
  submission_version INTEGER NOT NULL,
  submission_fingerprint VARCHAR(64) NOT NULL,
  submission_item_id TEXT NOT NULL,
  CONSTRAINT faf_final_source_items_submission_item_id_fk FOREIGN KEY (submission_item_id,submission_id,activity_id,mark_evidence_id) REFERENCES formative_activity_submission_items(id,submission_id,activity_id,mark_evidence_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  mark_evidence_id TEXT NOT NULL,
  CONSTRAINT faf_final_source_items_mark_evidence_id_fk FOREIGN KEY (mark_evidence_id) REFERENCES formative_mark_evidence(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  weighted_mark DECIMAL(6,2) NOT NULL,
  CONSTRAINT fa_final_source_activity_uq UNIQUE(result_id,activity_id),
  CHECK(submission_version>0 AND weighted_mark BETWEEN 0.00 AND 30.00)
);
-- Live authorization IDs are validated exactly here and retained as immutable snapshots.
-- They are deliberately not lifetime FKs to revocable authorization grants (Attendance precedent).
CREATE FUNCTION formative_final_authority(g formative_activities_finalisations) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF g.authority_snapshot_json IS DISTINCT FROM jsonb_build_object('roleCode','teacher',
    'permissionCode','formative.activities.finalise_department','resource','formative.activities','action','finalise','scope','DEPARTMENT') THEN
    RAISE EXCEPTION 'Exact current Activities Chairman authority required' USING ERRCODE='42501'; END IF;
  PERFORM a.id FROM examinations x
    JOIN examination_committees c ON c.examination_id=x.id AND c.department_id=x.department_id
    JOIN examination_committee_assignments a ON a.committee_id=c.id AND a.examination_id=x.id AND a.department_id=x.department_id
    JOIN users u ON u.id=a.assigned_user_id AND u.department_id=a.department_id
    JOIN departments d ON d.id=u.department_id
    JOIN user_roles ur ON ur.user_id=u.id AND ur.department_id=d.id
    JOIN roles r ON r.id=ur.role_id AND r.department_id=d.id
    JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id
    WHERE x.id=g.examination_id AND x.department_id=g.department_id AND x.archived_at IS NULL
      AND c.id=g.committee_id AND c.archived_at IS NULL
      AND a.id=g.chairman_assignment_id AND a.assigned_user_id=g.chairman_user_id
      AND a.seat::text='CHAIRMAN' AND a.status::text='ACTIVE' AND a.assigned_at=g.chairman_assigned_at_snapshot
      AND a.assigned_at<=g.finalised_at AND (a.expires_at IS NULL OR a.expires_at>g.finalised_at)
      AND a.unassigned_at IS NULL AND a.archived_at IS NULL AND a.external_member_name IS NULL AND a.external_member_affiliation IS NULL
      AND u.status::text='ACTIVE' AND u.archived_at IS NULL AND u.deleted_at IS NULL
      AND d.status::text='ACTIVE' AND d.archived_at IS NULL AND d.deleted_at IS NULL
      AND ur.id=g.user_role_id AND ur.role_id=g.role_id AND ur.revoked_at IS NULL
      AND (ur.expires_at IS NULL OR ur.expires_at>g.finalised_at) AND r.code='teacher' AND r.archived_at IS NULL
      AND rp.id=g.role_permission_id AND p.id=g.permission_id
      AND p.code='formative.activities.finalise_department' AND p.resource='formative.activities' AND p.action='finalise' AND p.scope::text='DEPARTMENT'
    FOR UPDATE OF c,a,ur FOR SHARE OF x,u,d,r,rp,p;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exact current Activities Chairman authority required' USING ERRCODE='42501'; END IF;
END;
$$;


-- The route identity is ExaminationCourse; the offering remains the shared academic mutex.
CREATE FUNCTION formative_final_scope(dept TEXT, exam TEXT, course TEXT, offering TEXT, locking BOOLEAN) RETURNS void LANGUAGE plpgsql AS $$
DECLARE x examinations; ec examination_courses; o course_offerings;
BEGIN
  IF locking THEN
    SELECT * INTO x FROM examinations WHERE id=exam AND department_id=dept AND archived_at IS NULL FOR UPDATE;
  ELSE
    SELECT * INTO x FROM examinations WHERE id=exam AND department_id=dept AND archived_at IS NULL;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Examination course not found' USING ERRCODE='P0002'; END IF;
  IF locking THEN
    SELECT * INTO ec FROM examination_courses WHERE id=course AND department_id=dept AND examination_id=exam
    AND course_offering_id=offering AND archived_at IS NULL FOR UPDATE;
  ELSE
    SELECT * INTO ec FROM examination_courses WHERE id=course AND department_id=dept AND examination_id=exam
    AND course_offering_id=offering AND archived_at IS NULL;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Examination course not found' USING ERRCODE='P0002'; END IF;
  IF locking THEN
    SELECT * INTO o FROM course_offerings WHERE id=offering AND department_id=dept FOR UPDATE;
  ELSE
    SELECT * INTO o FROM course_offerings WHERE id=offering AND department_id=dept;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Examination course not found' USING ERRCODE='P0002'; END IF;
  -- Write a row version so waiting repeatable-read/Serializable source writers cannot use an old snapshot.
  IF locking THEN UPDATE course_offerings SET id=id WHERE id=offering; END IF;
  IF o.archived_at IS NOT NULL OR o.status::text IN ('CANCELED','ARCHIVED')
    OR ec.academic_program_id IS DISTINCT FROM x.academic_program_id
    OR ec.academic_session_id IS DISTINCT FROM x.academic_session_id
    OR ec.academic_term_id IS DISTINCT FROM x.academic_term_id
    OR ec.academic_term_id IS DISTINCT FROM o.academic_term_id
    OR ec.student_batch_id IS DISTINCT FROM o.student_batch_id
    OR ec.curriculum_course_id IS DISTINCT FROM o.curriculum_course_id
    OR ec.syllabus_version_id IS DISTINCT FROM o.syllabus_version_id THEN
    RAISE EXCEPTION 'Invalid Activities academic scope' USING ERRCODE='23514'; END IF;
  IF locking THEN
    PERFORM cc.id FROM curriculum_courses cc JOIN curriculum_versions cv ON cv.id=cc.curriculum_version_id
    JOIN syllabus_versions sv ON sv.id=ec.syllabus_version_id
    WHERE cc.id=o.curriculum_course_id AND cc.department_id=dept AND cc.course_id=o.course_id
      AND cc.curriculum_version_id=ec.curriculum_version_id AND cv.department_id=dept
      AND cv.academic_program_id=x.academic_program_id AND sv.department_id=dept AND sv.curriculum_course_id=cc.id
      AND cc.assessment_template_id=ec.assessment_template_id FOR SHARE OF cc,cv,sv;
  ELSE
    PERFORM cc.id FROM curriculum_courses cc JOIN curriculum_versions cv ON cv.id=cc.curriculum_version_id
    JOIN syllabus_versions sv ON sv.id=ec.syllabus_version_id
    WHERE cc.id=o.curriculum_course_id AND cc.department_id=dept AND cc.course_id=o.course_id
      AND cc.curriculum_version_id=ec.curriculum_version_id AND cv.department_id=dept
      AND cv.academic_program_id=x.academic_program_id AND sv.department_id=dept AND sv.curriculum_course_id=cc.id
      AND cc.assessment_template_id=ec.assessment_template_id;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid Activities academic scope' USING ERRCODE='23514'; END IF;
END;
$$;

CREATE FUNCTION formative_final_lock(dept TEXT, exam TEXT, course TEXT, offering TEXT) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM formative_final_scope(dept,exam,course,offering,true); END;
$$;
CREATE FUNCTION formative_final_read_scope(dept TEXT, exam TEXT, course TEXT, offering TEXT) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM formative_final_scope(dept,exam,course,offering,false); END;
$$;

CREATE FUNCTION formative_final_hash(tokens TEXT[]) RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT encode(sha256(convert_to(string_agg(formative_fingerprint_token(v),'' ORDER BY n),'UTF8')),'hex')
  FROM unnest(tokens) WITH ORDINALITY AS t(v,n);
$$;

-- Read-only counterpart of Step 4A configuration reconstruction; its governed semantics are unchanged.
CREATE FUNCTION formative_final_read_configuration(dept TEXT, offering TEXT) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE component RECORD; configuration JSONB; components JSONB := '[]'; codes TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR component IN
    SELECT t.id AS template_id, t.version_number, t.total_marks, c.id, c.code, c.maximum_marks, c.is_required
    FROM course_offerings o JOIN curriculum_courses cc
      ON cc.id = o.curriculum_course_id AND cc.department_id = o.department_id AND cc.course_id = o.course_id
    JOIN course_assessment_templates t ON t.id = cc.assessment_template_id AND t.department_id = cc.department_id
    JOIN assessment_template_components c ON c.assessment_template_id = t.id AND c.department_id = t.department_id
    WHERE o.id = offering AND o.department_id = dept AND t.archived_at IS NULL
    ORDER BY c.code COLLATE "C"
  LOOP
    IF component.is_required IS DISTINCT FROM true OR component.total_marks IS DISTINCT FROM 100::NUMERIC
      OR component.code = ANY(codes) OR component.maximum_marks IS DISTINCT FROM
        (CASE component.code WHEN 'FORMATIVE_ACTIVITIES' THEN 30::NUMERIC WHEN 'ATTENDANCE' THEN 5::NUMERIC
          WHEN 'COMPREHENSIVE_EXAMINATION' THEN 5::NUMERIC WHEN 'SUMMATIVE_EXAMINATION' THEN 60::NUMERIC END) THEN
      RAISE EXCEPTION 'A bound standard 30/5/5/60 assessment template is required' USING ERRCODE = '23514';
    END IF;
    codes := array_append(codes, component.code);
    configuration := jsonb_build_object('templateId', component.template_id, 'templateVersion', component.version_number);
    components := components || jsonb_build_array(jsonb_build_object('id', component.id, 'code', component.code,
      'maximum', component.maximum_marks::NUMERIC(6,2)::TEXT));
  END LOOP;
  IF cardinality(codes) <> 4 THEN
    RAISE EXCEPTION 'A bound standard 30/5/5/60 assessment template is required' USING ERRCODE = '23514';
  END IF;
  RETURN configuration || jsonb_build_object('components', components);
END;
$$;

-- Bounded diagnostics, complete academic evidence. No eligibility or historical Teacher-duty gate.
CREATE FUNCTION formative_final_sources(dept TEXT, exam TEXT, course TEXT, offering TEXT, lock_sources BOOLEAN DEFAULT true) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE configuration JSONB; activities JSONB := '[]'; results JSONB := '[]'; blockers JSONB := '[]';
  activity_row formative_activities; submission_row formative_activity_submissions; enrollment_row enrollments; source_row RECORD;
  sources JSONB; tokens TEXT[]; batch_tokens TEXT[]; total NUMERIC; weights NUMERIC; roster INTEGER;
BEGIN
  BEGIN
    IF lock_sources THEN configuration := formative_activity_configuration(dept,offering);
    ELSE configuration := formative_final_read_configuration(dept,offering); END IF;
  EXCEPTION WHEN check_violation THEN
    blockers := blockers || jsonb_build_array(jsonb_build_object('code','INVALID_CONFIGURATION'));
  END;
  IF configuration->>'templateId' IS DISTINCT FROM (SELECT assessment_template_id FROM examination_courses WHERE id=course) THEN
    blockers := blockers || jsonb_build_array(jsonb_build_object('code','CONFIGURATION_IDENTITY_MISMATCH'));
  END IF;
  IF lock_sources THEN
  PERFORM id FROM formative_activities WHERE department_id=dept AND course_offering_id=offering ORDER BY id COLLATE "C" FOR SHARE;
  PERFORM id FROM formative_activity_submissions WHERE department_id=dept AND course_offering_id=offering ORDER BY activity_id COLLATE "C",version FOR SHARE;
  PERFORM id FROM enrollments WHERE department_id=dept AND course_offering_id=offering
    AND status::text='APPROVED' AND archived_at IS NULL ORDER BY id COLLATE "C" FOR SHARE;
  END IF;
  SELECT coalesce(sum(assigned_weight),0) INTO weights FROM formative_activities WHERE department_id=dept AND course_offering_id=offering;
  SELECT count(*) INTO roster FROM enrollments WHERE department_id=dept AND course_offering_id=offering AND status::text='APPROVED' AND archived_at IS NULL;
  IF weights<>30 THEN blockers := blockers || jsonb_build_array(jsonb_build_object('code','WEIGHT_NOT_30')); END IF;
  IF EXISTS(SELECT 1 FROM enrollments e LEFT JOIN users u ON u.id=e.student_user_id AND u.department_id=e.department_id
    WHERE e.department_id=dept AND e.course_offering_id=offering AND e.status::text='APPROVED' AND e.archived_at IS NULL AND u.id IS NULL) THEN
    RAISE EXCEPTION 'Invalid Activities source package' USING ERRCODE='23514'; END IF;
  IF roster=0 THEN blockers := blockers || jsonb_build_array(jsonb_build_object('code','EMPTY_ROSTER')); END IF;
  FOR activity_row IN SELECT * FROM formative_activities WHERE department_id=dept AND course_offering_id=offering ORDER BY id COLLATE "C" LOOP
    SELECT * INTO submission_row FROM formative_activity_submissions WHERE activity_id=activity_row.id AND department_id=dept ORDER BY version DESC LIMIT 1;
    activities := activities || jsonb_build_array(jsonb_build_object('activityId',activity_row.id,'assignedWeight',activity_row.assigned_weight::TEXT,
      'status',activity_row.status,'submissionId',submission_row.id,'submissionVersion',submission_row.version,'submissionFingerprint',submission_row.source_fingerprint,
      'isCurrent',coalesce(formative_activity_submission_is_current(submission_row.id),false)));
    IF jsonb_array_length(blockers)<50 THEN
      IF activity_row.status::text<>'MARKING' THEN blockers := blockers || jsonb_build_array(jsonb_build_object('code','ACTIVITY_NOT_MARKING','activityId',activity_row.id));
      ELSIF submission_row.id IS NULL THEN blockers := blockers || jsonb_build_array(jsonb_build_object('code','MISSING_SUBMISSION','activityId',activity_row.id));
      ELSIF NOT formative_activity_submission_is_current(submission_row.id) THEN blockers := blockers || jsonb_build_array(jsonb_build_object('code','STALE_SUBMISSION','activityId',activity_row.id));
      ELSIF submission_row.source_snapshot_json->'configuration' IS DISTINCT FROM configuration THEN
        blockers := blockers || jsonb_build_array(jsonb_build_object('code','SUBMISSION_CONFIGURATION_MISMATCH','activityId',activity_row.id));
      END IF;
    END IF;
  END LOOP;
  IF jsonb_array_length(activities)=0 THEN blockers := blockers || jsonb_build_array(jsonb_build_object('code','NO_ACTIVITIES')); END IF;
  batch_tokens := ARRAY[dept,exam,course,offering,'FORMATIVE_ACTIVITIES_FINAL_30_SUM_V1',configuration::TEXT];
  IF jsonb_array_length(blockers)=0 THEN
    FOR enrollment_row IN SELECT * FROM enrollments WHERE department_id=dept AND course_offering_id=offering
      AND status::text='APPROVED' AND archived_at IS NULL ORDER BY id COLLATE "C" LOOP
      sources := '[]'; total := 0;
      tokens := ARRAY['FORMATIVE_ACTIVITIES_FINAL_30_SUM_V1',enrollment_row.id,enrollment_row.student_user_id];
      FOR source_row IN SELECT a.id AS activity_id,p.id AS submission_id,p.version,p.source_fingerprint,si.id AS item_id,m.id AS mark_id,m.weighted_mark
        FROM formative_activities a JOIN formative_activity_submissions p ON p.activity_id=a.id
        JOIN formative_activity_submission_items si ON si.submission_id=p.id AND si.enrollment_id=enrollment_row.id
        JOIN formative_mark_evidence m ON m.id=si.mark_evidence_id
        WHERE a.department_id=dept AND a.course_offering_id=offering
          AND NOT EXISTS(SELECT 1 FROM formative_activity_submissions next WHERE next.previous_id=p.id)
        ORDER BY a.id COLLATE "C"
      LOOP
        total := total+source_row.weighted_mark;
        tokens := tokens || ARRAY[source_row.activity_id,source_row.submission_id,source_row.version::TEXT,source_row.source_fingerprint,source_row.item_id,source_row.mark_id,source_row.weighted_mark::TEXT];
        sources := sources || jsonb_build_array(jsonb_build_object('activityId',source_row.activity_id,'submissionId',source_row.submission_id,
          'submissionVersion',source_row.version,'submissionFingerprint',source_row.source_fingerprint,'submissionItemId',source_row.item_id,
          'markEvidenceId',source_row.mark_id,'weightedMark',source_row.weighted_mark::TEXT));
      END LOOP;
      IF jsonb_array_length(sources)<>jsonb_array_length(activities) OR total NOT BETWEEN 0 AND 30 OR enrollment_row.student_user_id IS NULL THEN
        RAISE EXCEPTION 'Invalid Activities source package' USING ERRCODE='23514'; END IF;
      results := results || jsonb_build_array(jsonb_build_object('enrollmentId',enrollment_row.id,'studentUserId',enrollment_row.student_user_id,
        'mark',total::NUMERIC(6,2)::TEXT,'fullMark','30.00','sourceFingerprint',formative_final_hash(tokens),'sources',sources));
      batch_tokens := batch_tokens || ARRAY[enrollment_row.id,enrollment_row.student_user_id,formative_final_hash(tokens)];
    END LOOP;
  END IF;
  RETURN jsonb_build_object('configuration',configuration,'activities',activities,'results',results,'blockers',blockers,
    'activityCount',jsonb_array_length(activities),'rosterCount',roster,'totalWeight',weights::NUMERIC(8,2)::TEXT,
    'sourceFingerprint',formative_final_hash(batch_tokens),'ready',jsonb_array_length(blockers)=0);
END;
$$;

CREATE FUNCTION formative_final_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM formative_final_lock(NEW.department_id,NEW.examination_id,NEW.examination_course_id,NEW.course_offering_id);
  NEW.finalised_at := clock_timestamp() AT TIME ZONE 'UTC';
  PERFORM formative_final_authority(NEW);
  RETURN NEW;
END;
$$;
CREATE TRIGGER formative_final_insert BEFORE INSERT ON formative_activities_finalisations FOR EACH ROW EXECUTE FUNCTION formative_final_insert();

CREATE FUNCTION formative_final_validate(target TEXT) RETURNS void LANGUAGE plpgsql AS $$
DECLARE g formative_activities_finalisations; scope JSONB; r JSONB; src JSONB; result_row formative_activities_final_results;
BEGIN
  SELECT * INTO g FROM formative_activities_finalisations WHERE id=target;
  PERFORM formative_final_lock(g.department_id,g.examination_id,g.examination_course_id,g.course_offering_id);
  PERFORM formative_final_authority(g);
  scope := formative_final_sources(g.department_id,g.examination_id,g.examination_course_id,g.course_offering_id);
  IF (scope->>'ready')::BOOLEAN IS DISTINCT FROM true OR g.scope_json IS DISTINCT FROM scope
    OR g.source_fingerprint IS DISTINCT FROM scope->>'sourceFingerprint'
    OR g.activity_count IS DISTINCT FROM (scope->>'activityCount')::INTEGER
    OR g.result_count IS DISTINCT FROM (scope->>'rosterCount')::INTEGER
    OR (SELECT count(*) FROM formative_activities_final_results WHERE finalisation_id=g.id)<>g.result_count THEN
    RAISE EXCEPTION 'Invalid Activities finalisation package' USING ERRCODE='23514'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(scope->'results') LOOP
    SELECT * INTO result_row FROM formative_activities_final_results WHERE finalisation_id=g.id AND enrollment_id=r->>'enrollmentId';
    IF NOT FOUND OR result_row.student_user_id IS DISTINCT FROM r->>'studentUserId'
      OR result_row.mark IS DISTINCT FROM (r->>'mark')::NUMERIC OR result_row.full_mark<>30
      OR result_row.source_fingerprint IS DISTINCT FROM r->>'sourceFingerprint'
      OR (SELECT count(*) FROM formative_activities_final_source_items WHERE result_id=result_row.id)<>g.activity_count THEN
      RAISE EXCEPTION 'Invalid Activities result package' USING ERRCODE='23514'; END IF;
    FOR src IN SELECT value FROM jsonb_array_elements(r->'sources') LOOP
      IF NOT EXISTS(SELECT 1 FROM formative_activities_final_source_items si WHERE si.result_id=result_row.id
        AND si.activity_id=src->>'activityId' AND si.submission_id=src->>'submissionId'
        AND si.submission_version=(src->>'submissionVersion')::INTEGER AND si.submission_fingerprint=src->>'submissionFingerprint'
        AND si.submission_item_id=src->>'submissionItemId' AND si.mark_evidence_id=src->>'markEvidenceId'
        AND si.weighted_mark=(src->>'weightedMark')::NUMERIC) THEN
        RAISE EXCEPTION 'Invalid Activities source package' USING ERRCODE='23514'; END IF;
    END LOOP;
  END LOOP;
  IF (SELECT count(*) FROM audit_logs WHERE action='formative.activities.chairman-finalised' AND target_id=g.id
    AND department_id=g.department_id AND actor_user_id=g.chairman_user_id AND actor_type::TEXT='USER' AND outcome::TEXT='SUCCESS'
    AND target_type='formative_activities_finalisation' AND xmin=pg_current_xact_id()::xid
    AND context_json = jsonb_build_object('finalisationId',g.id,'departmentId',g.department_id,'examinationId',g.examination_id,
      'examinationCourseId',g.examination_course_id,'courseOfferingId',g.course_offering_id,'committeeId',g.committee_id,
      'chairmanAssignmentId',g.chairman_assignment_id,'chairmanUserId',g.chairman_user_id,
      'chairmanAssignedAtSnapshot',to_char(g.chairman_assigned_at_snapshot,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'ruleVersionCode',g.rule_version_code,'activityCount',g.activity_count,'resultCount',g.result_count,
      'sourceFingerprint',g.source_fingerprint,'finalisedAt',to_char(g.finalised_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))<>1 THEN
    RAISE EXCEPTION 'Activities finalisation requires exactly one success audit' USING ERRCODE='23514'; END IF;
END;
$$;
CREATE UNIQUE INDEX formative_final_success_audit_uq ON audit_logs(target_id) WHERE action='formative.activities.chairman-finalised' AND outcome='SUCCESS';
CREATE FUNCTION formative_final_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent TEXT;
BEGIN
  IF TG_TABLE_NAME='formative_activities_finalisations' THEN parent:=NEW.id;
  ELSIF TG_TABLE_NAME='formative_activities_final_results' THEN parent:=NEW.finalisation_id;
  ELSE SELECT finalisation_id INTO parent FROM formative_activities_final_results WHERE id=NEW.result_id; END IF;
  PERFORM formative_final_validate(parent); RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER formative_final_complete AFTER INSERT ON formative_activities_finalisations
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION formative_final_complete();

CREATE CONSTRAINT TRIGGER formative_final_result_complete AFTER INSERT ON formative_activities_final_results
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION formative_final_complete();
CREATE CONSTRAINT TRIGGER formative_final_source_complete AFTER INSERT ON formative_activities_final_source_items
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION formative_final_complete();

CREATE FUNCTION formative_final_child_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent TEXT;
BEGIN
  IF TG_TABLE_NAME='formative_activities_final_results' THEN parent := NEW.finalisation_id;
  ELSE SELECT finalisation_id INTO parent FROM formative_activities_final_results WHERE id=NEW.result_id; END IF;
  IF NOT EXISTS(SELECT 1 FROM formative_activities_finalisations WHERE id=parent AND xmin=pg_current_xact_id()::xid) THEN
    RAISE EXCEPTION 'Activities children require their new batch' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER formative_final_result_insert BEFORE INSERT ON formative_activities_final_results FOR EACH ROW EXECUTE FUNCTION formative_final_child_insert();
CREATE TRIGGER formative_final_source_insert BEFORE INSERT ON formative_activities_final_source_items FOR EACH ROW EXECUTE FUNCTION formative_final_child_insert();
CREATE TRIGGER formative_final_immutable BEFORE UPDATE OR DELETE ON formative_activities_finalisations FOR EACH ROW EXECUTE FUNCTION formative_activity_package_immutable();
CREATE TRIGGER formative_final_result_immutable BEFORE UPDATE OR DELETE ON formative_activities_final_results FOR EACH ROW EXECUTE FUNCTION formative_activity_package_immutable();
CREATE TRIGGER formative_final_source_immutable BEFORE UPDATE OR DELETE ON formative_activities_final_source_items FOR EACH ROW EXECUTE FUNCTION formative_activity_package_immutable();

CREATE FUNCTION formative_final_source_freeze() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE offering TEXT;
BEGIN
  IF TG_OP='DELETE' THEN offering:=OLD.course_offering_id; ELSE offering:=NEW.course_offering_id; END IF;
  UPDATE course_offerings SET id=id WHERE id=offering;
  IF EXISTS(SELECT 1 FROM formative_activities_finalisations WHERE course_offering_id=offering) THEN
    RAISE EXCEPTION 'Finalised Activities sources are frozen' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$;
CREATE TRIGGER formative_final_mark_freeze BEFORE INSERT ON formative_mark_evidence FOR EACH ROW EXECUTE FUNCTION formative_final_source_freeze();
CREATE TRIGGER formative_final_submission_freeze BEFORE INSERT ON formative_activity_submissions FOR EACH ROW EXECUTE FUNCTION formative_final_source_freeze();
CREATE TRIGGER formative_final_activity_freeze BEFORE INSERT OR UPDATE OR DELETE ON formative_activities FOR EACH ROW EXECUTE FUNCTION formative_final_source_freeze();

CREATE FUNCTION formative_final_enrollment_freeze() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE offering TEXT; prior JSONB; current_row JSONB;
BEGIN
  prior:=to_jsonb(OLD); current_row:=to_jsonb(NEW);
  -- Every roster writer shares the offering write mutex, including departures and direct SQL.
  FOR offering IN SELECT v FROM unnest(ARRAY[prior->>'course_offering_id',current_row->>'course_offering_id']) v WHERE v IS NOT NULL GROUP BY v ORDER BY v COLLATE "C" LOOP
    UPDATE course_offerings SET id=id WHERE id=offering;
  END LOOP;
  IF TG_OP='UPDATE' AND (OLD.status,OLD.archived_at) IS DISTINCT FROM (NEW.status,NEW.archived_at)
    AND EXISTS(SELECT 1 FROM formative_activities_finalisations WHERE course_offering_id=OLD.course_offering_id AND xmin=pg_current_xact_id()::xid) THEN
    RAISE EXCEPTION 'Finalised Activities roster cannot change in its finalisation transaction' USING ERRCODE='23514'; END IF;
  IF TG_OP<>'INSERT' AND EXISTS(SELECT 1 FROM formative_activities_final_results WHERE enrollment_id=OLD.id) THEN
    -- Canonical EnrollmentStatus departure states only; this does not create a new lifecycle.
    IF TG_OP='UPDATE' AND (NEW.status::TEXT NOT IN ('APPROVED','DROPPED','WITHDRAWN','ARCHIVED')
      OR (OLD.status::TEXT<>'APPROVED' AND NEW.status::TEXT='APPROVED')
      OR (OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL)) THEN
      RAISE EXCEPTION 'Finalised Activities enrollment lifecycle cannot regress' USING ERRCODE='23514'; END IF;
    IF TG_OP='DELETE' OR (prior->>'id',prior->>'department_id',prior->>'course_offering_id',prior->>'student_user_id',prior->>'academic_term_id',prior->>'curriculum_course_id',prior->>'student_curriculum_assignment_id')
      IS DISTINCT FROM (current_row->>'id',current_row->>'department_id',current_row->>'course_offering_id',current_row->>'student_user_id',current_row->>'academic_term_id',current_row->>'curriculum_course_id',current_row->>'student_curriculum_assignment_id') THEN
      RAISE EXCEPTION 'Finalised Activities enrollment identity is frozen' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_OP<>'DELETE' AND NEW.status::TEXT='APPROVED' AND NEW.archived_at IS NULL
    AND EXISTS(SELECT 1 FROM formative_activities_finalisations WHERE course_offering_id=NEW.course_offering_id)
    AND (TG_OP='INSERT' OR prior->>'status' IS DISTINCT FROM 'APPROVED' OR prior->>'archived_at' IS NOT NULL
      OR prior->>'course_offering_id' IS DISTINCT FROM NEW.course_offering_id
      OR NOT EXISTS(SELECT 1 FROM formative_activities_final_results r JOIN formative_activities_finalisations g ON g.id=r.finalisation_id
        WHERE g.course_offering_id=NEW.course_offering_id AND r.enrollment_id=NEW.id AND r.student_user_id=NEW.student_user_id)) THEN
    RAISE EXCEPTION 'Finalised Activities roster cannot expand or reactivate' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$;
CREATE TRIGGER formative_final_enrollment_freeze BEFORE INSERT OR UPDATE OR DELETE ON enrollments FOR EACH ROW EXECUTE FUNCTION formative_final_enrollment_freeze();

-- Freeze only academic identity/configuration; capacity, deadlines and downstream Summative state remain operational.
CREATE FUNCTION formative_final_identity_freeze() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fields TEXT[]; prior JSONB:=to_jsonb(OLD); revised JSONB:=to_jsonb(NEW); field TEXT; changed BOOLEAN:=TG_OP='DELETE'; frozen BOOLEAN; offering TEXT;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'course_offerings' THEN fields:=ARRAY['id','department_id','course_id','academic_term_id','student_batch_id','curriculum_course_id','syllabus_version_id'];
    WHEN 'examination_courses' THEN fields:=ARRAY['id','department_id','examination_id','course_offering_id','academic_program_id','academic_session_id','academic_term_id','student_batch_id','curriculum_version_id','curriculum_course_id','syllabus_version_id','assessment_template_id'];
    WHEN 'examinations' THEN fields:=ARRAY['id','department_id','academic_program_id','academic_session_id','academic_term_id'];
    WHEN 'curriculum_courses' THEN fields:=ARRAY['id','department_id','course_id','curriculum_version_id','assessment_template_id'];
    WHEN 'course_assessment_templates' THEN fields:=ARRAY['id','department_id','version_number','total_marks','archived_at'];
    WHEN 'assessment_template_components' THEN fields:=ARRAY['id','department_id','assessment_template_id','code','maximum_marks','is_required'];
  END CASE;
  FOREACH field IN ARRAY fields LOOP changed:=changed OR prior->field IS DISTINCT FROM revised->field; END LOOP;
  IF NOT changed THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME<>'course_offerings' THEN
    FOR offering IN SELECT o.id FROM course_offerings o LEFT JOIN curriculum_courses cc ON cc.id=o.curriculum_course_id
      WHERE CASE TG_TABLE_NAME
        WHEN 'examination_courses' THEN o.id IN (prior->>'course_offering_id',revised->>'course_offering_id')
        WHEN 'examinations' THEN EXISTS(SELECT 1 FROM examination_courses ec WHERE ec.course_offering_id=o.id AND ec.examination_id=OLD.id)
        WHEN 'curriculum_courses' THEN cc.id=OLD.id
        WHEN 'course_assessment_templates' THEN cc.assessment_template_id=OLD.id
        WHEN 'assessment_template_components' THEN cc.assessment_template_id IN (prior->>'assessment_template_id',revised->>'assessment_template_id')
      END ORDER BY o.id COLLATE "C" LOOP
      UPDATE course_offerings SET id=id WHERE id=offering;
    END LOOP;
  END IF;
  SELECT EXISTS(SELECT 1 FROM formative_activities_finalisations g JOIN examination_courses ec ON ec.id=g.examination_course_id
    WHERE CASE TG_TABLE_NAME
      WHEN 'course_offerings' THEN g.course_offering_id=OLD.id
      WHEN 'examination_courses' THEN g.examination_course_id=OLD.id
      WHEN 'examinations' THEN g.examination_id=OLD.id
      WHEN 'curriculum_courses' THEN ec.curriculum_course_id=OLD.id
      WHEN 'course_assessment_templates' THEN ec.assessment_template_id=OLD.id
      WHEN 'assessment_template_components' THEN ec.assessment_template_id IN (prior->>'assessment_template_id',revised->>'assessment_template_id')
    END) INTO frozen;
  IF frozen THEN RAISE EXCEPTION 'Finalised Activities academic identity is frozen' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$;
CREATE TRIGGER formative_final_offering_identity BEFORE UPDATE OR DELETE ON course_offerings FOR EACH ROW EXECUTE FUNCTION formative_final_identity_freeze();
CREATE TRIGGER formative_final_course_identity BEFORE UPDATE OR DELETE ON examination_courses FOR EACH ROW EXECUTE FUNCTION formative_final_identity_freeze();
CREATE TRIGGER formative_final_exam_identity BEFORE UPDATE OR DELETE ON examinations FOR EACH ROW EXECUTE FUNCTION formative_final_identity_freeze();
CREATE TRIGGER formative_final_curriculum_identity BEFORE UPDATE OR DELETE ON curriculum_courses FOR EACH ROW EXECUTE FUNCTION formative_final_identity_freeze();
CREATE TRIGGER formative_final_template_identity BEFORE UPDATE OR DELETE ON course_assessment_templates FOR EACH ROW EXECUTE FUNCTION formative_final_identity_freeze();
CREATE TRIGGER formative_final_component_identity BEFORE UPDATE OR DELETE ON assessment_template_components FOR EACH ROW EXECUTE FUNCTION formative_final_identity_freeze();

CREATE FUNCTION formative_final_component_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE offering TEXT;
BEGIN
  FOR offering IN SELECT o.id FROM course_offerings o JOIN curriculum_courses cc ON cc.id=o.curriculum_course_id
    WHERE cc.assessment_template_id=NEW.assessment_template_id ORDER BY o.id COLLATE "C" LOOP
    UPDATE course_offerings SET id=id WHERE id=offering;
  END LOOP;
  PERFORM id FROM course_assessment_templates WHERE id=NEW.assessment_template_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM formative_activities_finalisations g JOIN examination_courses ec ON ec.id=g.examination_course_id
    WHERE ec.assessment_template_id=NEW.assessment_template_id) THEN
    RAISE EXCEPTION 'Finalised Activities academic identity is frozen' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER formative_final_component_insert BEFORE INSERT ON assessment_template_components FOR EACH ROW EXECUTE FUNCTION formative_final_component_insert();

-- The success record is academic transaction evidence too; it cannot be removed or rewritten later.
CREATE FUNCTION formative_final_audit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP<>'INSERT' AND OLD.action='formative.activities.chairman-finalised' THEN
    RAISE EXCEPTION 'Activities finalisation audit is immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND NEW.action='formative.activities.chairman-finalised' THEN
    RAISE EXCEPTION 'Activities finalisation audit must be inserted' USING ERRCODE='23514'; END IF;
  IF TG_OP<>'DELETE' AND NEW.action='formative.activities.chairman-finalised' AND NOT EXISTS(
    SELECT 1 FROM formative_activities_finalisations WHERE id=NEW.target_id AND xmin=pg_current_xact_id()::xid) THEN
    RAISE EXCEPTION 'Activities audit requires its new batch' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$;
CREATE TRIGGER formative_final_audit_guard BEFORE INSERT OR UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION formative_final_audit_guard();
-- Retire appointments normally, but do not rebind the historical authority instance.
CREATE FUNCTION formative_final_appointment_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bound BOOLEAN; fields TEXT[]; field TEXT; changed BOOLEAN:=false; offering TEXT;
BEGIN
  IF TG_TABLE_NAME='examination_committee_assignments' THEN
    SELECT EXISTS(SELECT 1 FROM formative_activities_finalisations WHERE chairman_assignment_id=OLD.id) INTO bound;
    fields:=ARRAY['id','department_id','examination_id','committee_id','assigned_user_id','seat','assigned_at','external_member_name','external_member_affiliation'];
  ELSE
    SELECT EXISTS(SELECT 1 FROM formative_activities_final_source_items si
      JOIN formative_activity_submissions p ON p.id=si.submission_id JOIN formative_mark_evidence m ON m.id=si.mark_evidence_id
      WHERE p.teacher_assignment_id=OLD.id OR m.teacher_assignment_id=OLD.id) INTO bound;
    fields:=ARRAY['id','department_id','course_offering_id','teacher_user_id','assigned_at'];
  END IF;
  FOREACH field IN ARRAY fields LOOP
    changed:=changed OR to_jsonb(OLD)->field IS DISTINCT FROM to_jsonb(NEW)->field;
  END LOOP;
  IF NOT changed THEN RETURN NEW; END IF;
  FOR offering IN SELECT o.id FROM course_offerings o WHERE
    (TG_TABLE_NAME='teacher_course_assignments' AND o.id=to_jsonb(OLD)->>'course_offering_id') OR
    (TG_TABLE_NAME='examination_committee_assignments' AND EXISTS(SELECT 1 FROM examination_courses ec
      WHERE ec.course_offering_id=o.id AND ec.examination_id=to_jsonb(OLD)->>'examination_id'))
    ORDER BY o.id COLLATE "C" LOOP
    UPDATE course_offerings SET id=id WHERE id=offering;
  END LOOP;
  -- Re-read after the mutex, including a finalisation that committed while this writer waited.
  IF TG_TABLE_NAME='examination_committee_assignments' THEN
    SELECT EXISTS(SELECT 1 FROM formative_activities_finalisations WHERE chairman_assignment_id=OLD.id) INTO bound;
  ELSE
    SELECT EXISTS(SELECT 1 FROM formative_activities_final_source_items si
      JOIN formative_activity_submissions p ON p.id=si.submission_id JOIN formative_mark_evidence m ON m.id=si.mark_evidence_id
      WHERE p.teacher_assignment_id=OLD.id OR m.teacher_assignment_id=OLD.id) INTO bound;
  END IF;
  IF bound THEN
    FOREACH field IN ARRAY fields LOOP
      IF to_jsonb(OLD)->field IS DISTINCT FROM to_jsonb(NEW)->field THEN
        RAISE EXCEPTION 'Finalised Activities authority identity is frozen' USING ERRCODE='23514'; END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER formative_final_chairman_identity BEFORE UPDATE ON examination_committee_assignments FOR EACH ROW EXECUTE FUNCTION formative_final_appointment_identity();
CREATE TRIGGER formative_final_teacher_identity BEFORE UPDATE ON teacher_course_assignments FOR EACH ROW EXECUTE FUNCTION formative_final_appointment_identity();
COMMIT;
