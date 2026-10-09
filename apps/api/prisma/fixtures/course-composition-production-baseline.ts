/**
 * Production-shaped campaign prerequisite (NOT a fabricated migration baseline):
 * restore an independently approved, sanitized pre-composition PostgreSQL custom
 * archive into a dedicated loopback *_test database. It must retain the REAL
 * schema, functions, enabled triggers, FKs and _prisma_migrations checksums below.
 * No initial core-table migration is present in this repository. Do not synthesize
 * one, db-push the current schema, resolve missing migrations, or load simplified
 * source tables to satisfy this contract.
 *
 * The archive must contain only synthetic users (crc_fixture_* IDs,
 * @crc-fixture.invalid addresses, NULL password hashes, no login sessions/tokens).
 * Provide six source-ready academic fixtures described by PRODUCTION_CASES:
 * one exact enrollment/certified REGULAR lineage per examination; all three real
 * immutable Formative parents and their required audits; locked First/Second
 * evidence and its real calculated Summative mark; complete active four-seat
 * Committee with real teacher permission grants and a distinct Chairman per case. No FinalFormativeResult, Member
 * reviews or Chairman approvals yet. This suite creates those via real services.
 * Do not disable constraints/triggers or insert forged authority to build fixtures.
 * Baseline preparation/independent approval is an external prerequisite, not a
 * claim that these fixtures have already been supplied or executed here.
 *
 * Required environment (none falls back to DATABASE_URL):
 * LEXORA_CRC_PRODUCTION_TEST_DATABASE_URL: dedicated baseline connection, public schema
 * LEXORA_CRC_PRODUCTION_EXPECTED_DATABASE: its exact *_test name
 * LEXORA_CRC_MAINTENANCE_DATABASE_URL: separate dedicated *_test maintenance database,
 * on the same loopback host/port and role; never the baseline or a generated clone
 * LEXORA_CRC_MAINTENANCE_EXPECTED_DATABASE: its exact name (no connection fallback)
 * LEXORA_CRC_PRODUCTION_CONFIRM=YES_DISPOSABLE_SANITIZED_BASELINE
 * LEXORA_CRC_BASELINE_SHA256: independently approved archive digest
 * Database COMMENT must be exactly LEXORA_CRC_APPROVED_SYNTHETIC:<that digest>.
 * Separately document verification of the actual approved sanitized archive bytes
 * against that digest and their restoration into this baseline. The COMMENT is
 * only an approval marker; matching it does not independently prove archive integrity.
 * PostgreSQL 18.6, CREATEDB and ownership of the baseline are required. The harness
 * only reads the baseline, creates random *_test clones, deploys into those clones,
 * and drops only databases successfully created by this invocation.
 */
