BEGIN;

CREATE TABLE formative_final_results (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL,
  examination_id TEXT NOT NULL,
  examination_course_id TEXT NOT NULL,
  course_offering_id TEXT NOT NULL,
  enrollment_id TEXT NOT NULL,
  student_user_id TEXT NOT NULL,
  academic_program_id TEXT NOT NULL,
  academic_session_id TEXT NOT NULL,
  academic_term_id TEXT NOT NULL,
  student_batch_id TEXT NOT NULL,
  activities_finalisation_id TEXT NOT NULL,
  activities_result_id TEXT NOT NULL,
  attendance_generation_id TEXT NOT NULL,
  attendance_version_id TEXT NOT NULL,
  comprehensive_finalisation_id TEXT NOT NULL,
  comprehensive_result_id TEXT NOT NULL,
  activities_mark DECIMAL(10,6) NOT NULL,
  activities_full_mark DECIMAL(10,6) NOT NULL,
  attendance_mark DECIMAL(10,6) NOT NULL,
  attendance_full_mark DECIMAL(10,6) NOT NULL,
  comprehensive_mark DECIMAL(10,6) NOT NULL,
  comprehensive_full_mark DECIMAL(10,6) NOT NULL,
  mark DECIMAL(10,6) NOT NULL,
  full_mark DECIMAL(10,6) NOT NULL,
  rule_version_code VARCHAR(64) NOT NULL,
  provenance_json JSONB NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ff_examination_fk FOREIGN KEY (examination_id,department_id,academic_program_id,academic_session_id,academic_term_id) REFERENCES examinations(id,department_id,academic_program_id,academic_session_id,academic_term_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ff_examination_course_fk FOREIGN KEY (examination_course_id,department_id,examination_id,course_offering_id) REFERENCES examination_courses(id,department_id,examination_id,course_offering_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ff_offering_fk FOREIGN KEY (course_offering_id,department_id,student_batch_id,academic_term_id) REFERENCES course_offerings(id,department_id,student_batch_id,academic_term_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ff_enrollment_fk FOREIGN KEY (enrollment_id,department_id,course_offering_id,student_user_id) REFERENCES enrollments(id,department_id,course_offering_id,student_user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ff_activities_finalisation_fk FOREIGN KEY (activities_finalisation_id) REFERENCES formative_activities_finalisations(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ff_activities_result_fk FOREIGN KEY (activities_result_id) REFERENCES formative_activities_final_results(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ff_attendance_generation_fk FOREIGN KEY (attendance_generation_id) REFERENCES formative_attendance_generations(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ff_attendance_version_fk FOREIGN KEY (attendance_version_id) REFERENCES formative_attendance_versions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ff_comprehensive_finalisation_fk FOREIGN KEY (comprehensive_finalisation_id) REFERENCES comprehensive_finalisations(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ff_comprehensive_result_fk FOREIGN KEY (comprehensive_result_id) REFERENCES comprehensive_final_results(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ff_context_uq UNIQUE(department_id,examination_course_id,enrollment_id),
  CONSTRAINT ff_marks_ck CHECK(activities_mark BETWEEN 0 AND 30 AND activities_full_mark=30
    AND attendance_mark BETWEEN 0 AND 5 AND attendance_full_mark=5
    AND comprehensive_mark BETWEEN 0 AND 5 AND comprehensive_full_mark=5
    AND mark BETWEEN 0 AND 40 AND full_mark=40 AND mark=activities_mark+attendance_mark+comprehensive_mark),
  CONSTRAINT ff_rule_ck CHECK(rule_version_code='FINAL_FORMATIVE_40_SUM_V1')
);
CREATE INDEX ff_exam_idx ON formative_final_results(department_id,examination_id);
CREATE INDEX ff_student_idx ON formative_final_results(department_id,student_user_id);

-- Intentionally shared read contract over authoritative component boundaries only.
-- Never calls the raw Activities/Attendance calculators or the Comprehensive averaging function.
CREATE FUNCTION final_formative_sources(dept TEXT, course TEXT, enrollment TEXT) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE ec examination_courses; x examinations; e enrollments; o course_offerings;
  af formative_activities_finalisations; ar formative_activities_final_results;
  ag formative_attendance_generations; av formative_attendance_versions;
  ce comprehensive_examinations; cf comprehensive_finalisations; cr comprehensive_final_results;
  cc examination_candidate_courses; reg examination_candidate_registrations; list examination_candidate_lists;
  roster comprehensive_roster_entries; co comprehensive_courses;
  activity_sources JSONB; comprehensive_sources JSONB; n INTEGER;
BEGIN
  SELECT * INTO ec FROM examination_courses WHERE id=course AND department_id=dept;
  IF NOT FOUND THEN RAISE EXCEPTION 'Final Formative context not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO x FROM examinations WHERE id=ec.examination_id AND department_id=dept;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid Final Formative academic scope' USING ERRCODE='23514'; END IF;
  SELECT * INTO e FROM enrollments WHERE id=enrollment AND department_id=dept AND course_offering_id=ec.course_offering_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Final Formative context not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO o FROM course_offerings WHERE id=ec.course_offering_id AND department_id=dept;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid Final Formative academic scope' USING ERRCODE='23514'; END IF;

  -- Resolve broadly first. A conflicting owner/scope must not disappear behind a tenant filter.
  IF (SELECT count(*) FROM formative_activities_finalisations WHERE course_offering_id=o.id OR examination_course_id=ec.id)>1
    OR (SELECT count(*) FROM formative_attendance_generations WHERE examination_id=x.id)>1
    OR (SELECT count(*) FROM comprehensive_examinations WHERE examination_id=x.id
      OR id IN (SELECT comprehensive_id FROM comprehensive_courses WHERE examination_course_id=ec.id))>1 THEN
    RAISE EXCEPTION 'Duplicate Final Formative authoritative source' USING ERRCODE='23514'; END IF;
  SELECT * INTO af FROM formative_activities_finalisations WHERE course_offering_id=o.id OR examination_course_id=ec.id;
  IF FOUND AND (af.department_id<>dept OR af.examination_id<>x.id OR af.examination_course_id<>ec.id OR af.course_offering_id<>o.id
    OR af.rule_version_code<>'FORMATIVE_ACTIVITIES_FINAL_30_SUM_V1' OR af.activity_count<=0 OR af.result_count<=0
    OR af.source_fingerprint !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'Invalid Final Formative Activities source' USING ERRCODE='23514'; END IF;
  SELECT * INTO ag FROM formative_attendance_generations WHERE examination_id=x.id;
  IF ag.id IS NULL AND EXISTS(SELECT 1 FROM formative_attendance_versions
    WHERE examination_course_id=ec.id AND generation_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Invalid Final Formative Attendance source' USING ERRCODE='23514'; END IF;
  IF ag.id IS NOT NULL AND (ag.department_id<>dept OR ag.academic_program_id<>x.academic_program_id
    OR ag.academic_session_id<>x.academic_session_id OR ag.academic_term_id<>x.academic_term_id
    OR ag.rule_version_code<>'FORMATIVE_ATTENDANCE_5_APPROVED_20260920_V1' OR ag.source_fingerprint !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'Invalid Final Formative Attendance source' USING ERRCODE='23514'; END IF;
  SELECT * INTO ce FROM comprehensive_examinations WHERE examination_id=x.id
    OR id IN (SELECT comprehensive_id FROM comprehensive_courses WHERE examination_course_id=ec.id);
  IF ce.id IS NOT NULL AND (ce.examination_id<>x.id OR ce.department_id<>dept) THEN
    RAISE EXCEPTION 'Invalid Final Formative Comprehensive source' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*) FROM comprehensive_finalisations WHERE comprehensive_id=ce.id)>1 THEN
    RAISE EXCEPTION 'Duplicate Final Formative authoritative source' USING ERRCODE='23514'; END IF;
  SELECT * INTO cf FROM comprehensive_finalisations WHERE comprehensive_id=ce.id;
  IF cf.id IS NOT NULL AND (ce.department_id<>dept OR cf.department_id<>dept OR ce.status::text<>'FINALISED'
    OR ce.finalised_at IS NULL OR ce.roster_locked_at IS NULL OR ce.marking_started_at IS NULL
    OR ce.finalised_at IS DISTINCT FROM cf.created_at OR cf.mode IS DISTINCT FROM ce.mode
    OR cf.rule_version_code IS DISTINCT FROM ce.rule_version_code) THEN
    RAISE EXCEPTION 'Invalid Final Formative Comprehensive source' USING ERRCODE='23514'; END IF;
  IF ce.status::text='FINALISED' AND cf.id IS NULL THEN
    RAISE EXCEPTION 'Missing final Comprehensive package' USING ERRCODE='23514'; END IF;
  IF af.id IS NULL OR ag.id IS NULL OR cf.id IS NULL THEN RETURN NULL; END IF;
  IF ag.result_count<=0 OR (SELECT count(*) FROM formative_attendance_versions WHERE generation_id=ag.id)<>ag.result_count
    OR cf.version<=0 OR (SELECT count(*) FROM comprehensive_final_results WHERE finalisation_id=cf.id)<>
      (SELECT count(*) FROM comprehensive_roster_entries WHERE comprehensive_id=ce.id) THEN
    RAISE EXCEPTION 'Incomplete Final Formative authoritative package' USING ERRCODE='23514'; END IF;
  IF ec.academic_program_id IS DISTINCT FROM x.academic_program_id
    OR ec.academic_session_id IS DISTINCT FROM x.academic_session_id OR ec.academic_term_id IS DISTINCT FROM x.academic_term_id
    OR e.academic_term_id IS DISTINCT FROM x.academic_term_id OR o.academic_term_id IS DISTINCT FROM x.academic_term_id
    OR ec.student_batch_id IS NULL OR ec.student_batch_id IS DISTINCT FROM o.student_batch_id
    OR ec.curriculum_course_id IS DISTINCT FROM o.curriculum_course_id OR e.curriculum_course_id IS DISTINCT FROM ec.curriculum_course_id
    OR ec.syllabus_version_id IS DISTINCT FROM o.syllabus_version_id
    OR NOT EXISTS(SELECT 1 FROM users WHERE id=e.student_user_id AND department_id=dept)
  THEN RAISE EXCEPTION 'Invalid Final Formative academic scope' USING ERRCODE='23514'; END IF;

  SELECT count(*) INTO n FROM examination_candidate_courses WHERE examination_course_id=ec.id AND enrollment_id=e.id;
  IF n>1 THEN RAISE EXCEPTION 'Duplicate Final Formative candidate source' USING ERRCODE='23514'; END IF;
  -- The current boundary is Regular only. Non-candidates have no expected Comprehensive source.
  IF n=0 THEN
    IF EXISTS(SELECT 1 FROM comprehensive_roster_entries r
      JOIN examination_candidate_registrations registration ON registration.id=r.registration_id
      JOIN comprehensive_courses c ON c.id=r.course_id
      WHERE r.comprehensive_id=ce.id AND c.examination_course_id=ec.id AND registration.student_user_id=e.student_user_id) THEN
      RAISE EXCEPTION 'Invalid Final Formative candidate provenance' USING ERRCODE='23514'; END IF;
    RETURN NULL;
  END IF;
  SELECT * INTO cc FROM examination_candidate_courses WHERE examination_course_id=ec.id AND enrollment_id=e.id;
  SELECT * INTO reg FROM examination_candidate_registrations WHERE id=cc.registration_id;
  IF reg.category::text<>'REGULAR' THEN RETURN NULL; END IF;
  SELECT * INTO list FROM examination_candidate_lists WHERE id=reg.list_id;
  IF reg.id IS NULL OR list.id IS NULL OR cc.department_id<>dept OR reg.department_id<>dept OR reg.student_user_id<>e.student_user_id
    OR reg.examination_id<>x.id OR list.id IS DISTINCT FROM ce.candidate_list_id OR list.department_id<>dept
    OR list.examination_id<>x.id OR list.status::text<>'CERTIFIED'
    OR list.academic_program_id<>x.academic_program_id OR list.academic_session_id<>x.academic_session_id
    OR list.academic_term_id<>x.academic_term_id OR reg.curriculum_assignment_id IS DISTINCT FROM e.student_curriculum_assignment_id
    OR NOT EXISTS(SELECT 1 FROM student_curriculum_assignments s WHERE s.id=reg.curriculum_assignment_id
      AND s.department_id=dept AND s.student_user_id=e.student_user_id AND s.academic_program_id=x.academic_program_id
      AND s.curriculum_version_id=ec.curriculum_version_id)
  THEN RAISE EXCEPTION 'Invalid Final Formative candidate provenance' USING ERRCODE='23514'; END IF;

  SELECT count(*) INTO n FROM formative_activities_final_results WHERE finalisation_id=af.id AND enrollment_id=e.id;
  IF n<>1 THEN RAISE EXCEPTION 'Invalid Final Formative Activities result package' USING ERRCODE='23514'; END IF;
  SELECT * INTO ar FROM formative_activities_final_results WHERE finalisation_id=af.id AND enrollment_id=e.id;
  IF ar.student_user_id<>e.student_user_id OR ar.full_mark<>30 OR NOT(ar.mark BETWEEN 0 AND 30)
    OR ar.source_fingerprint !~ '^[0-9a-f]{64}$'
    OR (SELECT count(*) FROM formative_activities_final_results WHERE finalisation_id=af.id)<>af.result_count
    OR (SELECT count(*) FROM formative_activities_final_source_items WHERE result_id=ar.id)<>af.activity_count
    OR EXISTS(SELECT 1 FROM formative_activities_final_source_items s
      LEFT JOIN formative_activity_submissions p ON p.id=s.submission_id
      LEFT JOIN formative_activity_submission_items i ON i.id=s.submission_item_id
      WHERE s.result_id=ar.id AND (p.id IS NULL OR i.id IS NULL OR p.department_id<>dept
        OR p.course_offering_id<>o.id OR p.activity_id<>s.activity_id OR p.version<>s.submission_version
        OR p.source_fingerprint<>s.submission_fingerprint OR i.submission_id<>p.id OR i.enrollment_id<>e.id
        OR i.mark_evidence_id<>s.mark_evidence_id
        OR EXISTS(SELECT 1 FROM formative_activity_submissions newer WHERE newer.activity_id=p.activity_id AND newer.version>p.version)))
  THEN RAISE EXCEPTION 'Invalid Final Formative Activities result package' USING ERRCODE='23514'; END IF;
  SELECT jsonb_agg(jsonb_build_object('id',id,'activityId',activity_id,'submissionId',submission_id,
    'submissionVersion',submission_version,'submissionFingerprint',submission_fingerprint,
    'submissionItemId',submission_item_id,'markEvidenceId',mark_evidence_id) ORDER BY id COLLATE "C")
    INTO activity_sources FROM formative_activities_final_source_items WHERE result_id=ar.id;

  SELECT count(*) INTO n FROM formative_attendance_versions WHERE generation_id=ag.id AND enrollment_id=e.id;
  IF n<>1 THEN RAISE EXCEPTION 'Invalid Final Formative generated Attendance package' USING ERRCODE='23514'; END IF;
  SELECT * INTO av FROM formative_attendance_versions WHERE generation_id=ag.id AND enrollment_id=e.id;
  IF av.department_id<>dept OR av.student_user_id<>e.student_user_id OR av.course_offering_id<>o.id
    OR av.examination_id IS DISTINCT FROM x.id OR av.examination_course_id IS DISTINCT FROM ec.id
    OR av.academic_term_id<>x.academic_term_id OR av.student_batch_id<>ec.student_batch_id
    OR av.rule_version_code<>ag.rule_version_code OR av.status<>'READY' OR av.mark IS NULL
    OR NOT(av.mark BETWEEN 0 AND 5) OR av.diagnostics_json<>'[]'::jsonb
    OR av.source_fingerprint !~ '^[0-9a-f]{64}$' OR av.conducted_count<=0 OR av.revision<=0
    OR av.actor_user_id<>ag.chairman_user_id OR av.coordinator_assignment_id IS NOT NULL
    OR (SELECT count(*) FROM formative_attendance_source_items WHERE version_id=av.id)<>av.conducted_count
    OR EXISTS(SELECT 1 FROM formative_attendance_versions newer WHERE newer.enrollment_id=e.id AND newer.revision>av.revision)
    OR EXISTS(SELECT 1 FROM formative_attendance_transitions WHERE version_id=av.id)
  THEN RAISE EXCEPTION 'Invalid Final Formative generated Attendance package' USING ERRCODE='23514'; END IF;

  SELECT count(*) INTO n FROM comprehensive_roster_entries WHERE comprehensive_id=ce.id AND candidate_course_id=cc.id;
  IF n<>1 THEN RAISE EXCEPTION 'Invalid Final Formative Comprehensive roster' USING ERRCODE='23514'; END IF;
  SELECT * INTO roster FROM comprehensive_roster_entries WHERE comprehensive_id=ce.id AND candidate_course_id=cc.id;
  SELECT * INTO co FROM comprehensive_courses WHERE id=roster.course_id;
  SELECT count(*) INTO n FROM comprehensive_final_results WHERE roster_entry_id=roster.id;
  IF n<>1 THEN RAISE EXCEPTION 'Invalid Final Formative Comprehensive result package' USING ERRCODE='23514'; END IF;
  SELECT * INTO cr FROM comprehensive_final_results WHERE roster_entry_id=roster.id;
  IF co.id IS NULL OR roster.department_id<>dept OR roster.registration_id<>reg.id OR roster.registration_version<>reg.version
    OR co.department_id<>dept OR co.comprehensive_id<>ce.id OR co.examination_course_id<>ec.id
    OR co.full_mark<>5 OR co.template_version<=0 OR cr.department_id<>dept OR cr.finalisation_id<>cf.id OR cr.full_mark<>5
    OR cr.calculation_rule<>'COMPREHENSIVE_EXACT_DECIMAL_V1' OR NOT(cr.mark BETWEEN 0 AND 5)
    OR (SELECT count(*) FROM comprehensive_final_sources WHERE result_id=cr.id)<>
      (CASE WHEN cf.mode::text='ALL_MEMBERS_AVERAGE' THEN 4 ELSE 1 END)
    OR (SELECT count(DISTINCT m.seat) FROM comprehensive_final_sources s JOIN comprehensive_marks m ON m.id=s.mark_id
      WHERE s.result_id=cr.id)<> (CASE WHEN cf.mode::text='ALL_MEMBERS_AVERAGE' THEN 4 ELSE 1 END)
    OR EXISTS(SELECT 1 FROM comprehensive_final_sources s LEFT JOIN comprehensive_marks m ON m.id=s.mark_id
      WHERE s.result_id=cr.id AND (m.id IS NULL OR s.department_id<>dept OR m.department_id<>dept
        OR m.roster_entry_id<>roster.id OR m.status::text<>'SUBMITTED' OR m.full_mark<>5
        OR (cf.mode::text='CHAIRMAN_ONLY' AND m.seat::text<>'CHAIRMAN')
        OR (cf.mode::text='COURSE_DISTRIBUTED' AND m.committee_assignment_id IS DISTINCT FROM co.assigned_committee_assignment_id)
        OR EXISTS(SELECT 1 FROM comprehensive_marks newer WHERE newer.roster_entry_id=m.roster_entry_id AND newer.seat=m.seat AND newer.revision>m.revision)
        OR EXISTS(SELECT 1 FROM comprehensive_mark_returns WHERE mark_id=m.id)))
  THEN RAISE EXCEPTION 'Invalid Final Formative Comprehensive result package' USING ERRCODE='23514'; END IF;
  SELECT jsonb_agg(jsonb_build_object('id',id,'markId',mark_id) ORDER BY id COLLATE "C") INTO comprehensive_sources
    FROM comprehensive_final_sources WHERE result_id=cr.id;

  RETURN jsonb_build_object('departmentId',dept,'examinationId',x.id,'examinationCourseId',ec.id,
    'courseOfferingId',o.id,'enrollmentId',e.id,'studentUserId',e.student_user_id,
    'academicProgramId',x.academic_program_id,'academicSessionId',x.academic_session_id,'academicTermId',x.academic_term_id,
    'studentBatchId',ec.student_batch_id,'activitiesFinalisationId',af.id,'activitiesResultId',ar.id,
    'attendanceGenerationId',ag.id,'attendanceVersionId',av.id,'comprehensiveFinalisationId',cf.id,'comprehensiveResultId',cr.id,
    'activitiesMark',ar.mark::text,'activitiesFullMark',ar.full_mark::text,'attendanceMark',av.mark::text,'attendanceFullMark','5.00',
    'comprehensiveMark',cr.mark::text,'comprehensiveFullMark',cr.full_mark::text,
    'provenanceJson',jsonb_build_object('activitiesRule',af.rule_version_code,'activitiesFingerprint',ar.source_fingerprint,
      'activitiesFinalisationFingerprint',af.source_fingerprint,'activitiesSources',activity_sources,
      'attendanceRule',ag.rule_version_code,'attendanceRevision',av.revision,'attendanceFingerprint',av.source_fingerprint,
      'attendanceGenerationFingerprint',ag.source_fingerprint,'comprehensiveRule',cf.rule_version_code,
      'comprehensiveCalculationRule',cr.calculation_rule,'comprehensiveVersion',cf.version,'comprehensiveSources',comprehensive_sources,
      'candidateCourseId',cc.id,'registrationId',reg.id,'registrationVersion',reg.version,'rosterEntryId',roster.id,
      'curriculumAssignmentId',reg.curriculum_assignment_id,'curriculumVersionId',ec.curriculum_version_id,
      'curriculumCourseId',ec.curriculum_course_id,'syllabusVersionId',ec.syllabus_version_id,
      'assessmentTemplateId',ec.assessment_template_id,'comprehensiveTemplateVersion',co.template_version));
END;
$$;

-- Canonical JSON projection permits exact provenance comparison without numeric text-scale ambiguity.
CREATE FUNCTION final_formative_matches(target TEXT, sources JSONB) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE g formative_final_results; key TEXT; value JSONB; column_name TEXT;
BEGIN
  SELECT * INTO g FROM formative_final_results WHERE id=target;
  IF NOT FOUND OR sources IS NULL THEN RETURN false; END IF;
  FOR key,value IN SELECT * FROM jsonb_each(sources) LOOP
    column_name := lower(regexp_replace(key,'([A-Z])','_\1','g'));
    IF key IN ('activitiesMark','activitiesFullMark','attendanceMark','attendanceFullMark','comprehensiveMark','comprehensiveFullMark') THEN
      IF (to_jsonb(g)->>column_name)::numeric IS DISTINCT FROM (value#>>'{}')::numeric THEN RETURN false; END IF;
    ELSE
      IF to_jsonb(g)->column_name IS DISTINCT FROM value THEN RETURN false; END IF;
    END IF;
  END LOOP;
  RETURN g.rule_version_code='FINAL_FORMATIVE_40_SUM_V1' AND g.full_mark=40
    AND g.mark=g.activities_mark+g.attendance_mark+g.comprehensive_mark;
END;
$$;

CREATE FUNCTION final_formative_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Authoritative Final Formative evidence is immutable' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER ff_immutable BEFORE UPDATE OR DELETE ON formative_final_results FOR EACH ROW EXECUTE FUNCTION final_formative_immutable();

CREATE FUNCTION final_formative_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('transaction_isolation')<>'serializable' THEN
    RAISE EXCEPTION 'Final Formative requires a Serializable transaction' USING ERRCODE='23514'; END IF;
  UPDATE examinations SET id=id WHERE id=NEW.examination_id AND department_id=NEW.department_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Final Formative context not found' USING ERRCODE='P0002'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ff_insert BEFORE INSERT ON formative_final_results FOR EACH ROW EXECUTE FUNCTION final_formative_insert();

CREATE FUNCTION final_formative_validate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sources JSONB; expected JSONB;
BEGIN
  sources := final_formative_sources(NEW.department_id,NEW.examination_course_id,NEW.enrollment_id);
  IF NOT final_formative_matches(NEW.id,sources) THEN
    RAISE EXCEPTION 'Invalid Final Formative source package' USING ERRCODE='23514'; END IF;
  expected := sources || jsonb_build_object('aggregateId',NEW.id,'ruleVersionCode',NEW.rule_version_code,
    'mark',NEW.mark::text,'fullMark','40.00');
  IF (SELECT count(*) FROM audit_logs WHERE action='formative.final.materialised' AND target_id=NEW.id)<>1
    OR NOT EXISTS(SELECT 1 FROM audit_logs WHERE action='formative.final.materialised' AND target_id=NEW.id
      AND target_type='formative_final_result' AND department_id=NEW.department_id AND actor_type::text='SERVICE'
      AND actor_user_id IS NULL AND outcome::text='SUCCESS' AND context_json=expected
      AND xmin=pg_current_xact_id()::xid) THEN
    RAISE EXCEPTION 'Final Formative requires exactly one transaction-coupled success audit' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER ff_package_validate AFTER INSERT ON formative_final_results DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION final_formative_validate();

CREATE FUNCTION final_formative_audit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.action='formative.final.materialised' THEN
      PERFORM id FROM formative_final_results WHERE id=NEW.target_id AND department_id=NEW.department_id
        AND xmin=pg_current_xact_id()::xid;
      IF NOT FOUND OR EXISTS(SELECT 1 FROM audit_logs WHERE action=NEW.action AND target_id=NEW.target_id) THEN
        RAISE EXCEPTION 'Final Formative audit requires its new aggregate' USING ERRCODE='23514'; END IF;
    END IF;
  ELSIF TG_OP='UPDATE' THEN
    IF OLD.action='formative.final.materialised' OR NEW.action='formative.final.materialised' THEN
      RAISE EXCEPTION 'Final Formative audit is immutable' USING ERRCODE='23514'; END IF;
  ELSIF TG_OP='DELETE' THEN
    IF OLD.action='formative.final.materialised' THEN
      RAISE EXCEPTION 'Final Formative audit is immutable' USING ERRCODE='23514'; END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ff_audit_guard BEFORE INSERT OR UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION final_formative_audit_guard();

COMMIT;
