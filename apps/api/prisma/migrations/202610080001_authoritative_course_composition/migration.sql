BEGIN;

ALTER TABLE formative_final_results ADD CONSTRAINT ff_composition_scope_uq UNIQUE(id,department_id,examination_course_id,enrollment_id);
ALTER TABLE summative_chairman_approvals ADD CONSTRAINT sum_approval_composition_scope_uq UNIQUE(id,department_id,examination_id,examination_course_id,candidate_id,calculated_mark_id,calculated_mark_version_snapshot);

CREATE TABLE course_result_compositions (
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
  curriculum_assignment_id TEXT NOT NULL,
  curriculum_version_id TEXT NOT NULL,
  curriculum_course_id TEXT NOT NULL,
  syllabus_version_id TEXT NOT NULL,
  assessment_template_id TEXT NOT NULL,
  candidate_list_id TEXT NOT NULL,
  candidate_list_version INTEGER NOT NULL,
  registration_id TEXT NOT NULL,
  registration_version INTEGER NOT NULL,
  candidate_course_id TEXT NOT NULL,
  candidate_category TEXT NOT NULL,
  formative_result_id TEXT NOT NULL,
  summative_candidate_id TEXT NOT NULL,
  chairman_approval_id TEXT NOT NULL,
  calculated_mark_id TEXT NOT NULL,
  calculated_mark_version INTEGER NOT NULL,
  formative_rule TEXT NOT NULL,
  summative_rule TEXT NOT NULL,
  candidate_rule TEXT NOT NULL,
  formative_mark DECIMAL(10,6) NOT NULL,
  formative_full_mark DECIMAL(10,6) NOT NULL,
  summative_mark DECIMAL(10,6) NOT NULL,
  summative_full_mark DECIMAL(10,6) NOT NULL,
  total_mark DECIMAL(10,6) NOT NULL,
  total_full_mark DECIMAL(10,6) NOT NULL,
  formative_passed BOOLEAN NOT NULL,
  summative_passed BOOLEAN NOT NULL,
  course_passed BOOLEAN NOT NULL,
  rule_version_code TEXT NOT NULL,
  provenance_json JSONB NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT crc_examination_fk FOREIGN KEY (examination_id,department_id,academic_program_id,academic_session_id,academic_term_id) REFERENCES examinations(id,department_id,academic_program_id,academic_session_id,academic_term_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT crc_examination_course_fk FOREIGN KEY (examination_course_id,department_id,examination_id,course_offering_id) REFERENCES examination_courses(id,department_id,examination_id,course_offering_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT crc_offering_fk FOREIGN KEY (course_offering_id,department_id,student_batch_id,academic_term_id) REFERENCES course_offerings(id,department_id,student_batch_id,academic_term_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT crc_enrollment_fk FOREIGN KEY (enrollment_id,department_id,course_offering_id,student_user_id) REFERENCES enrollments(id,department_id,course_offering_id,student_user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT crc_formative_result_fk FOREIGN KEY (formative_result_id,department_id,examination_course_id,enrollment_id) REFERENCES formative_final_results(id,department_id,examination_course_id,enrollment_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT crc_candidate_fk FOREIGN KEY (summative_candidate_id,department_id,examination_id,examination_course_id) REFERENCES summative_examination_candidates(id,department_id,examination_id,examination_course_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT crc_approval_fk FOREIGN KEY (chairman_approval_id,department_id,examination_id,examination_course_id,summative_candidate_id,calculated_mark_id,calculated_mark_version) REFERENCES summative_chairman_approvals(id,department_id,examination_id,examination_course_id,candidate_id,calculated_mark_id,calculated_mark_version_snapshot) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT crc_calculated_mark_fk FOREIGN KEY (calculated_mark_id,department_id,examination_id,examination_course_id,summative_candidate_id,calculated_mark_version) REFERENCES summative_calculated_marks(id,department_id,examination_id,examination_course_id,candidate_id,calculated_mark_version) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT crc_candidate_list_fk FOREIGN KEY (candidate_list_id,department_id) REFERENCES examination_candidate_lists(id,department_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT crc_registration_fk FOREIGN KEY (registration_id,department_id) REFERENCES examination_candidate_registrations(id,department_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT crc_candidate_course_fk FOREIGN KEY (candidate_course_id,department_id) REFERENCES examination_candidate_courses(id,department_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT crc_curriculum_assignment_fk FOREIGN KEY (curriculum_assignment_id) REFERENCES student_curriculum_assignments(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT crc_context_uq UNIQUE(department_id,examination_course_id,enrollment_id),
  CONSTRAINT crc_marks_ck CHECK(formative_full_mark=40 AND summative_full_mark=60 AND total_full_mark=100
    AND formative_mark BETWEEN 0 AND 40 AND summative_mark BETWEEN 0 AND 60
    AND total_mark=formative_mark+summative_mark AND total_mark BETWEEN 0 AND 100
    AND formative_passed=(formative_mark>=16) AND summative_passed=(summative_mark>=24)
    AND course_passed=(formative_passed AND summative_passed)),
  CONSTRAINT crc_rule_ck CHECK(rule_version_code='LAW_COURSE_100_COMPONENT_PASS_V1' AND candidate_category='REGULAR'
    AND candidate_list_version>0 AND registration_version>0 AND calculated_mark_version>0)
);
CREATE INDEX crc_exam_idx ON course_result_compositions(department_id,examination_id);

-- Reviewed shared read contract between the two immutable source owners. No raw
-- marks, averaging, current appointment validity or arbitrary latest-version selection.
CREATE FUNCTION course_composition_sources(dept TEXT, exam TEXT, course TEXT, enrollment TEXT)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE f formative_final_results; a summative_chairman_approvals; m summative_calculated_marks;
  c summative_examination_candidates; ec examination_courses; x examinations; e enrollments; o course_offerings;
  cc examination_candidate_courses; r examination_candidate_registrations; l examination_candidate_lists;
  sc student_curriculum_assignments;
BEGIN
  SELECT * INTO ec FROM examination_courses WHERE id=course AND department_id=dept AND examination_id=exam;
  IF NOT FOUND THEN RAISE EXCEPTION 'Course-result context not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO e FROM enrollments WHERE id=enrollment AND department_id=dept AND course_offering_id=ec.course_offering_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Course-result context not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO x FROM examinations WHERE id=exam AND department_id=dept;
  SELECT * INTO o FROM course_offerings WHERE id=ec.course_offering_id AND department_id=dept;
  IF x.id IS NULL OR o.id IS NULL THEN RAISE EXCEPTION 'Invalid course-result context' USING ERRCODE='23514'; END IF;

  -- Resolve broadly before validating department and student identity. Never hide a
  -- malformed source using a narrow tenant/student filter and report it as absent.
  IF (SELECT count(*) FROM formative_final_results WHERE examination_course_id=course AND enrollment_id=enrollment)>1
    OR (SELECT count(*) FROM summative_examination_candidates WHERE examination_course_id=course
      AND (enrollment_id=enrollment OR student_user_id=e.student_user_id))>1 THEN
    RAISE EXCEPTION 'Ambiguous course-result source' USING ERRCODE='23514'; END IF;
  SELECT * INTO f FROM formative_final_results WHERE examination_course_id=course AND enrollment_id=enrollment;
  SELECT * INTO c FROM summative_examination_candidates WHERE examination_course_id=course
    AND (enrollment_id=enrollment OR student_user_id=e.student_user_id);
  IF c.id IS NOT NULL AND (c.department_id IS DISTINCT FROM dept OR c.examination_id IS DISTINCT FROM exam
    OR c.enrollment_id IS DISTINCT FROM enrollment OR c.student_user_id IS DISTINCT FROM e.student_user_id
    OR c.course_offering_id IS DISTINCT FROM o.id) THEN
    RAISE EXCEPTION 'Invalid Summative candidate identity' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*) FROM summative_chairman_approvals WHERE candidate_id=c.id)>1 THEN
    RAISE EXCEPTION 'Competing Chairman approvals' USING ERRCODE='23514'; END IF;
  SELECT * INTO a FROM summative_chairman_approvals WHERE candidate_id=c.id;
  IF f.id IS NULL OR a.id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO m FROM summative_calculated_marks WHERE id=a.calculated_mark_id;
  IF m.id IS NULL OR a.department_id IS DISTINCT FROM dept OR a.examination_id IS DISTINCT FROM exam
    OR a.examination_course_id IS DISTINCT FROM course OR a.candidate_id IS DISTINCT FROM c.id
    OR m.department_id IS DISTINCT FROM dept OR m.examination_id IS DISTINCT FROM exam
    OR m.examination_course_id IS DISTINCT FROM course OR m.candidate_id IS DISTINCT FROM c.id
    OR a.calculated_mark_version_snapshot IS DISTINCT FROM m.calculated_mark_version
    OR a.approved_summative_value_snapshot IS DISTINCT FROM m.derived_summative_value
    OR a.summative_full_mark_snapshot IS DISTINCT FROM m.summative_full_mark_snapshot
    OR a.summative_full_mark_snapshot IS DISTINCT FROM 60::numeric
    OR NOT (a.approved_summative_value_snapshot BETWEEN 0 AND 60)
    OR a.approved_at IS NULL OR a.locked_at IS DISTINCT FROM a.approved_at OR a.created_at IS DISTINCT FROM a.approved_at
    OR a.approved_at<m.created_at OR a.approved_at>statement_timestamp()
    OR a.approval_version<1 OR m.calculated_mark_version<1
    OR m.rule_version_code NOT IN ('SUMMATIVE_FIRST_SECOND_AVERAGE_V1','SUMMATIVE_THREE_TOTAL_NEAREST_PAIR_V1') THEN
    RAISE EXCEPTION 'Invalid approved Summative source' USING ERRCODE='23514'; END IF;

  IF f.department_id IS DISTINCT FROM dept OR f.examination_id IS DISTINCT FROM exam
    OR f.course_offering_id IS DISTINCT FROM o.id OR f.student_user_id IS DISTINCT FROM e.student_user_id
    OR f.academic_program_id IS DISTINCT FROM x.academic_program_id OR f.academic_session_id IS DISTINCT FROM x.academic_session_id
    OR f.academic_term_id IS DISTINCT FROM x.academic_term_id OR f.student_batch_id IS DISTINCT FROM ec.student_batch_id
    OR ec.academic_program_id IS DISTINCT FROM x.academic_program_id OR ec.academic_session_id IS DISTINCT FROM x.academic_session_id
    OR ec.academic_term_id IS DISTINCT FROM x.academic_term_id OR e.academic_term_id IS DISTINCT FROM x.academic_term_id
    OR o.academic_term_id IS DISTINCT FROM x.academic_term_id OR o.student_batch_id IS DISTINCT FROM ec.student_batch_id
    OR ec.curriculum_course_id IS DISTINCT FROM e.curriculum_course_id OR ec.curriculum_course_id IS DISTINCT FROM o.curriculum_course_id
    OR ec.syllabus_version_id IS DISTINCT FROM o.syllabus_version_id OR ec.summative_full_mark IS DISTINCT FROM 60::numeric
    OR f.rule_version_code IS DISTINCT FROM 'FINAL_FORMATIVE_40_SUM_V1' OR f.full_mark IS DISTINCT FROM 40::numeric
    OR NOT (f.mark BETWEEN 0 AND 40) THEN
    RAISE EXCEPTION 'Invalid Formative or academic identity' USING ERRCODE='23514'; END IF;

  -- Summative has no certified-registration FK. Independently prove the exact
  -- course/enrollment edge, then match it to the immutable Formative provenance.
  IF (SELECT count(*) FROM examination_candidate_courses WHERE examination_course_id=course AND enrollment_id=enrollment)<>1 THEN
    RAISE EXCEPTION 'Ambiguous certified candidate course' USING ERRCODE='23514'; END IF;
  SELECT * INTO cc FROM examination_candidate_courses WHERE examination_course_id=course AND enrollment_id=enrollment;
  SELECT * INTO r FROM examination_candidate_registrations WHERE id=cc.registration_id;
  SELECT * INTO l FROM examination_candidate_lists WHERE id=r.list_id;
  SELECT * INTO sc FROM student_curriculum_assignments WHERE id=r.curriculum_assignment_id;
  IF r.id IS NULL OR l.id IS NULL OR sc.id IS NULL OR cc.department_id IS DISTINCT FROM dept
    OR r.department_id IS DISTINCT FROM dept OR r.examination_id IS DISTINCT FROM exam OR r.student_user_id IS DISTINCT FROM e.student_user_id
    OR r.category::text IS DISTINCT FROM 'REGULAR' OR r.version<1
    OR l.department_id IS DISTINCT FROM dept OR l.examination_id IS DISTINCT FROM exam OR l.status::text IS DISTINCT FROM 'CERTIFIED'
    OR l.version<1 OR l.certified_at IS NULL OR l.certified_by_user_id IS NULL OR l.chairman_assignment_id IS NULL
    OR l.certified_at>f.created_at OR l.academic_program_id IS DISTINCT FROM x.academic_program_id
    OR l.academic_session_id IS DISTINCT FROM x.academic_session_id OR l.academic_term_id IS DISTINCT FROM x.academic_term_id
    OR sc.department_id IS DISTINCT FROM dept OR sc.student_user_id IS DISTINCT FROM e.student_user_id
    OR sc.academic_program_id IS DISTINCT FROM x.academic_program_id OR sc.curriculum_version_id IS DISTINCT FROM ec.curriculum_version_id
    OR r.curriculum_assignment_id IS DISTINCT FROM e.student_curriculum_assignment_id
    OR (SELECT count(*) FROM examination_candidate_lists WHERE examination_id=exam)<>1
    OR (SELECT count(*) FROM examination_candidate_registrations WHERE examination_id=exam AND student_user_id=e.student_user_id)<>1
    OR f.provenance_json->>'candidateCourseId' IS DISTINCT FROM cc.id
    OR f.provenance_json->>'registrationId' IS DISTINCT FROM r.id
    OR (f.provenance_json->>'registrationVersion')::integer IS DISTINCT FROM r.version
    OR f.provenance_json->>'curriculumAssignmentId' IS DISTINCT FROM sc.id
    OR f.provenance_json->>'curriculumVersionId' IS DISTINCT FROM ec.curriculum_version_id
    OR f.provenance_json->>'curriculumCourseId' IS DISTINCT FROM ec.curriculum_course_id
    OR f.provenance_json->>'syllabusVersionId' IS DISTINCT FROM ec.syllabus_version_id
    OR f.provenance_json->>'assessmentTemplateId' IS DISTINCT FROM ec.assessment_template_id
    OR NOT EXISTS(SELECT 1 FROM comprehensive_roster_entries re JOIN comprehensive_examinations ce ON ce.id=re.comprehensive_id
      WHERE re.id=f.provenance_json->>'rosterEntryId' AND re.department_id=dept AND re.registration_id=r.id
      AND re.registration_version=r.version AND re.candidate_course_id=cc.id AND ce.candidate_list_id=l.id
      AND ce.department_id=dept AND ce.examination_id=exam) THEN
    RAISE EXCEPTION 'Invalid certified REGULAR lineage' USING ERRCODE='23514'; END IF;

  RETURN jsonb_build_object('departmentId',dept,'examinationId',exam,'examinationCourseId',course,'courseOfferingId',o.id,
    'enrollmentId',enrollment,'studentUserId',e.student_user_id,'academicProgramId',x.academic_program_id,
    'academicSessionId',x.academic_session_id,'academicTermId',x.academic_term_id,'studentBatchId',ec.student_batch_id,
    'curriculumAssignmentId',sc.id,'curriculumVersionId',ec.curriculum_version_id,'curriculumCourseId',ec.curriculum_course_id,
    'syllabusVersionId',ec.syllabus_version_id,'assessmentTemplateId',ec.assessment_template_id,
    'candidateListId',l.id,'candidateListVersion',l.version,'registrationId',r.id,'registrationVersion',r.version,
    'candidateCourseId',cc.id,'candidateCategory','REGULAR','formativeResultId',f.id,'summativeCandidateId',c.id,
    'chairmanApprovalId',a.id,'calculatedMarkId',m.id,'calculatedMarkVersion',m.calculated_mark_version,
    'formativeRule',f.rule_version_code,'summativeRule',m.rule_version_code,'candidateRule',l.rule_version_code,
    'formativeMark',f.mark::text,'formativeFullMark',f.full_mark::text,
    'summativeMark',a.approved_summative_value_snapshot::text,'summativeFullMark',a.summative_full_mark_snapshot::text,
    'provenanceJson',jsonb_build_object('contractVersion','COURSE_COMPOSITION_PROVENANCE_V1',
      'activitiesResultId',f.activities_result_id,'attendanceVersionId',f.attendance_version_id,
      'comprehensiveResultId',f.comprehensive_result_id,
      'attendanceRevision',(f.provenance_json->>'attendanceRevision')::integer,
      'comprehensiveVersion',(f.provenance_json->>'comprehensiveVersion')::integer,
      'approvalVersion',a.approval_version,'member1ReviewId',a.member_1_review_id,'member2ReviewId',a.member_2_review_id,
      'approvedAt',a.approved_at,'lockedAt',a.locked_at,'certifiedAt',l.certified_at,
      'certificationAssignmentId',l.chairman_assignment_id));
END;
$$;

CREATE FUNCTION course_composition_matches(target TEXT, sources JSONB) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE g course_result_compositions; key TEXT; value JSONB; column_name TEXT;
BEGIN
  SELECT * INTO g FROM course_result_compositions WHERE id=target;
  IF NOT FOUND OR sources IS NULL THEN RETURN false; END IF;
  FOR key,value IN SELECT * FROM jsonb_each(sources) LOOP
    column_name := lower(regexp_replace(key,'([A-Z])','_\1','g'));
    IF key IN ('formativeMark','formativeFullMark','summativeMark','summativeFullMark') THEN
      IF (to_jsonb(g)->>column_name)::numeric IS DISTINCT FROM (value#>>'{}')::numeric THEN RETURN false; END IF;
    ELSE
      IF to_jsonb(g)->column_name IS DISTINCT FROM value THEN RETURN false; END IF;
    END IF;
  END LOOP;
  RETURN g.rule_version_code='LAW_COURSE_100_COMPONENT_PASS_V1' AND g.total_full_mark=100
    AND g.total_mark=g.formative_mark+g.summative_mark AND g.formative_passed=(g.formative_mark>=16)
    AND g.summative_passed=(g.summative_mark>=24) AND g.course_passed=(g.formative_passed AND g.summative_passed);
END;
$$;

CREATE FUNCTION course_composition_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('transaction_isolation')<>'serializable' THEN
    RAISE EXCEPTION 'Course composition requires Serializable' USING ERRCODE='23514'; END IF;
  UPDATE examinations SET id=id WHERE id=NEW.examination_id AND department_id=NEW.department_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Course-result context not found' USING ERRCODE='P0002'; END IF;
  -- Server creation time cannot be forged by a caller.
  NEW.created_at := statement_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER crc_insert BEFORE INSERT ON course_result_compositions FOR EACH ROW EXECUTE FUNCTION course_composition_insert();

CREATE FUNCTION course_composition_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Course composition is immutable' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER crc_immutable BEFORE UPDATE OR DELETE ON course_result_compositions FOR EACH ROW EXECUTE FUNCTION course_composition_immutable();

CREATE FUNCTION course_composition_validate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sources JSONB; expected JSONB;
BEGIN
  sources := course_composition_sources(NEW.department_id,NEW.examination_id,NEW.examination_course_id,NEW.enrollment_id);
  IF NOT course_composition_matches(NEW.id,sources) THEN
    RAISE EXCEPTION 'Invalid course composition source package' USING ERRCODE='23514'; END IF;
  -- Audit references the immutable aggregate; do not duplicate its provenance,
  -- student identity, curriculum context or irrelevant source-row attributes.
  expected := (sources - ARRAY['provenanceJson','studentUserId','academicProgramId','academicSessionId',
    'academicTermId','studentBatchId','curriculumAssignmentId','curriculumVersionId','curriculumCourseId',
    'syllabusVersionId','assessmentTemplateId','candidateCategory']) || jsonb_build_object('aggregateId',NEW.id,'ruleVersionCode',NEW.rule_version_code,
    'totalMark',NEW.total_mark::text,'totalFullMark','100.000000','formativePassed',NEW.formative_passed,
    'summativePassed',NEW.summative_passed,'coursePassed',NEW.course_passed);
  IF (SELECT count(*) FROM audit_logs WHERE action='course-result.composed' AND target_id=NEW.id)<>1
    OR NOT EXISTS(SELECT 1 FROM audit_logs WHERE action='course-result.composed' AND target_id=NEW.id
      AND target_type='course_result_composition' AND department_id=NEW.department_id AND actor_type::text='SERVICE'
      AND actor_user_id IS NULL AND outcome::text='SUCCESS' AND context_json=expected
      AND xmin=pg_current_xact_id()::xid) THEN
    RAISE EXCEPTION 'Course composition requires exactly one transaction-coupled success audit' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER crc_package_validate AFTER INSERT ON course_result_compositions DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION course_composition_validate();

CREATE FUNCTION course_composition_audit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.action='course-result.composed' THEN
      PERFORM id FROM course_result_compositions WHERE id=NEW.target_id AND department_id=NEW.department_id
        AND xmin=pg_current_xact_id()::xid;
      IF NOT FOUND OR EXISTS(SELECT 1 FROM audit_logs WHERE action=NEW.action AND target_id=NEW.target_id) THEN
        RAISE EXCEPTION 'Course composition audit requires its new aggregate' USING ERRCODE='23514'; END IF;
    END IF;
  ELSIF TG_OP='UPDATE' THEN
    IF OLD.action='course-result.composed' OR NEW.action='course-result.composed' THEN
      RAISE EXCEPTION 'Course composition audit is immutable' USING ERRCODE='23514'; END IF;
  ELSIF TG_OP='DELETE' THEN
    IF OLD.action='course-result.composed' THEN
      RAISE EXCEPTION 'Course composition audit is immutable' USING ERRCODE='23514'; END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER crc_audit_guard BEFORE INSERT OR UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION course_composition_audit_guard();

COMMIT;