export const PRE_COMPOSITION_MIGRATIONS = [
  "20260521_add_notice_foundation",
  "20260805_add_file_malware_scan_job_ledger",
  "202608060001_add_curriculum_assessment_foundation",
  "202608070001_add_course_offering_curriculum_binding",
  "202608090001_add_student_curriculum_assignment",
  "202608090002_add_enrollment_curriculum_binding_foundation",
  "202608100001_harden_enrollment_course_offering_delete",
  "202608100002_redesign_course_offering_uniqueness",
  "202608140001_add_syllabus_version_foundation",
  "202608170001_add_course_offering_syllabus_binding_foundation",
  "202608190001_add_obe_learning_outcomes_foundation",
  "202608190002_add_course_outline_version_foundation",
  "202608200001_add_canonical_syllabus_content_foundation",
  "202608200002_add_course_outline_draft_content",
  "202608200003_add_academic_session_student_batch_foundation",
  "202608210001_add_course_offering_student_batch_binding_foundation",
  "202608240001_harden_curriculum_course_department_identity",
  "202608240002_add_batch_coordinator_assignment_foundation",
  "202608260001_add_course_outline_correction_request_foundation",
  "202608270001_add_course_outline_active_version_binding",
  "202608280001_add_summative_examination_committee_foundation",
  "202608290001_add_external_examination_committee_member",
  "202608290002_add_examination_course_examiner_assignment",
  "202608290003_add_summative_question_configuration",
  "202608290004_add_summative_examiner_marks",
  "202609010001_add_summative_examiner_comparisons",
  "202609010002_add_summative_third_examination_referrals",
  "202609010003_add_summative_third_examiner_marks",
  "202609010004_add_summative_three_total_calculations",
  "202609020001_fix_summative_third_referral_integrity_trigger",
  "202609020002_add_summative_calculated_committee_approval",
  "202609050001_add_course_outline_structured_content",
  "202609210001_add_formative_teacher_submission",
  "202609210002_add_regular_comprehensive_workflow",
  "202609230001_add_authoritative_formative_attendance",
  "202609270001_class_session_scheduled_end",
  "202609280001_ordinary_attendance_corrections",
  "202609290001_chairman_attendance_generation",
  "202610010001_add_formative_activity_submission",
  "202610020001_chairman_activities_finalisation",
  "202610060001_automatic_final_formative"
] as const;
export const COMPOSITION_MIGRATION = "202610080001_authoritative_course_composition";
export const PRODUCTION_CASES = [
  { key: "boundary", formative: "16", summative: "24", formativePassed: true, summativePassed: true },
  { key: "formative_fail", formative: "15.999975", summative: "60", formativePassed: false, summativePassed: true },
  { key: "summative_fail", formative: "40", summative: "23.995", formativePassed: true, summativePassed: false },
  { key: "precision", formative: "31.123475", summative: "46.125", formativePassed: true, summativePassed: true },
  { key: "zero", formative: "0", summative: "0", formativePassed: false, summativePassed: false },
  { key: "maximum", formative: "40", summative: "60", formativePassed: true, summativePassed: true },
] as const;
/**
 * Source-feasible, entirely synthetic six-case marks recipe for a future fixture
 * seeder. Not an authority grant or a claim that source rows are already present.
 * Activities: 0.01 precision; Attendance: 0.1; Comprehensive per seat: 0.0001;
 * no rounding of the exact four-seat mean. Examiner totals: 0.01 precision.
 * A real fixture generator must use the academic services and validated source
 * chains, not directly insert final aggregates or terminal Chairman approvals.
 */
export const PRODUCTION_FIXTURE_INPUTS = [
  { key: "boundary", activities: "12", attendance: "2", comprehensiveMode: "ALL_MEMBERS_AVERAGE",
    comprehensiveSeatMarks: ["2", "2", "2", "2"], firstExaminer: "24", secondExaminer: "24" },
  { key: "formative_fail", activities: "10", attendance: "2", comprehensiveMode: "ALL_MEMBERS_AVERAGE",
    comprehensiveSeatMarks: ["3.9999", "4", "4", "4"], firstExaminer: "60", secondExaminer: "60" },
  { key: "summative_fail", activities: "30", attendance: "5", comprehensiveMode: "ALL_MEMBERS_AVERAGE",
    comprehensiveSeatMarks: ["5", "5", "5", "5"], firstExaminer: "23.99", secondExaminer: "24" },
  { key: "precision", activities: "26", attendance: "2", comprehensiveMode: "ALL_MEMBERS_AVERAGE",
    comprehensiveSeatMarks: ["3.1234", "3.1235", "3.1235", "3.1235"], firstExaminer: "46.12", secondExaminer: "46.13" },
  { key: "zero", activities: "0", attendance: "0", comprehensiveMode: "ALL_MEMBERS_AVERAGE",
    comprehensiveSeatMarks: ["0", "0", "0", "0"], firstExaminer: "0", secondExaminer: "0" },
  { key: "maximum", activities: "30", attendance: "5", comprehensiveMode: "ALL_MEMBERS_AVERAGE",
    comprehensiveSeatMarks: ["5", "5", "5", "5"], firstExaminer: "60", secondExaminer: "60" },
] as const;

export function fixtureIds(key: string) {
  const prefix = `crc_fixture_${key}`;
  return { departmentId: "crc_fixture_law", examinationId: `${prefix}_exam`, examinationCourseId: `${prefix}_course`,
    enrollmentId: `${prefix}_enrollment`, candidateId: `${prefix}_candidate`, calculatedMarkId: `${prefix}_calculated` };
}
