-- Synthetic authoritative boundary fixtures for the additive /40 migration suite.
-- Existing component migrations have independent real-database suites. These fixtures
-- deliberately permit source corruption so the new resolver's fail-closed checks can be probed.
CREATE TABLE users(id TEXT PRIMARY KEY, department_id TEXT);
CREATE TABLE examinations(id TEXT PRIMARY KEY, department_id TEXT, academic_program_id TEXT, academic_session_id TEXT,
  academic_term_id TEXT, rule_version_code TEXT, UNIQUE(id,department_id,academic_program_id,academic_session_id,academic_term_id));
CREATE TABLE examination_courses(id TEXT PRIMARY KEY, department_id TEXT, examination_id TEXT, course_offering_id TEXT,
  academic_program_id TEXT, academic_session_id TEXT, academic_term_id TEXT, student_batch_id TEXT,
  curriculum_course_id TEXT, curriculum_version_id TEXT, syllabus_version_id TEXT, assessment_template_id TEXT,
  UNIQUE(id,department_id,examination_id,course_offering_id));
CREATE TABLE course_offerings(id TEXT PRIMARY KEY, department_id TEXT, student_batch_id TEXT, academic_term_id TEXT,
  curriculum_course_id TEXT, syllabus_version_id TEXT, UNIQUE(id,department_id,student_batch_id,academic_term_id));
CREATE TABLE enrollments(id TEXT PRIMARY KEY, department_id TEXT, course_offering_id TEXT, student_user_id TEXT,
  academic_term_id TEXT, curriculum_course_id TEXT, student_curriculum_assignment_id TEXT,
  UNIQUE(id,department_id,course_offering_id,student_user_id));
CREATE TABLE student_curriculum_assignments(id TEXT PRIMARY KEY, department_id TEXT, student_user_id TEXT,
  academic_program_id TEXT, curriculum_version_id TEXT);
CREATE TABLE formative_activities_finalisations(id TEXT PRIMARY KEY, department_id TEXT, examination_id TEXT,
  examination_course_id TEXT, course_offering_id TEXT, rule_version_code TEXT, activity_count INTEGER, result_count INTEGER, source_fingerprint TEXT);
CREATE TABLE formative_activities_final_results(id TEXT PRIMARY KEY, finalisation_id TEXT, enrollment_id TEXT,
  student_user_id TEXT, mark NUMERIC(6,2), full_mark NUMERIC(6,2), source_fingerprint TEXT);
CREATE TABLE formative_activities_final_source_items(id TEXT PRIMARY KEY, result_id TEXT, activity_id TEXT, submission_id TEXT,
  submission_version INTEGER, submission_fingerprint TEXT, submission_item_id TEXT, mark_evidence_id TEXT);
CREATE TABLE formative_activity_submissions(id TEXT PRIMARY KEY, department_id TEXT, course_offering_id TEXT,
  activity_id TEXT, version INTEGER, source_fingerprint TEXT);
CREATE TABLE formative_activity_submission_items(id TEXT PRIMARY KEY, submission_id TEXT, enrollment_id TEXT, mark_evidence_id TEXT);
CREATE TABLE formative_attendance_generations(id TEXT PRIMARY KEY, department_id TEXT, examination_id TEXT,
  academic_program_id TEXT, academic_session_id TEXT, academic_term_id TEXT, rule_version_code TEXT, chairman_user_id TEXT, source_fingerprint TEXT,
  result_count INTEGER);
CREATE TABLE formative_attendance_versions(id TEXT PRIMARY KEY, department_id TEXT, generation_id TEXT, enrollment_id TEXT,
  student_user_id TEXT, course_offering_id TEXT, examination_id TEXT, examination_course_id TEXT, academic_term_id TEXT,
  student_batch_id TEXT, rule_version_code TEXT, status TEXT, mark NUMERIC(2,1), diagnostics_json JSONB,
  actor_user_id TEXT, coordinator_assignment_id TEXT, conducted_count INTEGER, revision INTEGER, source_fingerprint TEXT);
CREATE TABLE formative_attendance_source_items(id TEXT PRIMARY KEY, version_id TEXT);
CREATE TABLE formative_attendance_transitions(id TEXT PRIMARY KEY, version_id TEXT);
CREATE TABLE examination_candidate_lists(id TEXT PRIMARY KEY, department_id TEXT, examination_id TEXT, status TEXT,
  academic_program_id TEXT, academic_session_id TEXT, academic_term_id TEXT);
CREATE TABLE examination_candidate_registrations(id TEXT PRIMARY KEY, department_id TEXT, examination_id TEXT,
  list_id TEXT, student_user_id TEXT, category TEXT, curriculum_assignment_id TEXT, version INTEGER);
CREATE TABLE examination_candidate_courses(id TEXT PRIMARY KEY, department_id TEXT, examination_course_id TEXT, enrollment_id TEXT, registration_id TEXT);
CREATE TABLE comprehensive_examinations(id TEXT PRIMARY KEY, department_id TEXT, examination_id TEXT, status TEXT,
  finalised_at TIMESTAMP(3), roster_locked_at TIMESTAMP(3), marking_started_at TIMESTAMP(3), mode TEXT, rule_version_code TEXT, candidate_list_id TEXT);
CREATE TABLE comprehensive_finalisations(id TEXT PRIMARY KEY, department_id TEXT, comprehensive_id TEXT, created_at TIMESTAMP(3),
  mode TEXT, rule_version_code TEXT, version INTEGER);
CREATE TABLE comprehensive_courses(id TEXT PRIMARY KEY, department_id TEXT, comprehensive_id TEXT, examination_course_id TEXT,
  full_mark NUMERIC(6,2), template_version INTEGER, assigned_committee_assignment_id TEXT);
CREATE TABLE comprehensive_roster_entries(id TEXT PRIMARY KEY, department_id TEXT, comprehensive_id TEXT, candidate_course_id TEXT,
  course_id TEXT, registration_id TEXT, registration_version INTEGER);
CREATE TABLE comprehensive_final_results(id TEXT PRIMARY KEY, department_id TEXT, finalisation_id TEXT, roster_entry_id TEXT,
  mark NUMERIC(10,6), full_mark NUMERIC(6,2), calculation_rule TEXT);
CREATE TABLE comprehensive_final_sources(id TEXT PRIMARY KEY, department_id TEXT, result_id TEXT, mark_id TEXT);
CREATE TABLE comprehensive_marks(id TEXT PRIMARY KEY, department_id TEXT, roster_entry_id TEXT, status TEXT,
  full_mark NUMERIC(6,2), seat TEXT, revision INTEGER, committee_assignment_id TEXT);
CREATE TABLE comprehensive_mark_returns(id TEXT PRIMARY KEY, mark_id TEXT);
CREATE TYPE "AuditActorType" AS ENUM ('USER','SERVICE','ANONYMOUS');
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS','FAILURE','DENIED');
CREATE TABLE audit_logs(id TEXT PRIMARY KEY, department_id TEXT, actor_user_id TEXT, actor_type "AuditActorType", action TEXT,
  target_type TEXT, target_id TEXT, outcome "AuditOutcome", context_json JSONB, request_id TEXT, ip_address TEXT, user_agent TEXT,
  occurred_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
