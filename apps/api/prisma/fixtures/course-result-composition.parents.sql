-- Extends the existing synthetic /40 boundary fixture. Source-owner protection
-- has separate regression suites; mutable synthetic sources permit hostile probes.
ALTER TABLE examination_courses ADD COLUMN summative_full_mark NUMERIC(6,2) DEFAULT 60;
ALTER TABLE examination_candidate_lists ADD CONSTRAINT crc_fixture_list_uq UNIQUE(id,department_id);
ALTER TABLE examination_candidate_registrations ADD CONSTRAINT crc_fixture_reg_uq UNIQUE(id,department_id);
ALTER TABLE examination_candidate_courses ADD CONSTRAINT crc_fixture_cc_uq UNIQUE(id,department_id);
ALTER TABLE examination_candidate_lists ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE examination_candidate_lists ADD COLUMN rule_version_code TEXT DEFAULT 'REGULAR_RULE';
ALTER TABLE examination_candidate_lists ADD COLUMN certified_at TIMESTAMP(3) DEFAULT '2026-01-01';
ALTER TABLE examination_candidate_lists ADD COLUMN certified_by_user_id TEXT DEFAULT 'chair';
ALTER TABLE examination_candidate_lists ADD COLUMN chairman_assignment_id TEXT DEFAULT 'chair-assignment';
CREATE TABLE summative_examination_candidates(id TEXT PRIMARY KEY, department_id TEXT, examination_id TEXT,
  examination_course_id TEXT, course_offering_id TEXT, enrollment_id TEXT, student_user_id TEXT,
  UNIQUE(id,department_id,examination_id,examination_course_id));
CREATE TABLE summative_calculated_marks(id TEXT PRIMARY KEY, department_id TEXT, examination_id TEXT,
  examination_course_id TEXT, candidate_id TEXT, calculated_mark_version SMALLINT, derived_summative_value NUMERIC(7,3),
  summative_full_mark_snapshot NUMERIC(6,2), rule_version_code TEXT, created_at TIMESTAMP(3),
  UNIQUE(id,department_id,examination_id,examination_course_id,candidate_id,calculated_mark_version));
CREATE TABLE summative_chairman_approvals(id TEXT PRIMARY KEY, department_id TEXT, examination_id TEXT,
  examination_course_id TEXT, candidate_id TEXT, calculated_mark_id TEXT, calculated_mark_version_snapshot SMALLINT,
  approved_summative_value_snapshot NUMERIC(7,3), summative_full_mark_snapshot NUMERIC(6,2), approval_version SMALLINT,
  approved_at TIMESTAMP(3), locked_at TIMESTAMP(3), created_at TIMESTAMP(3));
INSERT INTO summative_examination_candidates VALUES ('sc','d','x','ec','o','e','s');
INSERT INTO summative_calculated_marks VALUES ('m','d','x','ec','sc',2,46.125,60,'SUMMATIVE_FIRST_SECOND_AVERAGE_V1','2026-01-02');
INSERT INTO summative_chairman_approvals VALUES ('a','d','x','ec','sc','m',2,46.125,60,1,'2026-01-03','2026-01-03','2026-01-03');

ALTER TABLE summative_chairman_approvals ADD COLUMN member_1_review_id TEXT DEFAULT 'member1-review';
ALTER TABLE summative_chairman_approvals ADD COLUMN member_2_review_id TEXT DEFAULT 'member2-review';

-- These real candidate metadata columns are deliberately outside its identity trigger.
ALTER TABLE summative_examination_candidates ADD COLUMN created_at TIMESTAMP(3) DEFAULT '2026-01-01';
ALTER TABLE summative_examination_candidates ADD COLUMN updated_at TIMESTAMP(3) DEFAULT '2026-01-01';
