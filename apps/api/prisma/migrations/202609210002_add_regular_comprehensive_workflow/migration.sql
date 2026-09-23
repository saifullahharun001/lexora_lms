BEGIN;

CREATE TYPE "ExaminationCandidateCategory" AS ENUM ('REGULAR', 'IRREGULAR', 'IMPROVEMENT');

CREATE TYPE "CandidateListStatus" AS ENUM ('DRAFT', 'CERTIFIED');

CREATE TYPE "ComprehensiveMarkingMode" AS ENUM ('ALL_MEMBERS_AVERAGE', 'COURSE_DISTRIBUTED', 'CHAIRMAN_ONLY');

CREATE TYPE "ComprehensiveStatus" AS ENUM ('CONFIGURED', 'MARKING', 'FINALISED');

CREATE TYPE "ComprehensiveMarkStatus" AS ENUM ('DRAFT', 'SUBMITTED');

CREATE UNIQUE INDEX "examination_committee_assignment_comprehensive_scope_uq" ON "examination_committee_assignments" ("id", "department_id");

CREATE UNIQUE INDEX "examination_committee_comprehensive_scope_uq" ON "examination_committees" ("id", "department_id");

CREATE UNIQUE INDEX "examination_course_comprehensive_scope_uq" ON "examination_courses" ("id", "department_id");

CREATE UNIQUE INDEX "enrollment_comprehensive_scope_uq" ON "enrollments" ("id", "department_id");

CREATE UNIQUE INDEX "assessment_template_component_comprehensive_scope_uq" ON "assessment_template_components" ("id", "department_id");

CREATE TABLE "poe_chairman_assignments" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "department_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "source_reference" VARCHAR(500) NOT NULL,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "revoked_by_user_id" TEXT,
  "recorded_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ce_poechairmanassignment_0_uq" ON "poe_chairman_assignments" ("id", "department_id");

CREATE TABLE "external_comprehensive_access" (
  "assignment_assigned_at" TIMESTAMP(3) NOT NULL,
  "id" TEXT NOT NULL PRIMARY KEY,
  "department_id" TEXT NOT NULL,
  "assignment_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "revoked_by_user_id" TEXT,
  "recorded_by_user_id" TEXT NOT NULL,
  "source_reference" VARCHAR(500) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ce_externalcomprehensiveaccess_0_uq" ON "external_comprehensive_access" ("id", "department_id");

CREATE UNIQUE INDEX "ce_externalcomprehensiveaccess_1_uq" ON "external_comprehensive_access" ("assignment_id");

CREATE TABLE "examination_candidate_lists" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "department_id" TEXT NOT NULL,
  "examination_id" TEXT NOT NULL UNIQUE,
  "academic_program_id" TEXT NOT NULL,
  "academic_session_id" TEXT NOT NULL,
  "academic_term_id" TEXT NOT NULL,
  "status" "CandidateListStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "source_reference" VARCHAR(500) NOT NULL,
  "rule_version_code" VARCHAR(64) NOT NULL,
  "recorded_by_user_id" TEXT NOT NULL,
  "recorded_poe_assignment_id" TEXT NOT NULL,
  "certified_by_user_id" TEXT,
  "chairman_assignment_id" TEXT,
  "certified_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ce_examinationcandidatelist_0_uq" ON "examination_candidate_lists" ("id", "department_id");

CREATE TABLE "examination_candidate_registrations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "department_id" TEXT NOT NULL,
  "list_id" TEXT NOT NULL,
  "examination_id" TEXT NOT NULL,
  "student_user_id" TEXT NOT NULL,
  "curriculum_assignment_id" TEXT NOT NULL,
  "category" "ExaminationCandidateCategory" NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "recorded_by_user_id" TEXT NOT NULL,
  "recorded_poe_assignment_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ce_examinationcandidateregistration_0_uq" ON "examination_candidate_registrations" ("id", "department_id");

CREATE UNIQUE INDEX "ce_examinationcandidateregistration_1_uq" ON "examination_candidate_registrations" ("list_id", "student_user_id");

CREATE TABLE "examination_candidate_courses" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "department_id" TEXT NOT NULL,
  "registration_id" TEXT NOT NULL,
  "examination_course_id" TEXT NOT NULL,
  "enrollment_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ce_examinationcandidatecourse_0_uq" ON "examination_candidate_courses" ("id", "department_id");

CREATE UNIQUE INDEX "ce_examinationcandidatecourse_1_uq" ON "examination_candidate_courses" ("registration_id", "examination_course_id");

CREATE TABLE "comprehensive_examinations" (
  "roster_locked_by_user_id" TEXT,
  "roster_locked_by_assignment_id" TEXT,
  "marking_started_by_user_id" TEXT,
  "marking_started_by_assignment_id" TEXT,
  "marking_started_external_access_id" TEXT,
  "roster_locked_by_assignment_assigned_at" TIMESTAMP(3),
  "marking_started_by_assignment_assigned_at" TIMESTAMP(3),
  "configured_assignment_assigned_at" TIMESTAMP(3) NOT NULL,
  "id" TEXT NOT NULL PRIMARY KEY,
  "department_id" TEXT NOT NULL,
  "examination_id" TEXT NOT NULL UNIQUE,
  "committee_id" TEXT NOT NULL,
  "candidate_list_id" TEXT NOT NULL,
  "exam_date" TIMESTAMP(3) NOT NULL,
  "mode" "ComprehensiveMarkingMode" NOT NULL,
  "status" "ComprehensiveStatus" NOT NULL DEFAULT 'CONFIGURED',
  "rule_version_code" VARCHAR(64) NOT NULL,
  "configured_by_user_id" TEXT NOT NULL,
  "configured_assignment_id" TEXT NOT NULL,
  "roster_locked_at" TIMESTAMP(3),
  "marking_started_at" TIMESTAMP(3),
  "finalised_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ce_comprehensiveexamination_0_uq" ON "comprehensive_examinations" ("id", "department_id");

CREATE TABLE "comprehensive_courses" (
  "allocation_changed_by_user_id" TEXT,
  "allocation_changed_by_assignment_id" TEXT,
  "allocation_changed_by_assignment_assigned_at" TIMESTAMP(3),
  "id" TEXT NOT NULL PRIMARY KEY,
  "department_id" TEXT NOT NULL,
  "comprehensive_id" TEXT NOT NULL,
  "examination_course_id" TEXT NOT NULL,
  "assessment_component_id" TEXT NOT NULL,
  "full_mark" DECIMAL(6,2) NOT NULL,
  "template_version" INTEGER NOT NULL,
  "academic_snapshot" JSONB NOT NULL,
  "assigned_committee_assignment_id" TEXT,
  "allocated_assignment_assigned_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ce_comprehensivecourse_0_uq" ON "comprehensive_courses" ("id", "department_id");

CREATE UNIQUE INDEX "ce_comprehensivecourse_1_uq" ON "comprehensive_courses" ("comprehensive_id", "examination_course_id");

CREATE TABLE "comprehensive_roster_entries" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "department_id" TEXT NOT NULL,
  "comprehensive_id" TEXT NOT NULL,
  "course_id" TEXT NOT NULL,
  "registration_id" TEXT NOT NULL,
  "candidate_course_id" TEXT NOT NULL,
  "registration_version" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ce_comprehensiverosterentry_0_uq" ON "comprehensive_roster_entries" ("id", "department_id");

CREATE UNIQUE INDEX "ce_comprehensiverosterentry_1_uq" ON "comprehensive_roster_entries" ("comprehensive_id", "course_id", "registration_id");

CREATE TABLE "comprehensive_absences" (
  "assignment_assigned_at" TIMESTAMP(3) NOT NULL,
  "id" TEXT NOT NULL PRIMARY KEY,
  "department_id" TEXT NOT NULL,
  "comprehensive_id" TEXT NOT NULL,
  "registration_id" TEXT NOT NULL,
  "chairman_assignment_id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "reason" VARCHAR(2000) NOT NULL,
  "resolution_status" TEXT NOT NULL DEFAULT 'SPECIAL_OR_FAILURE_RESOLUTION_REQUIRED',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ce_comprehensiveabsence_0_uq" ON "comprehensive_absences" ("id", "department_id");

CREATE UNIQUE INDEX "ce_comprehensiveabsence_1_uq" ON "comprehensive_absences" ("comprehensive_id", "registration_id");

CREATE TABLE "comprehensive_marks" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "department_id" TEXT NOT NULL,
  "comprehensive_id" TEXT NOT NULL,
  "roster_entry_id" TEXT NOT NULL,
  "committee_assignment_id" TEXT NOT NULL,
  "assignment_assigned_at" TIMESTAMP(3) NOT NULL,
  "external_access_id" TEXT,
  "seat" "ExaminationCommitteeSeat" NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "previous_id" TEXT UNIQUE,
  "return_id" TEXT UNIQUE,
  "mark" DECIMAL(8,4) NOT NULL,
  "full_mark" DECIMAL(6,2) NOT NULL,
  "status" "ComprehensiveMarkStatus" NOT NULL DEFAULT 'DRAFT',
  "submitted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ce_comprehensivemark_0_uq" ON "comprehensive_marks" ("id", "department_id");

CREATE UNIQUE INDEX "ce_comprehensivemark_1_uq" ON "comprehensive_marks" ("roster_entry_id", "seat", "revision");

CREATE TABLE "comprehensive_mark_returns" (
  "assignment_assigned_at" TIMESTAMP(3) NOT NULL,
  "id" TEXT NOT NULL PRIMARY KEY,
  "department_id" TEXT NOT NULL,
  "comprehensive_id" TEXT NOT NULL,
  "mark_id" TEXT NOT NULL UNIQUE,
  "chairman_assignment_id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "reason" VARCHAR(2000) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ce_comprehensivemarkreturn_0_uq" ON "comprehensive_mark_returns" ("id", "department_id");

CREATE TABLE "comprehensive_finalisations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "department_id" TEXT NOT NULL,
  "comprehensive_id" TEXT NOT NULL UNIQUE,
  "chairman_assignment_id" TEXT NOT NULL,
  "assignment_assigned_at" TIMESTAMP(3) NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "rule_version_code" VARCHAR(64) NOT NULL,
  "mode" "ComprehensiveMarkingMode" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ce_comprehensivefinalisation_0_uq" ON "comprehensive_finalisations" ("id", "department_id");

CREATE TABLE "comprehensive_final_results" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "department_id" TEXT NOT NULL,
  "finalisation_id" TEXT NOT NULL,
  "roster_entry_id" TEXT NOT NULL UNIQUE,
  "mark" DECIMAL(10,6) NOT NULL,
  "full_mark" DECIMAL(6,2) NOT NULL,
  "calculation_rule" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ce_comprehensivefinalresult_0_uq" ON "comprehensive_final_results" ("id", "department_id");

CREATE TABLE "comprehensive_final_sources" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "department_id" TEXT NOT NULL,
  "result_id" TEXT NOT NULL,
  "mark_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ce_comprehensivefinalsource_0_uq" ON "comprehensive_final_sources" ("id", "department_id");

CREATE UNIQUE INDEX "ce_comprehensivefinalsource_1_uq" ON "comprehensive_final_sources" ("result_id", "mark_id");

ALTER TABLE "poe_chairman_assignments" ADD CONSTRAINT "ce_poechairmanassignment_department_fk" FOREIGN KEY ("department_id") REFERENCES "departments" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "poe_chairman_assignments" ADD CONSTRAINT "ce_poechairmanassignment_user_fk" FOREIGN KEY ("user_id", "department_id") REFERENCES "users" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "poe_chairman_assignments" ADD CONSTRAINT "ce_poechairmanassignment_recordedbyuser_fk" FOREIGN KEY ("recorded_by_user_id", "department_id") REFERENCES "users" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "poe_chairman_assignments" ADD CONSTRAINT "ce_poechairmanassignment_revokedbyuser_fk" FOREIGN KEY ("revoked_by_user_id", "department_id") REFERENCES "users" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "external_comprehensive_access" ADD CONSTRAINT "ce_externalcomprehensiveaccess_department_fk" FOREIGN KEY ("department_id") REFERENCES "departments" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "external_comprehensive_access" ADD CONSTRAINT "ce_externalcomprehensiveaccess_user_fk" FOREIGN KEY ("user_id", "department_id") REFERENCES "users" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "external_comprehensive_access" ADD CONSTRAINT "ce_externalcomprehensiveaccess_recordedbyuser_fk" FOREIGN KEY ("recorded_by_user_id", "department_id") REFERENCES "users" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "external_comprehensive_access" ADD CONSTRAINT "ce_externalcomprehensiveaccess_revokedbyuser_fk" FOREIGN KEY ("revoked_by_user_id", "department_id") REFERENCES "users" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "external_comprehensive_access" ADD CONSTRAINT "ce_externalcomprehensiveaccess_assignment_fk" FOREIGN KEY ("assignment_id", "department_id") REFERENCES "examination_committee_assignments" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_candidate_lists" ADD CONSTRAINT "ce_examinationcandidatelist_department_fk" FOREIGN KEY ("department_id") REFERENCES "departments" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_candidate_lists" ADD CONSTRAINT "ce_examinationcandidatelist_recordedbyuser_fk" FOREIGN KEY ("recorded_by_user_id", "department_id") REFERENCES "users" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_candidate_lists" ADD CONSTRAINT "ce_examinationcandidatelist_recordedpoeassignment_fk" FOREIGN KEY ("recorded_poe_assignment_id", "department_id") REFERENCES "poe_chairman_assignments" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_candidate_lists" ADD CONSTRAINT "ce_examinationcandidatelist_certifiedbyuser_fk" FOREIGN KEY ("certified_by_user_id", "department_id") REFERENCES "users" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_candidate_lists" ADD CONSTRAINT "ce_examinationcandidatelist_chairmanassignment_fk" FOREIGN KEY ("chairman_assignment_id", "department_id") REFERENCES "poe_chairman_assignments" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_candidate_lists" ADD CONSTRAINT "ce_examinationcandidatelist_examination_fk" FOREIGN KEY ("examination_id", "department_id") REFERENCES "examinations" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_candidate_registrations" ADD CONSTRAINT "ce_examinationcandidateregistration_department_fk" FOREIGN KEY ("department_id") REFERENCES "departments" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_candidate_registrations" ADD CONSTRAINT "ce_examinationcandidateregistration_studentuser_fk" FOREIGN KEY ("student_user_id", "department_id") REFERENCES "users" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_candidate_registrations" ADD CONSTRAINT "ce_examinationcandidateregistration_recordedbyuser_fk" FOREIGN KEY ("recorded_by_user_id", "department_id") REFERENCES "users" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_candidate_registrations" ADD CONSTRAINT "ce_examinationcandidateregistration_recordedpoeassignment_fk" FOREIGN KEY ("recorded_poe_assignment_id", "department_id") REFERENCES "poe_chairman_assignments" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_candidate_registrations" ADD CONSTRAINT "ce_examinationcandidateregistration_list_fk" FOREIGN KEY ("list_id", "department_id") REFERENCES "examination_candidate_lists" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_candidate_registrations" ADD CONSTRAINT "ce_examinationcandidateregistration_examination_fk" FOREIGN KEY ("examination_id", "department_id") REFERENCES "examinations" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_candidate_registrations" ADD CONSTRAINT "ce_examinationcandidateregistration_curriculumassignment_fk" FOREIGN KEY ("curriculum_assignment_id") REFERENCES "student_curriculum_assignments" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_candidate_courses" ADD CONSTRAINT "ce_examinationcandidatecourse_department_fk" FOREIGN KEY ("department_id") REFERENCES "departments" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_candidate_courses" ADD CONSTRAINT "ce_examinationcandidatecourse_registration_fk" FOREIGN KEY ("registration_id", "department_id") REFERENCES "examination_candidate_registrations" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_candidate_courses" ADD CONSTRAINT "ce_examinationcandidatecourse_examinationcourse_fk" FOREIGN KEY ("examination_course_id", "department_id") REFERENCES "examination_courses" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_candidate_courses" ADD CONSTRAINT "ce_examinationcandidatecourse_enrollment_fk" FOREIGN KEY ("enrollment_id", "department_id") REFERENCES "enrollments" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_examinations" ADD CONSTRAINT "ce_comprehensiveexamination_department_fk" FOREIGN KEY ("department_id") REFERENCES "departments" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_examinations" ADD CONSTRAINT "ce_comprehensiveexamination_configuredbyuser_fk" FOREIGN KEY ("configured_by_user_id", "department_id") REFERENCES "users" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_examinations" ADD CONSTRAINT "ce_comprehensiveexamination_committee_fk" FOREIGN KEY ("committee_id", "department_id") REFERENCES "examination_committees" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_examinations" ADD CONSTRAINT "ce_comprehensiveexamination_candidatelist_fk" FOREIGN KEY ("candidate_list_id", "department_id") REFERENCES "examination_candidate_lists" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_examinations" ADD CONSTRAINT "ce_comprehensiveexamination_configuredassignment_fk" FOREIGN KEY ("configured_assignment_id", "department_id") REFERENCES "examination_committee_assignments" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_examinations" ADD CONSTRAINT "ce_comprehensiveexamination_examination_fk" FOREIGN KEY ("examination_id", "department_id") REFERENCES "examinations" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_courses" ADD CONSTRAINT "ce_comprehensivecourse_department_fk" FOREIGN KEY ("department_id") REFERENCES "departments" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_courses" ADD CONSTRAINT "ce_comprehensivecourse_comprehensive_fk" FOREIGN KEY ("comprehensive_id", "department_id") REFERENCES "comprehensive_examinations" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_courses" ADD CONSTRAINT "ce_comprehensivecourse_examinationcourse_fk" FOREIGN KEY ("examination_course_id", "department_id") REFERENCES "examination_courses" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_courses" ADD CONSTRAINT "ce_comprehensivecourse_assessmentcomponent_fk" FOREIGN KEY ("assessment_component_id", "department_id") REFERENCES "assessment_template_components" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_courses" ADD CONSTRAINT "ce_comprehensivecourse_assignedcommitteeassignment_fk" FOREIGN KEY ("assigned_committee_assignment_id", "department_id") REFERENCES "examination_committee_assignments" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_roster_entries" ADD CONSTRAINT "ce_comprehensiverosterentry_department_fk" FOREIGN KEY ("department_id") REFERENCES "departments" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_roster_entries" ADD CONSTRAINT "ce_comprehensiverosterentry_comprehensive_fk" FOREIGN KEY ("comprehensive_id", "department_id") REFERENCES "comprehensive_examinations" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_roster_entries" ADD CONSTRAINT "ce_comprehensiverosterentry_course_fk" FOREIGN KEY ("course_id", "department_id") REFERENCES "comprehensive_courses" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_roster_entries" ADD CONSTRAINT "ce_comprehensiverosterentry_registration_fk" FOREIGN KEY ("registration_id", "department_id") REFERENCES "examination_candidate_registrations" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_roster_entries" ADD CONSTRAINT "ce_comprehensiverosterentry_candidatecourse_fk" FOREIGN KEY ("candidate_course_id", "department_id") REFERENCES "examination_candidate_courses" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_absences" ADD CONSTRAINT "ce_comprehensiveabsence_department_fk" FOREIGN KEY ("department_id") REFERENCES "departments" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_absences" ADD CONSTRAINT "ce_comprehensiveabsence_actoruser_fk" FOREIGN KEY ("actor_user_id", "department_id") REFERENCES "users" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_absences" ADD CONSTRAINT "ce_comprehensiveabsence_comprehensive_fk" FOREIGN KEY ("comprehensive_id", "department_id") REFERENCES "comprehensive_examinations" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_absences" ADD CONSTRAINT "ce_comprehensiveabsence_registration_fk" FOREIGN KEY ("registration_id", "department_id") REFERENCES "examination_candidate_registrations" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_absences" ADD CONSTRAINT "ce_comprehensiveabsence_chairmanassignment_fk" FOREIGN KEY ("chairman_assignment_id", "department_id") REFERENCES "examination_committee_assignments" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_marks" ADD CONSTRAINT "ce_comprehensivemark_department_fk" FOREIGN KEY ("department_id") REFERENCES "departments" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_marks" ADD CONSTRAINT "ce_comprehensivemark_actoruser_fk" FOREIGN KEY ("actor_user_id", "department_id") REFERENCES "users" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_marks" ADD CONSTRAINT "ce_comprehensivemark_comprehensive_fk" FOREIGN KEY ("comprehensive_id", "department_id") REFERENCES "comprehensive_examinations" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_marks" ADD CONSTRAINT "ce_comprehensivemark_rosterentry_fk" FOREIGN KEY ("roster_entry_id", "department_id") REFERENCES "comprehensive_roster_entries" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_marks" ADD CONSTRAINT "ce_comprehensivemark_committeeassignment_fk" FOREIGN KEY ("committee_assignment_id", "department_id") REFERENCES "examination_committee_assignments" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_marks" ADD CONSTRAINT "ce_comprehensivemark_externalaccess_fk" FOREIGN KEY ("external_access_id", "department_id") REFERENCES "external_comprehensive_access" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_mark_returns" ADD CONSTRAINT "ce_comprehensivemarkreturn_department_fk" FOREIGN KEY ("department_id") REFERENCES "departments" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_mark_returns" ADD CONSTRAINT "ce_comprehensivemarkreturn_actoruser_fk" FOREIGN KEY ("actor_user_id", "department_id") REFERENCES "users" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_mark_returns" ADD CONSTRAINT "ce_comprehensivemarkreturn_comprehensive_fk" FOREIGN KEY ("comprehensive_id", "department_id") REFERENCES "comprehensive_examinations" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_mark_returns" ADD CONSTRAINT "ce_comprehensivemarkreturn_mark_fk" FOREIGN KEY ("mark_id", "department_id") REFERENCES "comprehensive_marks" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_mark_returns" ADD CONSTRAINT "ce_comprehensivemarkreturn_chairmanassignment_fk" FOREIGN KEY ("chairman_assignment_id", "department_id") REFERENCES "examination_committee_assignments" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_finalisations" ADD CONSTRAINT "ce_comprehensivefinalisation_department_fk" FOREIGN KEY ("department_id") REFERENCES "departments" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_finalisations" ADD CONSTRAINT "ce_comprehensivefinalisation_actoruser_fk" FOREIGN KEY ("actor_user_id", "department_id") REFERENCES "users" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_finalisations" ADD CONSTRAINT "ce_comprehensivefinalisation_comprehensive_fk" FOREIGN KEY ("comprehensive_id", "department_id") REFERENCES "comprehensive_examinations" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_finalisations" ADD CONSTRAINT "ce_comprehensivefinalisation_chairmanassignment_fk" FOREIGN KEY ("chairman_assignment_id", "department_id") REFERENCES "examination_committee_assignments" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_final_results" ADD CONSTRAINT "ce_comprehensivefinalresult_department_fk" FOREIGN KEY ("department_id") REFERENCES "departments" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_final_results" ADD CONSTRAINT "ce_comprehensivefinalresult_finalisation_fk" FOREIGN KEY ("finalisation_id", "department_id") REFERENCES "comprehensive_finalisations" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_final_results" ADD CONSTRAINT "ce_comprehensivefinalresult_rosterentry_fk" FOREIGN KEY ("roster_entry_id", "department_id") REFERENCES "comprehensive_roster_entries" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_final_sources" ADD CONSTRAINT "ce_comprehensivefinalsource_department_fk" FOREIGN KEY ("department_id") REFERENCES "departments" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_final_sources" ADD CONSTRAINT "ce_comprehensivefinalsource_result_fk" FOREIGN KEY ("result_id", "department_id") REFERENCES "comprehensive_final_results" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "comprehensive_final_sources" ADD CONSTRAINT "ce_comprehensivefinalsource_mark_fk" FOREIGN KEY ("mark_id", "department_id") REFERENCES "comprehensive_marks" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE examination_candidate_lists ADD CONSTRAINT candidate_list_exam_scope_fk
 FOREIGN KEY(examination_id,department_id,academic_program_id,academic_session_id,academic_term_id)
 REFERENCES examinations(id,department_id,academic_program_id,academic_session_id,academic_term_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE comprehensive_marks ADD CONSTRAINT comprehensive_mark_previous_fk FOREIGN KEY(previous_id,department_id) REFERENCES comprehensive_marks(id,department_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE comprehensive_marks ADD CONSTRAINT comprehensive_mark_return_fk FOREIGN KEY(return_id,department_id) REFERENCES comprehensive_mark_returns(id,department_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX poe_chairman_current_uq ON poe_chairman_assignments(department_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX external_comprehensive_user_uq ON external_comprehensive_access(user_id) WHERE revoked_at IS NULL;
ALTER TABLE poe_chairman_assignments ADD CHECK (starts_at < expires_at AND length(btrim(source_reference)) BETWEEN 1 AND 500 AND ((revoked_at IS NULL)=(revoked_by_user_id IS NULL)));
ALTER TABLE external_comprehensive_access ADD CHECK (created_at < expires_at AND length(btrim(source_reference)) BETWEEN 1 AND 500 AND ((revoked_at IS NULL)=(revoked_by_user_id IS NULL)));
ALTER TABLE examination_candidate_lists ADD CHECK (version=1 AND length(btrim(source_reference)) BETWEEN 1 AND 500 AND ((status='CERTIFIED' AND certified_at IS NOT NULL AND certified_by_user_id IS NOT NULL AND chairman_assignment_id IS NOT NULL) OR (status='DRAFT' AND certified_at IS NULL AND certified_by_user_id IS NULL AND chairman_assignment_id IS NULL)));
ALTER TABLE examination_candidate_registrations ADD CHECK (version>0);
ALTER TABLE comprehensive_courses ADD CHECK (full_mark>0 AND template_version>0);
ALTER TABLE "comprehensive_examinations" ADD CONSTRAINT "ce_roster_lock_actor_fk" FOREIGN KEY ("roster_locked_by_user_id", "department_id") REFERENCES "users" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "comprehensive_examinations" ADD CONSTRAINT "ce_roster_lock_assignment_fk" FOREIGN KEY ("roster_locked_by_assignment_id", "department_id") REFERENCES "examination_committee_assignments" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "comprehensive_examinations" ADD CONSTRAINT "ce_marking_start_actor_fk" FOREIGN KEY ("marking_started_by_user_id", "department_id") REFERENCES "users" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "comprehensive_examinations" ADD CONSTRAINT "ce_marking_start_assignment_fk" FOREIGN KEY ("marking_started_by_assignment_id", "department_id") REFERENCES "examination_committee_assignments" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "comprehensive_examinations" ADD CONSTRAINT "ce_marking_start_external_fk" FOREIGN KEY ("marking_started_external_access_id", "department_id") REFERENCES "external_comprehensive_access" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "comprehensive_courses" ADD CONSTRAINT "ce_allocation_actor_fk" FOREIGN KEY ("allocation_changed_by_user_id", "department_id") REFERENCES "users" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "comprehensive_courses" ADD CONSTRAINT "ce_allocation_actor_assignment_fk" FOREIGN KEY ("allocation_changed_by_assignment_id", "department_id") REFERENCES "examination_committee_assignments" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE comprehensive_courses ADD CONSTRAINT ce_allocation_actor_tuple CHECK (
 (allocation_changed_by_user_id IS NULL AND allocation_changed_by_assignment_id IS NULL AND allocation_changed_by_assignment_assigned_at IS NULL) OR
 (allocation_changed_by_user_id IS NOT NULL AND allocation_changed_by_assignment_id IS NOT NULL AND allocation_changed_by_assignment_assigned_at IS NOT NULL));
ALTER TABLE comprehensive_examinations ADD CONSTRAINT ce_roster_lock_actor_tuple CHECK (
 (roster_locked_at IS NULL AND roster_locked_by_user_id IS NULL AND roster_locked_by_assignment_id IS NULL AND roster_locked_by_assignment_assigned_at IS NULL) OR
 (roster_locked_at IS NOT NULL AND roster_locked_by_user_id IS NOT NULL AND roster_locked_by_assignment_id IS NOT NULL AND roster_locked_by_assignment_assigned_at IS NOT NULL));
ALTER TABLE comprehensive_examinations ADD CONSTRAINT ce_marking_start_actor_tuple CHECK (
 (marking_started_at IS NULL AND marking_started_by_user_id IS NULL AND marking_started_by_assignment_id IS NULL AND marking_started_by_assignment_assigned_at IS NULL AND marking_started_external_access_id IS NULL) OR
 (marking_started_at IS NOT NULL AND marking_started_by_user_id IS NOT NULL AND marking_started_by_assignment_id IS NOT NULL AND marking_started_by_assignment_assigned_at IS NOT NULL));
ALTER TABLE comprehensive_marks ADD CHECK (revision>0 AND mark>=0 AND mark<=full_mark AND full_mark>0 AND ((status='SUBMITTED')=(submitted_at IS NOT NULL)) AND ((previous_id IS NULL)=(return_id IS NULL)) AND ((revision=1)=(previous_id IS NULL)));
ALTER TABLE comprehensive_mark_returns ADD CHECK (length(btrim(reason)) BETWEEN 1 AND 2000);
ALTER TABLE comprehensive_absences ADD CHECK (length(btrim(reason)) BETWEEN 1 AND 2000 AND resolution_status='SPECIAL_OR_FAILURE_RESOLUTION_REQUIRED');
ALTER TABLE comprehensive_finalisations ADD CHECK (version=1);
ALTER TABLE comprehensive_final_results ADD CHECK (mark>=0 AND mark<=full_mark AND calculation_rule='COMPREHENSIVE_EXACT_DECIMAL_V1');
ALTER TABLE comprehensive_examinations ADD CHECK (
 (status='CONFIGURED' AND marking_started_at IS NULL AND finalised_at IS NULL) OR
 (status='MARKING' AND marking_started_at IS NOT NULL AND roster_locked_at IS NOT NULL AND finalised_at IS NULL) OR
 (status='FINALISED' AND marking_started_at IS NOT NULL AND roster_locked_at IS NOT NULL AND finalised_at IS NOT NULL));

-- All ordinary SQL writes share the same Examination mutex as the application.
CREATE FUNCTION ce_lock_exam(exam_id TEXT, dept TEXT) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM id FROM examinations WHERE id=exam_id AND department_id=dept AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Examination scope unavailable'; END IF;
END $$;

-- Permission provenance is independent of the role establishing Committee identity.
-- Match EvidenceAccessService.live(), including locks on the live grant chain.
CREATE FUNCTION ce_exact_permission(actor_id TEXT, dept TEXT, permission_code TEXT, resource_arg TEXT, action_arg TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
BEGIN
 PERFORM ur.id FROM users u JOIN departments d ON d.id=u.department_id
 JOIN user_roles ur ON ur.user_id=u.id AND ur.department_id=u.department_id
 JOIN roles r ON r.id=ur.role_id AND r.department_id=ur.department_id
 JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id
 WHERE u.id=actor_id AND u.department_id=dept
 AND u.status='ACTIVE' AND u.archived_at IS NULL AND u.deleted_at IS NULL
 AND d.status='ACTIVE' AND d.archived_at IS NULL AND d.deleted_at IS NULL
 AND r.archived_at IS NULL AND ur.revoked_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at>clock_timestamp())
 AND p.code=permission_code AND p.resource=resource_arg AND p.action=action_arg AND p.scope='DEPARTMENT'
 FOR SHARE OF u,d,ur,r,rp,p;
 RETURN FOUND;
END $$;

CREATE FUNCTION ce_require_draft_poe(assignment_id TEXT, dept TEXT, actor_id TEXT)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM id FROM poe_chairman_assignments WHERE id=assignment_id AND department_id=dept
  AND user_id=actor_id AND revoked_at IS NULL AND starts_at<=clock_timestamp() AND expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current recorded POE Chairman appointment required'; END IF;
 IF NOT ce_exact_permission(actor_id,dept,'examination-candidate.classification.manage_department','examination-candidate.classification','manage') THEN RAISE EXCEPTION 'Exact classification permission required for draft recording'; END IF;
END $$;

CREATE FUNCTION ce_current_member(assignment_id TEXT, dept TEXT, committee_id_arg TEXT, actor_id TEXT, access_id TEXT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE sql AS $$
 SELECT EXISTS (
 SELECT 1 FROM examination_committee_assignments a JOIN examination_committees c ON c.id=a.committee_id AND c.department_id=a.department_id
 JOIN users u ON u.id=actor_id AND u.department_id=a.department_id
 JOIN departments d ON d.id=u.department_id
 WHERE a.id=assignment_id AND a.department_id=dept AND a.committee_id=committee_id_arg
 AND c.archived_at IS NULL AND a.status='ACTIVE' AND a.assigned_at<=clock_timestamp()
 AND (a.expires_at IS NULL OR a.expires_at>clock_timestamp()) AND a.unassigned_at IS NULL AND a.archived_at IS NULL
 AND u.status='ACTIVE' AND u.archived_at IS NULL AND u.deleted_at IS NULL
 AND d.status='ACTIVE' AND d.archived_at IS NULL AND d.deleted_at IS NULL
 AND ((a.seat<>'EXTERNAL_MEMBER' AND a.assigned_user_id=actor_id AND access_id IS NULL) OR
 (a.seat='EXTERNAL_MEMBER' AND EXISTS(SELECT 1 FROM external_comprehensive_access x
 WHERE x.id=access_id AND x.assignment_id=a.id AND x.department_id=dept AND x.user_id=actor_id
 AND x.revoked_at IS NULL AND x.expires_at>clock_timestamp() AND x.assignment_assigned_at=a.assigned_at)))
 AND EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id AND r.department_id=ur.department_id
 WHERE ur.user_id=u.id AND ur.department_id=dept AND ur.revoked_at IS NULL
 AND (ur.expires_at IS NULL OR ur.expires_at>clock_timestamp()) AND r.archived_at IS NULL
 AND r.code=CASE WHEN a.seat='EXTERNAL_MEMBER' THEN 'comprehensive_external' ELSE 'teacher' END)
 AND NOT EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id
 AND ur.revoked_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at>clock_timestamp())
 AND (r.code='student' OR (a.seat='EXTERNAL_MEMBER' AND r.code<>'comprehensive_external'))))
$$;

CREATE FUNCTION ce_current_chair(assignment_id TEXT, dept TEXT, committee_id_arg TEXT, actor_id TEXT)
RETURNS BOOLEAN LANGUAGE sql AS $$
 SELECT ce_current_member(assignment_id,dept,committee_id_arg,actor_id,NULL)
 AND EXISTS(SELECT 1 FROM examination_committee_assignments WHERE id=assignment_id AND seat='CHAIRMAN')
$$;

CREATE FUNCTION ce_appointment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Academic appointments are historical evidence'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL OR NEW.revoked_by_user_id IS NULL
   OR (to_jsonb(NEW)-'revoked_at'-'revoked_by_user_id') IS DISTINCT FROM (to_jsonb(OLD)-'revoked_at'-'revoked_by_user_id')
   THEN RAISE EXCEPTION 'Only explicit appointment revocation is permitted'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ce_poe_appointment_guard BEFORE UPDATE OR DELETE ON poe_chairman_assignments FOR EACH ROW EXECUTE FUNCTION ce_appointment_guard();
CREATE TRIGGER ce_external_access_guard BEFORE UPDATE OR DELETE ON external_comprehensive_access FOR EACH ROW EXECUTE FUNCTION ce_appointment_guard();

CREATE FUNCTION ce_candidate_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE l examination_candidate_lists%ROWTYPE; r examination_candidate_registrations%ROWTYPE; exam_id TEXT; dept TEXT;
BEGIN
 dept:=COALESCE(NEW.department_id,OLD.department_id);
 IF TG_TABLE_NAME='examination_candidate_lists' THEN
  exam_id:=COALESCE(NEW.examination_id,OLD.examination_id);
  PERFORM ce_lock_exam(exam_id,dept);
  IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND OLD.status='CERTIFIED') THEN RAISE EXCEPTION 'Candidate list is protected evidence'; END IF;
  IF TG_OP='INSERT' AND NEW.status<>'DRAFT' THEN RAISE EXCEPTION 'Certification requires draft list'; END IF;
  IF TG_OP='INSERT' THEN
   PERFORM ce_require_draft_poe(NEW.recorded_poe_assignment_id,dept,NEW.recorded_by_user_id);
  END IF;
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'status'-'certified_at'-'certified_by_user_id'-'chairman_assignment_id')
   IS DISTINCT FROM (to_jsonb(OLD)-'status'-'certified_at'-'certified_by_user_id'-'chairman_assignment_id') THEN RAISE EXCEPTION 'Candidate list identity is immutable'; END IF;
  IF NOT EXISTS(SELECT 1 FROM examinations e WHERE e.id=NEW.examination_id AND e.department_id=dept AND e.rule_version_code=NEW.rule_version_code) THEN RAISE EXCEPTION 'Candidate rule source mismatch'; END IF;
  IF NEW.status='CERTIFIED' THEN
   PERFORM id FROM poe_chairman_assignments WHERE id=NEW.chairman_assignment_id AND department_id=dept
    AND user_id=NEW.certified_by_user_id AND revoked_at IS NULL AND starts_at<=clock_timestamp() AND expires_at>clock_timestamp() FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Current POE Chairman certification is required'; END IF;
   IF NOT ce_exact_permission(NEW.certified_by_user_id,dept,'examination-candidate.classification.manage_department','examination-candidate.classification','manage') THEN RAISE EXCEPTION 'Exact classification permission required for certification'; END IF;
   IF NOT EXISTS(SELECT 1 FROM examination_candidate_registrations WHERE list_id=NEW.id) THEN RAISE EXCEPTION 'Empty candidate list'; END IF;
   IF EXISTS(SELECT 1 FROM examination_candidate_registrations cr WHERE cr.list_id=NEW.id AND NOT EXISTS(
      SELECT 1 FROM examination_candidate_courses cc WHERE cc.registration_id=cr.id)) THEN RAISE EXCEPTION 'Candidate enrollment sources incomplete'; END IF;
   IF EXISTS(SELECT 1 FROM examination_candidate_courses cc JOIN examination_candidate_registrations cr ON cr.id=cc.registration_id
     JOIN enrollments e ON e.id=cc.enrollment_id JOIN users u ON u.id=cr.student_user_id
     WHERE cr.list_id=NEW.id AND (e.status<>'APPROVED' OR e.enrolled_at IS NULL OR e.dropped_at IS NOT NULL OR e.archived_at IS NOT NULL
       OR u.status<>'ACTIVE' OR u.archived_at IS NOT NULL OR u.deleted_at IS NOT NULL)) THEN RAISE EXCEPTION 'Certification academic sources are no longer current'; END IF;
   -- Reverse completeness: every current source used by ExaminationStudentContextService
   -- must be represented, independently of the explicitly certified candidate category.
   IF EXISTS(SELECT 1 FROM examination_candidate_registrations cr
     JOIN student_curriculum_assignments s ON s.id=cr.curriculum_assignment_id
       AND s.department_id=cr.department_id AND s.student_user_id=cr.student_user_id
     JOIN enrollments e ON e.student_curriculum_assignment_id=s.id
       AND e.department_id=s.department_id AND e.student_user_id=s.student_user_id
     JOIN examination_courses ec ON ec.course_offering_id=e.course_offering_id
       AND ec.department_id=e.department_id AND ec.curriculum_course_id=e.curriculum_course_id
       AND ec.curriculum_version_id=s.curriculum_version_id
     JOIN course_offerings o ON o.id=e.course_offering_id AND o.department_id=e.department_id
     WHERE cr.list_id=NEW.id AND cr.department_id=dept AND cr.examination_id=NEW.examination_id
       AND ec.examination_id=NEW.examination_id AND s.academic_program_id=NEW.academic_program_id
       AND ec.academic_program_id=NEW.academic_program_id
       AND e.academic_term_id=NEW.academic_term_id AND ec.academic_term_id=NEW.academic_term_id
       AND ec.archived_at IS NULL AND e.status='APPROVED' AND e.enrolled_at IS NOT NULL
       AND e.dropped_at IS NULL AND e.archived_at IS NULL
       AND o.archived_at IS NULL AND o.status NOT IN ('ARCHIVED','CANCELED')
       AND NOT EXISTS(SELECT 1 FROM examination_candidate_courses cc
         WHERE cc.registration_id=cr.id AND cc.department_id=dept
           AND cc.examination_course_id=ec.id AND cc.enrollment_id=e.id))
     THEN RAISE EXCEPTION 'Certification examination sources incomplete'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='examination_candidate_registrations' THEN
  SELECT * INTO l FROM examination_candidate_lists WHERE id=COALESCE(NEW.list_id,OLD.list_id) AND department_id=dept;
 ELSE
  SELECT * INTO r FROM examination_candidate_registrations WHERE id=COALESCE(NEW.registration_id,OLD.registration_id) AND department_id=dept;
  SELECT * INTO l FROM examination_candidate_lists WHERE id=r.list_id AND department_id=dept;
 END IF;
 IF l.id IS NULL THEN RAISE EXCEPTION 'Candidate list scope mismatch'; END IF;
 PERFORM ce_lock_exam(l.examination_id,dept);
 IF l.status<>'DRAFT' THEN RAISE EXCEPTION 'Certified classification and enrollment sources are immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_TABLE_NAME='examination_candidate_registrations' THEN
  IF NEW.examination_id<>l.examination_id OR NOT EXISTS(SELECT 1 FROM student_curriculum_assignments s
    JOIN users u ON u.id=s.student_user_id AND u.department_id=s.department_id
    WHERE s.id=NEW.curriculum_assignment_id AND s.department_id=dept AND s.student_user_id=NEW.student_user_id
    AND s.academic_program_id=l.academic_program_id AND u.status='ACTIVE' AND u.archived_at IS NULL AND u.deleted_at IS NULL)
    THEN RAISE EXCEPTION 'Candidate academic identity mismatch'; END IF;
  IF TG_OP='UPDATE' AND (NEW.list_id<>OLD.list_id OR NEW.student_user_id<>OLD.student_user_id OR NEW.department_id<>OLD.department_id OR NEW.id<>OLD.id OR NEW.examination_id<>OLD.examination_id OR NEW.created_at IS DISTINCT FROM OLD.created_at)
    THEN RAISE EXCEPTION 'Draft candidate identity cannot move'; END IF;
  IF TG_OP='INSERT' THEN
   IF NEW.version IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Candidate initial version must be 1'; END IF;
  ELSIF TG_OP='UPDATE' THEN
   IF NEW.version IS DISTINCT FROM OLD.version+1 THEN RAISE EXCEPTION 'Candidate revision version must increment by exactly 1'; END IF;
   IF NEW.category IS NOT DISTINCT FROM OLD.category AND NEW.curriculum_assignment_id IS NOT DISTINCT FROM OLD.curriculum_assignment_id
    THEN RAISE EXCEPTION 'Candidate revision requires a classification or curriculum change'; END IF;
  END IF;
  PERFORM ce_require_draft_poe(NEW.recorded_poe_assignment_id,dept,NEW.recorded_by_user_id);
 ELSE
  IF NOT EXISTS(SELECT 1 FROM examination_courses ec JOIN enrollments e ON e.course_offering_id=ec.course_offering_id AND e.department_id=ec.department_id
    JOIN student_curriculum_assignments s ON s.id=e.student_curriculum_assignment_id AND s.curriculum_version_id=ec.curriculum_version_id
    WHERE ec.id=NEW.examination_course_id AND ec.examination_id=l.examination_id AND ec.department_id=dept
    AND e.id=NEW.enrollment_id AND e.student_user_id=r.student_user_id AND e.student_curriculum_assignment_id=r.curriculum_assignment_id
    AND e.curriculum_course_id=ec.curriculum_course_id AND e.academic_term_id=l.academic_term_id
    AND e.status='APPROVED' AND e.enrolled_at IS NOT NULL AND e.dropped_at IS NULL AND e.archived_at IS NULL AND ec.archived_at IS NULL)
    THEN RAISE EXCEPTION 'Candidate course identity mismatch'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ce_candidate_list_guard BEFORE INSERT OR UPDATE OR DELETE ON examination_candidate_lists FOR EACH ROW EXECUTE FUNCTION ce_candidate_guard();
CREATE TRIGGER ce_candidate_registration_guard BEFORE INSERT OR UPDATE OR DELETE ON examination_candidate_registrations FOR EACH ROW EXECUTE FUNCTION ce_candidate_guard();
CREATE TRIGGER ce_candidate_course_guard BEFORE INSERT OR UPDATE OR DELETE ON examination_candidate_courses FOR EACH ROW EXECUTE FUNCTION ce_candidate_guard();

CREATE FUNCTION ce_require_control_chair(assignment_id TEXT, dept TEXT, committee_id_arg TEXT, actor_id TEXT, assigned_at_arg TIMESTAMP)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM id FROM examination_committee_assignments WHERE id=assignment_id AND department_id=dept
  AND committee_id=committee_id_arg AND assigned_at=assigned_at_arg FOR SHARE;
 IF NOT FOUND OR NOT ce_current_chair(assignment_id,dept,committee_id_arg,actor_id) THEN RAISE EXCEPTION 'Current control Chairman required'; END IF;
 IF NOT ce_exact_permission(actor_id,dept,'comprehensive-examination.configuration.manage_department','comprehensive-examination.configuration','manage') THEN RAISE EXCEPTION 'Exact control configuration permission required'; END IF;
END $$;

CREATE FUNCTION ce_validate_roster_lock(c comprehensive_examinations) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM examination_candidate_lists l WHERE l.id=c.candidate_list_id AND l.department_id=c.department_id
   AND l.examination_id=c.examination_id AND l.status='CERTIFIED') THEN RAISE EXCEPTION 'Roster lock requires certified candidate source'; END IF;
 IF EXISTS(SELECT 1 FROM examination_courses ec JOIN assessment_template_components ac ON ac.assessment_template_id=ec.assessment_template_id AND ac.department_id=ec.department_id
    WHERE ec.examination_id=c.examination_id AND ec.department_id=c.department_id AND ec.archived_at IS NULL AND ac.code='COMPREHENSIVE_EXAMINATION'
    AND NOT EXISTS(SELECT 1 FROM comprehensive_courses co WHERE co.comprehensive_id=c.id AND co.department_id=c.department_id
      AND co.examination_course_id=ec.id AND co.assessment_component_id=ac.id AND co.full_mark=ac.maximum_marks))
  THEN RAISE EXCEPTION 'Roster lock requires complete applicable courses and REGULAR sources'; END IF;
 -- Compare multisets in both directions: omissions, extras and duplicate logical sources all fail.
 IF EXISTS(
  WITH expected AS (
   SELECT c.department_id AS department_id, c.id AS comprehensive_id, co.id AS course_id, cr.id AS registration_id,
     cr.version AS registration_version, cc.id AS candidate_course_id
   FROM examination_candidate_registrations cr
   JOIN examination_candidate_courses cc ON cc.registration_id=cr.id AND cc.department_id=cr.department_id
   JOIN comprehensive_courses co ON co.examination_course_id=cc.examination_course_id AND co.comprehensive_id=c.id AND co.department_id=c.department_id
   WHERE cr.list_id=c.candidate_list_id AND cr.department_id=c.department_id AND cr.examination_id=c.examination_id AND cr.category='REGULAR'
  ), actual AS (
   SELECT department_id,comprehensive_id,course_id,registration_id,registration_version,candidate_course_id
   FROM comprehensive_roster_entries WHERE comprehensive_id=c.id
  )
  (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
  UNION ALL
  (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
 ) THEN RAISE EXCEPTION 'Roster lock requires exact complete REGULAR sources'; END IF;
END $$;

CREATE FUNCTION ce_marking_start_authorized(c comprehensive_examinations) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE a examination_committee_assignments%ROWTYPE;
BEGIN
 SELECT * INTO a FROM examination_committee_assignments WHERE id=c.marking_started_by_assignment_id
  AND department_id=c.department_id AND committee_id=c.committee_id AND assigned_at=c.marking_started_by_assignment_assigned_at FOR SHARE;
 IF NOT FOUND THEN RETURN FALSE; END IF;
 IF c.marking_started_external_access_id IS NOT NULL THEN
  PERFORM id FROM external_comprehensive_access WHERE id=c.marking_started_external_access_id AND department_id=c.department_id FOR SHARE;
 END IF;
 IF NOT ce_current_member(a.id,c.department_id,c.committee_id,c.marking_started_by_user_id,c.marking_started_external_access_id) THEN RETURN FALSE; END IF;
 RETURN (
   ce_exact_permission(c.marking_started_by_user_id,c.department_id,'comprehensive-examination.mark.enter_department','comprehensive-examination.mark','enter')
   AND (c.mode='ALL_MEMBERS_AVERAGE' OR (c.mode='CHAIRMAN_ONLY' AND a.seat='CHAIRMAN') OR
     (c.mode='COURSE_DISTRIBUTED' AND EXISTS(SELECT 1 FROM comprehensive_courses co WHERE co.comprehensive_id=c.id
       AND co.department_id=c.department_id AND co.assigned_committee_assignment_id=a.id AND co.allocated_assignment_assigned_at=a.assigned_at)))
  ) OR (
   a.seat='CHAIRMAN' AND c.marking_started_external_access_id IS NULL
   AND ce_exact_permission(c.marking_started_by_user_id,c.department_id,'comprehensive-examination.chairman.review_department','comprehensive-examination.chairman','review')
  );
END $$;

CREATE FUNCTION ce_control_transition_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM ce_lock_exam(NEW.examination_id,NEW.department_id);
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'CONFIGURED' OR num_nonnulls(NEW.roster_locked_at,NEW.roster_locked_by_user_id,NEW.roster_locked_by_assignment_id,
    NEW.roster_locked_by_assignment_assigned_at,NEW.marking_started_at,NEW.marking_started_by_user_id,
    NEW.marking_started_by_assignment_id,NEW.marking_started_by_assignment_assigned_at,NEW.marking_started_external_access_id)<>0
   THEN RAISE EXCEPTION 'Control evidence requires explicit transitions'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.roster_locked_at IS NULL AND NEW.roster_locked_at IS NOT NULL THEN
  IF OLD.status<>'CONFIGURED' OR NEW.status<>'CONFIGURED' THEN RAISE EXCEPTION 'Roster must lock before marking'; END IF;
  PERFORM ce_require_control_chair(NEW.roster_locked_by_assignment_id,NEW.department_id,NEW.committee_id,
    NEW.roster_locked_by_user_id,NEW.roster_locked_by_assignment_assigned_at);
  PERFORM ce_validate_roster_lock(NEW);
 ELSIF (NEW.roster_locked_at,NEW.roster_locked_by_user_id,NEW.roster_locked_by_assignment_id,NEW.roster_locked_by_assignment_assigned_at)
   IS DISTINCT FROM (OLD.roster_locked_at,OLD.roster_locked_by_user_id,OLD.roster_locked_by_assignment_id,OLD.roster_locked_by_assignment_assigned_at)
  THEN RAISE EXCEPTION 'Roster lock provenance is immutable outside its lock transition'; END IF;
 IF OLD.marking_started_at IS NULL AND NEW.marking_started_at IS NOT NULL THEN
  IF OLD.status<>'CONFIGURED' OR NEW.status<>'MARKING' OR OLD.roster_locked_at IS NULL
   THEN RAISE EXCEPTION 'Marking start requires a previously locked CONFIGURED roster'; END IF;
  IF NOT ce_marking_start_authorized(NEW) THEN RAISE EXCEPTION 'Exact marking-start operation authority required'; END IF;
 ELSIF (NEW.marking_started_at,NEW.marking_started_by_user_id,NEW.marking_started_by_assignment_id,
     NEW.marking_started_by_assignment_assigned_at,NEW.marking_started_external_access_id)
   IS DISTINCT FROM (OLD.marking_started_at,OLD.marking_started_by_user_id,OLD.marking_started_by_assignment_id,
     OLD.marking_started_by_assignment_assigned_at,OLD.marking_started_external_access_id)
  THEN RAISE EXCEPTION 'Marking-start provenance is immutable outside its start transition'; END IF;
 IF (NEW.status='MARKING' AND NEW.marking_started_at IS NULL) OR (OLD.marking_started_at IS NOT NULL AND NEW.status='CONFIGURED')
  THEN RAISE EXCEPTION 'Invalid marking status transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ce_control_transition_guard BEFORE INSERT OR UPDATE ON comprehensive_examinations FOR EACH ROW EXECUTE FUNCTION ce_control_transition_guard();

CREATE FUNCTION ce_configuration_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c comprehensive_examinations%ROWTYPE; course comprehensive_courses%ROWTYPE; allocation_changed BOOLEAN;
BEGIN
 IF TG_TABLE_NAME='comprehensive_examinations' THEN
  PERFORM ce_lock_exam(COALESCE(NEW.examination_id,OLD.examination_id),COALESCE(NEW.department_id,OLD.department_id));
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Comprehensive configuration is historical evidence'; END IF;
  IF TG_OP='UPDATE' THEN
   IF OLD.status='FINALISED' THEN RAISE EXCEPTION 'Final Comprehensive Examination is immutable'; END IF;
   IF (to_jsonb(NEW)-'mode'-'exam_date'-'configured_by_user_id'-'configured_assignment_id'-'configured_assignment_assigned_at'-'status'-'roster_locked_at'-'marking_started_at'-'finalised_at'-'roster_locked_by_user_id'-'roster_locked_by_assignment_id'-'roster_locked_by_assignment_assigned_at'-'marking_started_by_user_id'-'marking_started_by_assignment_id'-'marking_started_by_assignment_assigned_at'-'marking_started_external_access_id') IS DISTINCT FROM
      (to_jsonb(OLD)-'mode'-'exam_date'-'configured_by_user_id'-'configured_assignment_id'-'configured_assignment_assigned_at'-'status'-'roster_locked_at'-'marking_started_at'-'finalised_at'-'roster_locked_by_user_id'-'roster_locked_by_assignment_id'-'roster_locked_by_assignment_assigned_at'-'marking_started_by_user_id'-'marking_started_by_assignment_id'-'marking_started_by_assignment_assigned_at'-'marking_started_external_access_id') THEN RAISE EXCEPTION 'Comprehensive scope is immutable'; END IF;
   IF OLD.marking_started_at IS NOT NULL AND (NEW.mode<>OLD.mode OR NEW.exam_date<>OLD.exam_date OR NEW.configured_by_user_id<>OLD.configured_by_user_id OR NEW.configured_assignment_id<>OLD.configured_assignment_id OR NEW.configured_assignment_assigned_at<>OLD.configured_assignment_assigned_at OR NEW.marking_started_at<>OLD.marking_started_at OR NEW.status='CONFIGURED') THEN RAISE EXCEPTION 'Mode and configuration are frozen'; END IF;
   IF OLD.roster_locked_at IS NOT NULL AND NEW.roster_locked_at IS DISTINCT FROM OLD.roster_locked_at THEN RAISE EXCEPTION 'Roster lock is immutable'; END IF;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM examination_candidate_lists l JOIN examination_committees co ON co.examination_id=l.examination_id AND co.department_id=l.department_id
    JOIN examinations e ON e.id=l.examination_id
    WHERE l.id=NEW.candidate_list_id AND l.examination_id=NEW.examination_id AND l.department_id=NEW.department_id AND l.status='CERTIFIED'
    AND co.id=NEW.committee_id AND co.archived_at IS NULL AND NEW.rule_version_code=e.rule_version_code) THEN RAISE EXCEPTION 'Certified candidate/Committee scope mismatch'; END IF;
  IF TG_OP='INSERT' OR NEW.configured_assignment_id IS DISTINCT FROM OLD.configured_assignment_id OR NEW.configured_assignment_assigned_at IS DISTINCT FROM OLD.configured_assignment_assigned_at OR NEW.configured_by_user_id IS DISTINCT FROM OLD.configured_by_user_id OR NEW.mode IS DISTINCT FROM OLD.mode OR NEW.exam_date IS DISTINCT FROM OLD.exam_date THEN
   IF NOT ce_exact_permission(NEW.configured_by_user_id,NEW.department_id,'comprehensive-examination.configuration.manage_department','comprehensive-examination.configuration','manage') THEN RAISE EXCEPTION 'Exact configuration permission required'; END IF;
   IF NOT ce_current_chair(NEW.configured_assignment_id,NEW.department_id,NEW.committee_id,NEW.configured_by_user_id) OR NOT EXISTS(SELECT 1 FROM examination_committee_assignments WHERE id=NEW.configured_assignment_id AND assigned_at=NEW.configured_assignment_assigned_at) THEN RAISE EXCEPTION 'Current configuration Chairman required'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO c FROM comprehensive_examinations WHERE id=COALESCE(NEW.comprehensive_id,OLD.comprehensive_id) AND department_id=COALESCE(NEW.department_id,OLD.department_id);
 IF c.id IS NULL THEN RAISE EXCEPTION 'Comprehensive scope mismatch'; END IF;
 PERFORM ce_lock_exam(c.examination_id,c.department_id);
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Comprehensive academic sources are historical evidence'; END IF;
 -- Allocation changes carry their own actor; authoritative roster-lock provenance lives on the parent.
 IF TG_TABLE_NAME='comprehensive_courses' THEN
  IF c.status<>'CONFIGURED' THEN RAISE EXCEPTION 'Course allocation/configuration is frozen'; END IF;
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'assigned_committee_assignment_id'-'allocated_assignment_assigned_at'-'allocation_changed_by_user_id'-'allocation_changed_by_assignment_id'-'allocation_changed_by_assignment_assigned_at') IS DISTINCT FROM (to_jsonb(OLD)-'assigned_committee_assignment_id'-'allocated_assignment_assigned_at'-'allocation_changed_by_user_id'-'allocation_changed_by_assignment_id'-'allocation_changed_by_assignment_assigned_at') THEN RAISE EXCEPTION 'Course source identity is immutable'; END IF;
  IF (NEW.assigned_committee_assignment_id IS NULL) <> (NEW.allocated_assignment_assigned_at IS NULL) THEN RAISE EXCEPTION 'Allocation requires exact appointment timestamp'; END IF;
  IF TG_OP='INSERT' AND c.roster_locked_at IS NOT NULL THEN RAISE EXCEPTION 'Roster course set is frozen'; END IF;
  IF TG_OP='INSERT' THEN
   allocation_changed:=NEW.assigned_committee_assignment_id IS NOT NULL;
  ELSE
   allocation_changed:=(NEW.assigned_committee_assignment_id,NEW.allocated_assignment_assigned_at)
    IS DISTINCT FROM (OLD.assigned_committee_assignment_id,OLD.allocated_assignment_assigned_at);
  END IF;
  IF allocation_changed THEN
   PERFORM ce_require_control_chair(NEW.allocation_changed_by_assignment_id,c.department_id,c.committee_id,
     NEW.allocation_changed_by_user_id,NEW.allocation_changed_by_assignment_assigned_at);
  ELSIF TG_OP='INSERT' THEN
   IF num_nonnulls(NEW.allocation_changed_by_user_id,NEW.allocation_changed_by_assignment_id,NEW.allocation_changed_by_assignment_assigned_at)<>0
    THEN RAISE EXCEPTION 'Allocation actor requires a target change'; END IF;
  ELSIF (NEW.allocation_changed_by_user_id,NEW.allocation_changed_by_assignment_id,NEW.allocation_changed_by_assignment_assigned_at)
    IS DISTINCT FROM (OLD.allocation_changed_by_user_id,OLD.allocation_changed_by_assignment_id,OLD.allocation_changed_by_assignment_assigned_at)
   THEN RAISE EXCEPTION 'Allocation actor requires a target change'; END IF;
  IF NOT EXISTS(SELECT 1 FROM examination_courses ec JOIN assessment_template_components ac ON ac.assessment_template_id=ec.assessment_template_id AND ac.department_id=ec.department_id
    JOIN course_assessment_templates t ON t.id=ac.assessment_template_id
    WHERE ec.id=NEW.examination_course_id AND ec.examination_id=c.examination_id AND ec.department_id=c.department_id
    AND ac.id=NEW.assessment_component_id AND ac.code='COMPREHENSIVE_EXAMINATION' AND ac.maximum_marks=NEW.full_mark
    AND t.version_number=NEW.template_version AND t.archived_at IS NULL AND ec.archived_at IS NULL) THEN RAISE EXCEPTION 'Comprehensive component/full mark mismatch'; END IF;
  IF NEW.assigned_committee_assignment_id IS NOT NULL AND (c.mode<>'COURSE_DISTRIBUTED' OR NOT EXISTS(
    SELECT 1 FROM examination_committee_assignments a WHERE a.id=NEW.assigned_committee_assignment_id AND a.committee_id=c.committee_id
    AND a.department_id=c.department_id AND a.status='ACTIVE' AND a.assigned_at=NEW.allocated_assignment_assigned_at AND a.assigned_at<=clock_timestamp() AND (a.expires_at IS NULL OR a.expires_at>clock_timestamp())
    AND a.unassigned_at IS NULL AND a.archived_at IS NULL)) THEN RAISE EXCEPTION 'Course allocation must target current exact appointment'; END IF;
 ELSE
  IF TG_OP='UPDATE' OR c.roster_locked_at IS NOT NULL OR c.status<>'CONFIGURED' THEN RAISE EXCEPTION 'Regular roster is immutable'; END IF;
  IF NOT EXISTS(SELECT 1 FROM examination_candidate_registrations r JOIN examination_candidate_lists l ON l.id=r.list_id
    JOIN examination_candidate_courses cc ON cc.registration_id=r.id JOIN comprehensive_courses co ON co.examination_course_id=cc.examination_course_id
    WHERE r.id=NEW.registration_id AND r.department_id=c.department_id AND r.category='REGULAR' AND r.version=NEW.registration_version
    AND l.id=c.candidate_list_id AND l.status='CERTIFIED' AND cc.id=NEW.candidate_course_id AND co.id=NEW.course_id AND co.comprehensive_id=c.id)
    THEN RAISE EXCEPTION 'Roster requires exact certified REGULAR registration/course sources'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ce_configuration_guard BEFORE INSERT OR UPDATE OR DELETE ON comprehensive_examinations FOR EACH ROW EXECUTE FUNCTION ce_configuration_guard();
CREATE TRIGGER ce_course_guard BEFORE INSERT OR UPDATE OR DELETE ON comprehensive_courses FOR EACH ROW EXECUTE FUNCTION ce_configuration_guard();
CREATE TRIGGER ce_roster_guard BEFORE INSERT OR UPDATE OR DELETE ON comprehensive_roster_entries FOR EACH ROW EXECUTE FUNCTION ce_configuration_guard();

CREATE FUNCTION ce_mark_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c comprehensive_examinations%ROWTYPE; roster_row comprehensive_roster_entries%ROWTYPE; course comprehensive_courses%ROWTYPE;
 previous comprehensive_marks%ROWTYPE; a examination_committee_assignments%ROWTYPE;
BEGIN
 SELECT * INTO c FROM comprehensive_examinations WHERE id=COALESCE(NEW.comprehensive_id,OLD.comprehensive_id) AND department_id=COALESCE(NEW.department_id,OLD.department_id);
 IF c.id IS NULL THEN RAISE EXCEPTION 'Comprehensive scope mismatch'; END IF;
 PERFORM ce_lock_exam(c.examination_id,c.department_id);
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Mark history cannot be deleted'; END IF;
 IF c.status<>'MARKING' OR c.roster_locked_at IS NULL THEN RAISE EXCEPTION 'Marking is not open'; END IF;
 IF NOT ce_exact_permission(NEW.actor_user_id,c.department_id,'comprehensive-examination.mark.enter_department','comprehensive-examination.mark','enter') THEN RAISE EXCEPTION 'Exact mark-enter permission required'; END IF;
 IF TG_OP='UPDATE' AND (OLD.status='SUBMITTED' OR (to_jsonb(NEW)-'mark'-'status'-'submitted_at') IS DISTINCT FROM (to_jsonb(OLD)-'mark'-'status'-'submitted_at')) THEN RAISE EXCEPTION 'Submitted mark and draft provenance are immutable'; END IF;
 SELECT * INTO roster_row FROM comprehensive_roster_entries WHERE id=NEW.roster_entry_id AND comprehensive_id=c.id AND department_id=c.department_id;
 SELECT * INTO course FROM comprehensive_courses WHERE id=roster_row.course_id;
 SELECT * INTO a FROM examination_committee_assignments WHERE id=NEW.committee_assignment_id AND department_id=c.department_id FOR SHARE;
 IF roster_row.id IS NULL OR course.id IS NULL OR a.id IS NULL OR a.seat<>NEW.seat OR a.assigned_at<>NEW.assignment_assigned_at OR NEW.full_mark<>course.full_mark
   OR NOT ce_current_member(a.id,c.department_id,c.committee_id,NEW.actor_user_id,NEW.external_access_id) THEN RAISE EXCEPTION 'Mark source/author identity mismatch'; END IF;
 IF (c.mode='CHAIRMAN_ONLY' AND NEW.seat<>'CHAIRMAN') OR (c.mode='COURSE_DISTRIBUTED' AND (course.assigned_committee_assignment_id IS DISTINCT FROM a.id OR course.allocated_assignment_assigned_at IS DISTINCT FROM a.assigned_at)) THEN RAISE EXCEPTION 'Mark author lacks exact mode/course authority'; END IF;
 IF EXISTS(SELECT 1 FROM comprehensive_absences WHERE comprehensive_id=c.id AND registration_id=roster_row.registration_id) THEN RAISE EXCEPTION 'Absent candidate requires resolution'; END IF;
 IF TG_OP='INSERT' THEN
  SELECT * INTO previous FROM comprehensive_marks WHERE roster_entry_id=NEW.roster_entry_id AND seat=NEW.seat ORDER BY revision DESC LIMIT 1;
  IF previous.id IS NULL THEN
   IF NEW.revision<>1 OR NEW.previous_id IS NOT NULL OR NEW.return_id IS NOT NULL THEN RAISE EXCEPTION 'Invalid first revision'; END IF;
  ELSE
   IF NEW.previous_id IS DISTINCT FROM previous.id OR NEW.revision<>previous.revision+1 OR previous.status<>'SUBMITTED'
    OR previous.committee_assignment_id<>NEW.committee_assignment_id OR previous.assignment_assigned_at<>NEW.assignment_assigned_at
    OR previous.actor_user_id<>NEW.actor_user_id OR previous.external_access_id IS DISTINCT FROM NEW.external_access_id
    OR NOT EXISTS(SELECT 1 FROM comprehensive_mark_returns WHERE id=NEW.return_id AND mark_id=previous.id AND comprehensive_id=c.id)
    THEN RAISE EXCEPTION 'Correction requires exact returned predecessor and original current actor'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ce_mark_guard BEFORE INSERT OR UPDATE OR DELETE ON comprehensive_marks FOR EACH ROW EXECUTE FUNCTION ce_mark_guard();

CREATE FUNCTION ce_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c comprehensive_examinations%ROWTYPE; m comprehensive_marks%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Review/absence evidence is immutable'; END IF;
 SELECT * INTO c FROM comprehensive_examinations WHERE id=NEW.comprehensive_id AND department_id=NEW.department_id;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Comprehensive scope mismatch'; END IF;
 PERFORM ce_lock_exam(c.examination_id,c.department_id);
 IF c.status<>'MARKING' OR NOT ce_current_chair(NEW.chairman_assignment_id,c.department_id,c.committee_id,NEW.actor_user_id) OR NOT EXISTS(SELECT 1 FROM examination_committee_assignments WHERE id=NEW.chairman_assignment_id AND assigned_at=NEW.assignment_assigned_at) THEN RAISE EXCEPTION 'Current reviewing Chairman and open marking required'; END IF;
 IF NOT ce_exact_permission(NEW.actor_user_id,c.department_id,'comprehensive-examination.chairman.review_department','comprehensive-examination.chairman','review') THEN RAISE EXCEPTION 'Exact review permission required'; END IF;
 IF TG_TABLE_NAME='comprehensive_mark_returns' THEN
  SELECT * INTO m FROM comprehensive_marks WHERE id=NEW.mark_id AND comprehensive_id=c.id AND department_id=c.department_id;
  IF c.mode='CHAIRMAN_ONLY' OR m.id IS NULL OR m.status<>'SUBMITTED' OR
    EXISTS(SELECT 1 FROM comprehensive_marks WHERE roster_entry_id=m.roster_entry_id AND seat=m.seat AND revision>m.revision)
    OR NOT EXISTS(SELECT 1 FROM examination_committee_assignments WHERE id=m.committee_assignment_id AND assigned_at=m.assignment_assigned_at)
    OR NOT ce_current_member(m.committee_assignment_id,c.department_id,c.committee_id,m.actor_user_id,m.external_access_id)
    OR NOT ce_exact_permission(m.actor_user_id,c.department_id,'comprehensive-examination.mark.enter_department','comprehensive-examination.mark','enter')
    THEN RAISE EXCEPTION 'Return requires exact current submitted evidence'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM comprehensive_roster_entries WHERE comprehensive_id=c.id AND registration_id=NEW.registration_id)
    OR EXISTS(SELECT 1 FROM comprehensive_marks cm JOIN comprehensive_roster_entries r ON r.id=cm.roster_entry_id WHERE r.comprehensive_id=c.id AND r.registration_id=NEW.registration_id)
    THEN RAISE EXCEPTION 'Absence conflicts with candidate/marks'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ce_return_guard BEFORE INSERT OR UPDATE OR DELETE ON comprehensive_mark_returns FOR EACH ROW EXECUTE FUNCTION ce_review_guard();
CREATE TRIGGER ce_absence_guard BEFORE INSERT OR UPDATE OR DELETE ON comprehensive_absences FOR EACH ROW EXECUTE FUNCTION ce_review_guard();

CREATE FUNCTION ce_marking_start_validate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 -- Evidence cannot predate this transition: both INSERT guards require MARKING,
 -- and the start tuple cannot be cleared or replaced. Validate only the queued
 -- NULL-to-non-NULL transition, so a later transaction cannot supply its proof.
 -- Matching rows have already passed ce_mark_guard or ce_review_guard; their
 -- actor/source tuples and their existence are protected by those same guards.
 IF NOT EXISTS(SELECT 1 FROM comprehensive_marks m
   WHERE m.comprehensive_id=NEW.id AND m.department_id=NEW.department_id
    AND m.actor_user_id=NEW.marking_started_by_user_id
    AND m.committee_assignment_id=NEW.marking_started_by_assignment_id
    AND m.assignment_assigned_at=NEW.marking_started_by_assignment_assigned_at
    AND m.external_access_id IS NOT DISTINCT FROM NEW.marking_started_external_access_id)
  AND NOT EXISTS(SELECT 1 FROM comprehensive_absences a
   WHERE a.comprehensive_id=NEW.id AND a.department_id=NEW.department_id
    AND a.actor_user_id=NEW.marking_started_by_user_id
    AND a.chairman_assignment_id=NEW.marking_started_by_assignment_id
    AND a.assignment_assigned_at=NEW.marking_started_by_assignment_assigned_at
    AND NEW.marking_started_external_access_id IS NULL)
  THEN RAISE EXCEPTION 'Marking start requires matching first mark or absence evidence in the same transaction'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER ce_marking_start_validate AFTER UPDATE ON comprehensive_examinations
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 WHEN (OLD.marking_started_at IS NULL AND NEW.marking_started_at IS NOT NULL)
 EXECUTE FUNCTION ce_marking_start_validate();

CREATE FUNCTION ce_final_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c comprehensive_examinations%ROWTYPE; f comprehensive_finalisations%ROWTYPE; result comprehensive_final_results%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Authoritative Comprehensive evidence is immutable'; END IF;
 IF TG_TABLE_NAME='comprehensive_finalisations' THEN
  SELECT * INTO c FROM comprehensive_examinations WHERE id=NEW.comprehensive_id AND department_id=NEW.department_id;
 ELSIF TG_TABLE_NAME='comprehensive_final_results' THEN
  SELECT * INTO f FROM comprehensive_finalisations WHERE id=NEW.finalisation_id AND department_id=NEW.department_id;
  SELECT * INTO c FROM comprehensive_examinations WHERE id=f.comprehensive_id AND department_id=f.department_id;
 ELSE
  SELECT * INTO result FROM comprehensive_final_results WHERE id=NEW.result_id AND department_id=NEW.department_id;
  SELECT * INTO f FROM comprehensive_finalisations WHERE id=result.finalisation_id AND department_id=result.department_id;
  SELECT * INTO c FROM comprehensive_examinations WHERE id=f.comprehensive_id AND department_id=f.department_id;
 END IF;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Final source scope mismatch'; END IF;
 PERFORM ce_lock_exam(c.examination_id,c.department_id);
 IF c.status<>'MARKING' THEN RAISE EXCEPTION 'Final evidence insertion is closed'; END IF;
 -- Separate branches are required: PostgreSQL resolves NEW fields before boolean
 -- short-circuiting, and each table has a different row shape.
 IF TG_TABLE_NAME='comprehensive_finalisations' THEN
  IF NOT ce_exact_permission(NEW.actor_user_id,c.department_id,'comprehensive-examination.chairman.finalise_department','comprehensive-examination.chairman','finalise') THEN RAISE EXCEPTION 'Exact finalise permission required'; END IF;
  IF NEW.mode<>c.mode OR NEW.rule_version_code<>c.rule_version_code OR
    NOT ce_current_chair(NEW.chairman_assignment_id,c.department_id,c.committee_id,NEW.actor_user_id) OR NOT EXISTS(
     SELECT 1 FROM examination_committee_assignments WHERE id=NEW.chairman_assignment_id AND assigned_at=NEW.assignment_assigned_at) THEN RAISE EXCEPTION 'Finalisation Chairman/source mismatch'; END IF;
 ELSIF TG_TABLE_NAME='comprehensive_final_results' THEN
  IF NOT EXISTS(SELECT 1 FROM comprehensive_roster_entries r JOIN comprehensive_courses co ON co.id=r.course_id
   WHERE r.id=NEW.roster_entry_id AND r.comprehensive_id=c.id AND r.department_id=c.department_id AND co.full_mark=NEW.full_mark) THEN RAISE EXCEPTION 'Final candidate/course mismatch'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM comprehensive_marks m
   WHERE m.id=NEW.mark_id AND m.department_id=c.department_id AND m.comprehensive_id=c.id AND m.roster_entry_id=result.roster_entry_id AND m.status='SUBMITTED') THEN RAISE EXCEPTION 'Final mark source mismatch'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ce_finalisation_guard BEFORE INSERT OR UPDATE OR DELETE ON comprehensive_finalisations FOR EACH ROW EXECUTE FUNCTION ce_final_guard();
CREATE TRIGGER ce_result_guard BEFORE INSERT OR UPDATE OR DELETE ON comprehensive_final_results FOR EACH ROW EXECUTE FUNCTION ce_final_guard();
CREATE TRIGGER ce_final_source_guard BEFORE INSERT OR UPDATE OR DELETE ON comprehensive_final_sources FOR EACH ROW EXECUTE FUNCTION ce_final_guard();

-- Deferred whole-package validation rejects partial, stale or client-calculated final evidence.
CREATE FUNCTION ce_package_validate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c comprehensive_examinations%ROWTYPE; f comprehensive_finalisations%ROWTYPE; item RECORD; required_count INTEGER; actual_count INTEGER; distinct_seats INTEGER; average_mark NUMERIC;
BEGIN
 SELECT * INTO c FROM comprehensive_examinations WHERE id=NEW.id;
 IF c.status='CONFIGURED' THEN RETURN NULL; END IF;
 IF (SELECT count(*) FROM examination_committee_assignments a WHERE a.committee_id=c.committee_id AND a.department_id=c.department_id
   AND a.status='ACTIVE' AND a.assigned_at<=clock_timestamp() AND (a.expires_at IS NULL OR a.expires_at>clock_timestamp()) AND a.unassigned_at IS NULL AND a.archived_at IS NULL)<>4 THEN RAISE EXCEPTION 'Four current formal seats required'; END IF;
 IF EXISTS(SELECT 1 FROM examination_courses ec JOIN assessment_template_components ac ON ac.assessment_template_id=ec.assessment_template_id AND ac.department_id=ec.department_id
  WHERE ec.examination_id=c.examination_id AND ec.department_id=c.department_id AND ec.archived_at IS NULL AND ac.code='COMPREHENSIVE_EXAMINATION'
  AND NOT EXISTS(SELECT 1 FROM comprehensive_courses co WHERE co.comprehensive_id=c.id AND co.examination_course_id=ec.id AND co.assessment_component_id=ac.id AND co.full_mark=ac.maximum_marks)) THEN RAISE EXCEPTION 'Applicable course source set incomplete'; END IF;
 IF NOT EXISTS(SELECT 1 FROM comprehensive_roster_entries WHERE comprehensive_id=c.id) OR EXISTS(
  SELECT 1 FROM examination_candidate_registrations cr JOIN examination_candidate_courses cc ON cc.registration_id=cr.id
  JOIN comprehensive_courses co ON co.examination_course_id=cc.examination_course_id AND co.comprehensive_id=c.id
  WHERE cr.list_id=c.candidate_list_id AND cr.category='REGULAR' AND NOT EXISTS(SELECT 1 FROM comprehensive_roster_entries r
    WHERE r.comprehensive_id=c.id AND r.registration_id=cr.id AND r.registration_version=cr.version AND r.candidate_course_id=cc.id AND r.course_id=co.id)) THEN RAISE EXCEPTION 'Regular roster incomplete'; END IF;
 IF c.mode='COURSE_DISTRIBUTED' AND EXISTS(SELECT 1 FROM comprehensive_courses co WHERE co.comprehensive_id=c.id AND NOT EXISTS(
   SELECT 1 FROM examination_committee_assignments a WHERE a.id=co.assigned_committee_assignment_id AND a.committee_id=c.committee_id AND a.status='ACTIVE'
   AND a.unassigned_at IS NULL AND a.archived_at IS NULL AND a.assigned_at=co.allocated_assignment_assigned_at AND a.assigned_at<=clock_timestamp() AND (a.expires_at IS NULL OR a.expires_at>clock_timestamp()))) THEN RAISE EXCEPTION 'Course allocation incomplete or stale'; END IF;
 IF c.status<>'FINALISED' THEN RETURN NULL; END IF;
 SELECT * INTO f FROM comprehensive_finalisations WHERE comprehensive_id=c.id AND department_id=c.department_id;
 IF f.id IS NULL OR c.finalised_at IS DISTINCT FROM f.created_at OR NOT ce_current_chair(f.chairman_assignment_id,c.department_id,c.committee_id,f.actor_user_id) THEN RAISE EXCEPTION 'Finalisation boundary missing'; END IF;
 IF NOT ce_exact_permission(f.actor_user_id,c.department_id,'comprehensive-examination.chairman.finalise_department','comprehensive-examination.chairman','finalise') THEN RAISE EXCEPTION 'Exact finalise permission required at final boundary'; END IF;
 IF EXISTS(SELECT 1 FROM comprehensive_absences WHERE comprehensive_id=c.id) THEN RAISE EXCEPTION 'Unresolved absence cannot become a mark'; END IF;
 IF (SELECT count(*) FROM comprehensive_final_results WHERE finalisation_id=f.id)<>(SELECT count(*) FROM comprehensive_roster_entries WHERE comprehensive_id=c.id) THEN RAISE EXCEPTION 'Final result completeness failure'; END IF;
 required_count:=CASE WHEN c.mode='ALL_MEMBERS_AVERAGE' THEN 4 ELSE 1 END;
 FOR item IN SELECT res.*,co.assigned_committee_assignment_id FROM comprehensive_final_results res
   JOIN comprehensive_roster_entries r ON r.id=res.roster_entry_id JOIN comprehensive_courses co ON co.id=r.course_id WHERE res.finalisation_id=f.id LOOP
  SELECT count(*),count(DISTINCT m.seat),avg(m.mark) INTO actual_count,distinct_seats,average_mark
    FROM comprehensive_final_sources src JOIN comprehensive_marks m ON m.id=src.mark_id
    JOIN examination_committee_assignments a ON a.id=m.committee_assignment_id
    WHERE src.result_id=item.id AND m.roster_entry_id=item.roster_entry_id AND m.status='SUBMITTED' AND m.full_mark=item.full_mark
    AND m.assignment_assigned_at=a.assigned_at AND m.seat=a.seat
    AND ce_current_member(a.id,c.department_id,c.committee_id,m.actor_user_id,m.external_access_id)
    AND ce_exact_permission(m.actor_user_id,c.department_id,'comprehensive-examination.mark.enter_department','comprehensive-examination.mark','enter')
    AND (c.mode='ALL_MEMBERS_AVERAGE' OR (c.mode='CHAIRMAN_ONLY' AND m.seat='CHAIRMAN') OR (c.mode='COURSE_DISTRIBUTED' AND a.id=item.assigned_committee_assignment_id))
    AND NOT EXISTS(SELECT 1 FROM comprehensive_marks newer WHERE newer.roster_entry_id=m.roster_entry_id AND newer.seat=m.seat AND newer.revision>m.revision)
    AND NOT EXISTS(SELECT 1 FROM comprehensive_mark_returns ret WHERE ret.mark_id=m.id);
  IF actual_count<>required_count OR distinct_seats<>required_count OR item.mark IS DISTINCT FROM average_mark
    OR (SELECT count(*) FROM comprehensive_final_sources WHERE result_id=item.id)<>required_count THEN RAISE EXCEPTION 'Final value must bind complete exact current sources and exact arithmetic mean'; END IF;
 END LOOP;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ce_package_validate AFTER INSERT OR UPDATE ON comprehensive_examinations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ce_package_validate();

-- A finalisation row must never be committed without the matching FINALISED package.
CREATE FUNCTION ce_final_boundary_validate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM comprehensive_examinations WHERE id=NEW.comprehensive_id AND department_id=NEW.department_id AND status='FINALISED') THEN RAISE EXCEPTION 'Incomplete finalisation transaction'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ce_final_boundary_validate AFTER INSERT ON comprehensive_finalisations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ce_final_boundary_validate();

-- Certified registrations retain the original academic linkage even when source
-- records later change lifecycle status. Only their identity columns are frozen.
CREATE FUNCTION ce_registered_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='student_curriculum_assignments' THEN
  IF (NEW.id,NEW.department_id,NEW.student_user_id,NEW.academic_program_id,NEW.curriculum_version_id)
    IS DISTINCT FROM (OLD.id,OLD.department_id,OLD.student_user_id,OLD.academic_program_id,OLD.curriculum_version_id)
    AND EXISTS(SELECT 1 FROM examination_candidate_registrations r JOIN examination_candidate_lists l ON l.id=r.list_id
      WHERE r.curriculum_assignment_id=OLD.id AND l.status='CERTIFIED') THEN RAISE EXCEPTION 'Certified curriculum identity is immutable'; END IF;
 ELSIF TG_TABLE_NAME='enrollments' THEN
  IF (NEW.id,NEW.department_id,NEW.student_user_id,NEW.academic_term_id,NEW.course_offering_id,NEW.curriculum_course_id,NEW.student_curriculum_assignment_id)
    IS DISTINCT FROM (OLD.id,OLD.department_id,OLD.student_user_id,OLD.academic_term_id,OLD.course_offering_id,OLD.curriculum_course_id,OLD.student_curriculum_assignment_id)
    AND EXISTS(SELECT 1 FROM examination_candidate_courses cc JOIN examination_candidate_registrations r ON r.id=cc.registration_id
      JOIN examination_candidate_lists l ON l.id=r.list_id WHERE cc.enrollment_id=OLD.id AND l.status='CERTIFIED') THEN RAISE EXCEPTION 'Certified enrollment identity is immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ce_registered_curriculum_guard BEFORE UPDATE ON student_curriculum_assignments FOR EACH ROW EXECUTE FUNCTION ce_registered_source_guard();
CREATE TRIGGER ce_registered_enrollment_guard BEFORE UPDATE ON enrollments FOR EACH ROW EXECUTE FUNCTION ce_registered_source_guard();

CREATE FUNCTION ce_external_binding_validate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM a.id FROM examination_committee_assignments a JOIN examination_committees c ON c.id=a.committee_id AND c.department_id=a.department_id
 JOIN users u ON u.id=NEW.user_id AND u.department_id=a.department_id
 WHERE a.id=NEW.assignment_id AND a.department_id=NEW.department_id AND a.seat='EXTERNAL_MEMBER'
 AND a.assigned_user_id IS NULL AND a.assigned_at=NEW.assignment_assigned_at AND a.assigned_at<=clock_timestamp()
 AND a.status='ACTIVE' AND a.unassigned_at IS NULL AND a.archived_at IS NULL AND c.archived_at IS NULL
 AND (a.expires_at IS NULL OR (a.expires_at>clock_timestamp() AND NEW.expires_at<=a.expires_at))
 AND u.status='ACTIVE' AND u.archived_at IS NULL AND u.deleted_at IS NULL FOR SHARE OF a,c,u;
 IF NOT FOUND THEN RAISE EXCEPTION 'Digital binding requires exact current External Member appointment'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ce_external_binding_validate BEFORE INSERT ON external_comprehensive_access FOR EACH ROW EXECUTE FUNCTION ce_external_binding_validate();

COMMIT;
