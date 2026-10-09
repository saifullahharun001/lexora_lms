-- Lexora additive Summative chronology correction (2026-10-09).
-- Original functions: 202609020002_add_summative_calculated_committee_approval.
-- Changes ONLY six upper-bound checks to use the persisted TIMESTAMP(3)
-- precision. Preserves all immutable evidence, candidate scope, committee
-- authority, source binding, arithmetic, source-order and audit checks.
-- Previous migration bytes are not altered; existing triggers remain enabled.
-- This migration has NOT been run on the canonical database.

BEGIN;

CREATE OR REPLACE FUNCTION "lexora_validate_summative_calculated_mark"()
RETURNS trigger
LANGUAGE plpgsql
AS $body$
DECLARE
  comparison_row "summative_examiner_comparisons"%ROWTYPE;
  first_source "summative_examiner_mark_submissions"%ROWTYPE;
  second_source "summative_examiner_mark_submissions"%ROWTYPE;
  third_source "summative_third_examiner_mark_submissions"%ROWTYPE;
  three_calc "summative_three_total_calculations"%ROWTYPE;
  authoritative_full_mark DECIMAL(6,2);
  expected_value DECIMAL(7,3);
  expected_version SMALLINT;
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Summative calculated-mark evidence is immutable';
  END IF;

  -- CURRENT_TIMESTAMP is transaction-start time in PostgreSQL. These records are
  -- created later inside an existing Serializable finalisation transaction, so the
  -- statement-current timestamp is the coherent upper bound and persistence time.
  IF NEW."calculated_at" > statement_timestamp()::timestamp(3)
     OR NEW."created_at" < NEW."calculated_at"
     OR NEW."created_at" > statement_timestamp()::timestamp(3) THEN
    RAISE EXCEPTION 'Calculated mark chronology is invalid';
  END IF;

  PERFORM 1 FROM "summative_examination_candidates"
  WHERE "id" = NEW."candidate_id"
    AND "department_id" = NEW."department_id"
    AND "examination_id" = NEW."examination_id"
    AND "examination_course_id" = NEW."examination_course_id"
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calculated mark requires exact candidate scope';
  END IF;

  SELECT "summative_full_mark" INTO authoritative_full_mark
  FROM "examination_courses"
  WHERE "id" = NEW."examination_course_id"
    AND "department_id" = NEW."department_id"
    AND "examination_id" = NEW."examination_id"
    AND "archived_at" IS NULL;
  IF authoritative_full_mark IS NULL OR authoritative_full_mark <= 0
     OR NEW."summative_full_mark_snapshot" IS DISTINCT FROM authoritative_full_mark THEN
    RAISE EXCEPTION 'Calculated mark full-mark snapshot is invalid';
  END IF;

  SELECT * INTO comparison_row FROM "summative_examiner_comparisons"
  WHERE "id" = NEW."comparison_id"
    AND "department_id" = NEW."department_id"
    AND "examination_id" = NEW."examination_id"
    AND "examination_course_id" = NEW."examination_course_id"
    AND "candidate_id" = NEW."candidate_id";
  IF NOT FOUND OR NEW."comparison_version_snapshot" <> comparison_row."comparison_version" THEN
    RAISE EXCEPTION 'Calculated mark comparison identity or version is invalid';
  END IF;

  SELECT * INTO first_source FROM "summative_examiner_mark_submissions"
  WHERE "id" = NEW."first_submission_id"
    AND "department_id" = NEW."department_id"
    AND "examination_id" = NEW."examination_id"
    AND "examination_course_id" = NEW."examination_course_id"
    AND "candidate_id" = NEW."candidate_id";
  SELECT * INTO second_source FROM "summative_examiner_mark_submissions"
  WHERE "id" = NEW."second_submission_id"
    AND "department_id" = NEW."department_id"
    AND "examination_id" = NEW."examination_id"
    AND "examination_course_id" = NEW."examination_course_id"
    AND "candidate_id" = NEW."candidate_id";

  IF first_source."id" IS NULL OR second_source."id" IS NULL
     OR comparison_row."first_submission_id" <> first_source."id"
     OR comparison_row."second_submission_id" <> second_source."id"
     OR first_source."examiner_seat" <> 'FIRST_EXAMINER'
     OR second_source."examiner_seat" <> 'SECOND_EXAMINER'
     OR first_source."status" <> 'LOCKED'
     OR second_source."status" <> 'LOCKED'
     OR first_source."total_mark" IS NULL
     OR second_source."total_mark" IS NULL
     OR first_source."submitted_at" IS NULL OR first_source."locked_at" IS NULL
     OR second_source."submitted_at" IS NULL OR second_source."locked_at" IS NULL
     OR first_source."question_configuration_id" <> NEW."question_configuration_id"
     OR second_source."question_configuration_id" <> NEW."question_configuration_id"
     OR NEW."first_submission_version" <> first_source."version_number"
     OR NEW."second_submission_version" <> second_source."version_number"
     OR comparison_row."first_submission_version" <> first_source."version_number"
     OR comparison_row."second_submission_version" <> second_source."version_number"
     OR comparison_row."first_total_snapshot" IS DISTINCT FROM first_source."total_mark"
     OR comparison_row."second_total_snapshot" IS DISTINCT FROM second_source."total_mark"
     OR comparison_row."summative_full_mark_snapshot" IS DISTINCT FROM authoritative_full_mark
     OR first_source."total_mark" < 0 OR first_source."total_mark" > authoritative_full_mark
     OR second_source."total_mark" < 0 OR second_source."total_mark" > authoritative_full_mark THEN
    RAISE EXCEPTION 'Calculated mark First/Second source evidence is invalid';
  END IF;

  IF NEW."calculated_at" < comparison_row."calculated_at"
     OR NEW."calculated_at" < first_source."locked_at"
     OR NEW."calculated_at" < second_source."locked_at" THEN
    RAISE EXCEPTION 'Calculated mark cannot predate First/Second evidence';
  END IF;

  PERFORM 1 FROM "summative_question_configurations"
  WHERE "id" = NEW."question_configuration_id"
    AND "department_id" = NEW."department_id"
    AND "examination_id" = NEW."examination_id"
    AND "examination_course_id" = NEW."examination_course_id"
    AND "status" = 'LOCKED'
    AND "archived_at" IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calculated mark question configuration is invalid';
  END IF;

  IF NEW."calculation_path" = 'FIRST_SECOND_AVERAGE' THEN
    IF comparison_row."decision" <> 'THIRD_EXAMINATION_NOT_REQUIRED'
       OR NEW."three_total_calculation_id" IS NOT NULL
       OR NEW."three_total_calculation_version_snapshot" IS NOT NULL
       OR NEW."third_submission_id" IS NOT NULL
       OR NEW."third_submission_version" IS NOT NULL
       OR NEW."rule_version_code" <> 'SUMMATIVE_FIRST_SECOND_AVERAGE_V1' THEN
      RAISE EXCEPTION 'Calculated mark no-Third rule or source shape is invalid';
    END IF;
    expected_value := (first_source."total_mark" + second_source."total_mark") / 2;
  ELSIF NEW."calculation_path" = 'THREE_TOTAL_NEAREST_PAIR' THEN
    IF comparison_row."decision" <> 'THIRD_EXAMINATION_REQUIRED'
       OR NEW."three_total_calculation_id" IS NULL
       OR NEW."third_submission_id" IS NULL THEN
      RAISE EXCEPTION 'Calculated mark Third path source shape is invalid';
    END IF;
    SELECT * INTO three_calc FROM "summative_three_total_calculations"
    WHERE "id" = NEW."three_total_calculation_id"
      AND "department_id" = NEW."department_id"
      AND "examination_id" = NEW."examination_id"
      AND "examination_course_id" = NEW."examination_course_id"
      AND "candidate_id" = NEW."candidate_id"
      AND "comparison_id" = NEW."comparison_id";
    SELECT * INTO third_source FROM "summative_third_examiner_mark_submissions"
    WHERE "id" = NEW."third_submission_id"
      AND "department_id" = NEW."department_id"
      AND "examination_id" = NEW."examination_id"
      AND "examination_course_id" = NEW."examination_course_id"
      AND "candidate_id" = NEW."candidate_id";
    IF three_calc."id" IS NULL OR third_source."id" IS NULL
       OR NEW."three_total_calculation_version_snapshot" <> three_calc."calculation_version"
       OR NEW."third_submission_version" <> third_source."version_number"
       OR three_calc."comparison_version_snapshot" <> comparison_row."comparison_version"
       OR three_calc."question_configuration_id" <> NEW."question_configuration_id"
       OR three_calc."first_submission_id" <> first_source."id"
       OR three_calc."second_submission_id" <> second_source."id"
       OR three_calc."third_submission_id" <> third_source."id"
       OR three_calc."first_submission_version" <> first_source."version_number"
       OR three_calc."second_submission_version" <> second_source."version_number"
       OR three_calc."third_submission_version" <> third_source."version_number"
       OR third_source."status" <> 'LOCKED'
       OR third_source."total_mark" IS NULL
       OR third_source."submitted_at" IS NULL OR third_source."locked_at" IS NULL
       OR third_source."question_configuration_id" <> NEW."question_configuration_id"
       OR three_calc."third_total_snapshot" IS DISTINCT FROM third_source."total_mark"
       OR three_calc."summative_full_mark_snapshot" IS DISTINCT FROM authoritative_full_mark
       OR NEW."rule_version_code" IS DISTINCT FROM three_calc."rule_version_code"
       OR NEW."rule_version_code" <> 'SUMMATIVE_THREE_TOTAL_NEAREST_PAIR_V1' THEN
      RAISE EXCEPTION 'Calculated mark three-total binding is invalid';
    END IF;
    IF NEW."calculated_at" < three_calc."calculated_at"
       OR NEW."calculated_at" < third_source."locked_at" THEN
      RAISE EXCEPTION 'Calculated mark cannot predate Third-path evidence';
    END IF;
    expected_value := three_calc."derived_summative_value";
  ELSE
    RAISE EXCEPTION 'Calculated mark path is invalid';
  END IF;

  IF NEW."derived_summative_value" IS DISTINCT FROM expected_value THEN
    RAISE EXCEPTION 'Calculated mark derived value is invalid';
  END IF;

  SELECT COALESCE(MAX("calculated_mark_version"), 0) + 1 INTO expected_version
  FROM "summative_calculated_marks"
  WHERE "department_id" = NEW."department_id"
    AND "examination_course_id" = NEW."examination_course_id"
    AND "candidate_id" = NEW."candidate_id";
  IF NEW."calculated_mark_version" <> expected_version THEN
    RAISE EXCEPTION 'Calculated mark candidate version is invalid';
  END IF;
  RETURN NEW;
END;
$body$;

CREATE OR REPLACE FUNCTION "lexora_validate_summative_member_review"()
RETURNS trigger
LANGUAGE plpgsql
AS $body$
DECLARE
  calc_row "summative_calculated_marks"%ROWTYPE;
  assignment_row "examination_committee_assignments"%ROWTYPE;
  expected_version SMALLINT;
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Summative Committee Member review evidence is immutable';
  END IF;
  SELECT * INTO calc_row FROM "summative_calculated_marks"
  WHERE "id" = NEW."calculated_mark_id"
    AND "department_id" = NEW."department_id"
    AND "examination_id" = NEW."examination_id"
    AND "examination_course_id" = NEW."examination_course_id"
    AND "candidate_id" = NEW."candidate_id";
  IF NOT FOUND OR calc_row."calculated_mark_version" <> NEW."calculated_mark_version_snapshot" THEN
    RAISE EXCEPTION 'Member review calculated-mark binding is invalid';
  END IF;
  IF NEW."reviewed_at" < calc_row."calculated_at"
     OR NEW."reviewed_at" > statement_timestamp()::timestamp(3)
     OR NEW."created_at" < NEW."reviewed_at"
     OR NEW."created_at" > statement_timestamp()::timestamp(3) THEN
    RAISE EXCEPTION 'Member review chronology is invalid';
  END IF;
  IF EXISTS (SELECT 1 FROM "summative_chairman_approvals" WHERE "calculated_mark_id" = NEW."calculated_mark_id") THEN
    RAISE EXCEPTION 'Final-locked calculated evidence cannot receive a new review';
  END IF;
  SELECT * INTO assignment_row FROM "examination_committee_assignments"
  WHERE "id" = NEW."committee_assignment_id"
    AND "department_id" = NEW."department_id"
    AND "examination_id" = NEW."examination_id"
    AND "committee_id" = NEW."committee_id"
    AND "assigned_user_id" = NEW."reviewer_user_id"
    AND "seat" = NEW."reviewer_seat"
    AND "assigned_at" = NEW."assignment_assigned_at_snapshot";
  IF NOT FOUND
     OR NEW."reviewer_seat" NOT IN ('MEMBER_1', 'MEMBER_2')
     OR assignment_row."status" <> 'ACTIVE'
     OR assignment_row."assigned_at" > NEW."reviewed_at"
     OR assignment_row."assigned_at" > CURRENT_TIMESTAMP
     OR (assignment_row."expires_at" IS NOT NULL AND assignment_row."expires_at" <= CURRENT_TIMESTAMP)
     OR assignment_row."unassigned_at" IS NOT NULL
     OR assignment_row."archived_at" IS NOT NULL
     OR assignment_row."external_member_name" IS NOT NULL
     OR assignment_row."external_member_affiliation" IS NOT NULL THEN
    RAISE EXCEPTION 'Member review appointment instance is invalid or stale';
  END IF;
  PERFORM 1 FROM "examination_committees"
  WHERE "id" = NEW."committee_id"
    AND "department_id" = NEW."department_id"
    AND "examination_id" = NEW."examination_id"
    AND "archived_at" IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member review Committee scope is invalid'; END IF;
  PERFORM 1 FROM "users"
  WHERE "id" = NEW."reviewer_user_id" AND "department_id" = NEW."department_id"
    AND "status" = 'ACTIVE' AND "archived_at" IS NULL AND "deleted_at" IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member reviewer User is inactive'; END IF;
  PERFORM 1
  FROM "user_roles" ur
  JOIN "roles" r ON r."id" = ur."role_id" AND r."department_id" = ur."department_id"
  JOIN "role_permissions" rp ON rp."role_id" = r."id"
  JOIN "permissions" p ON p."id" = rp."permission_id"
  WHERE ur."user_id" = NEW."reviewer_user_id"
    AND ur."department_id" = NEW."department_id"
    AND ur."revoked_at" IS NULL
    AND (ur."expires_at" IS NULL OR ur."expires_at" > CURRENT_TIMESTAMP)
    AND r."code" = 'teacher' AND r."archived_at" IS NULL
    AND p."code" = 'summative-examination.member-review.review_department'
    AND p."resource" = 'summative-examination.member-review'
    AND p."action" = 'review' AND p."scope" = 'DEPARTMENT';
  IF NOT FOUND THEN RAISE EXCEPTION 'Member reviewer live permission is invalid'; END IF;
  IF (NEW."outcome" = 'CORRECTION_REQUIRED'
         AND (NEW."review_comment" IS NULL OR LENGTH(BTRIM(NEW."review_comment")) = 0)) THEN
    RAISE EXCEPTION 'Member review outcome or timestamp is invalid';
  END IF;
  SELECT COALESCE(MAX("review_version"), 0) + 1 INTO expected_version
  FROM "summative_committee_member_reviews"
  WHERE "department_id" = NEW."department_id"
    AND "calculated_mark_id" = NEW."calculated_mark_id"
    AND "reviewer_seat" = NEW."reviewer_seat";
  IF NEW."review_version" <> expected_version THEN
    RAISE EXCEPTION 'Member review version is invalid';
  END IF;
  RETURN NEW;
END;
$body$;

CREATE OR REPLACE FUNCTION "lexora_validate_summative_chairman_approval"()
RETURNS trigger
LANGUAGE plpgsql
AS $body$
DECLARE
  calc_row "summative_calculated_marks"%ROWTYPE;
  chair_row "examination_committee_assignments"%ROWTYPE;
  review_1 "summative_committee_member_reviews"%ROWTYPE;
  review_2 "summative_committee_member_reviews"%ROWTYPE;
  expected_version SMALLINT;
  formal_seat_count INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Summative Chairman approval/final-lock evidence is immutable';
  END IF;
  SELECT * INTO calc_row FROM "summative_calculated_marks"
  WHERE "id" = NEW."calculated_mark_id"
    AND "department_id" = NEW."department_id"
    AND "examination_id" = NEW."examination_id"
    AND "examination_course_id" = NEW."examination_course_id"
    AND "candidate_id" = NEW."candidate_id";
  IF NOT FOUND
     OR calc_row."calculated_mark_version" <> NEW."calculated_mark_version_snapshot"
     OR NEW."approved_summative_value_snapshot" IS DISTINCT FROM calc_row."derived_summative_value"
     OR NEW."summative_full_mark_snapshot" IS DISTINCT FROM calc_row."summative_full_mark_snapshot"
     OR NEW."approved_at" < calc_row."calculated_at"
     OR NEW."approved_at" IS DISTINCT FROM NEW."locked_at"
     OR NEW."approved_at" > statement_timestamp()::timestamp(3)
     OR NEW."created_at" < NEW."approved_at"
     OR NEW."created_at" > statement_timestamp()::timestamp(3) THEN
    RAISE EXCEPTION 'Chairman approval calculated-mark snapshot is invalid';
  END IF;
  PERFORM 1 FROM "examination_committees"
  WHERE "id" = NEW."committee_id"
    AND "department_id" = NEW."department_id"
    AND "examination_id" = NEW."examination_id"
    AND "archived_at" IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chairman approval Committee scope is invalid'; END IF;
  SELECT * INTO chair_row FROM "examination_committee_assignments"
  WHERE "id" = NEW."chairman_assignment_id"
    AND "department_id" = NEW."department_id"
    AND "examination_id" = NEW."examination_id"
    AND "committee_id" = NEW."committee_id"
    AND "assigned_user_id" = NEW."chairman_user_id"
    AND "assigned_at" = NEW."chairman_assigned_at_snapshot";
  IF NOT FOUND OR chair_row."seat" <> 'CHAIRMAN'
     OR chair_row."status" <> 'ACTIVE'
     OR chair_row."assigned_at" > NEW."approved_at"
     OR chair_row."assigned_at" > CURRENT_TIMESTAMP
     OR (chair_row."expires_at" IS NOT NULL AND chair_row."expires_at" <= CURRENT_TIMESTAMP)
     OR chair_row."unassigned_at" IS NOT NULL OR chair_row."archived_at" IS NOT NULL THEN
    RAISE EXCEPTION 'Chairman appointment instance is invalid or stale';
  END IF;
  PERFORM 1 FROM "users"
  WHERE "id" = NEW."chairman_user_id" AND "department_id" = NEW."department_id"
    AND "status" = 'ACTIVE' AND "archived_at" IS NULL AND "deleted_at" IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chairman User is inactive'; END IF;
  PERFORM 1
  FROM "user_roles" ur
  JOIN "roles" r ON r."id" = ur."role_id" AND r."department_id" = ur."department_id"
  JOIN "role_permissions" rp ON rp."role_id" = r."id"
  JOIN "permissions" p ON p."id" = rp."permission_id"
  WHERE ur."user_id" = NEW."chairman_user_id"
    AND ur."department_id" = NEW."department_id"
    AND ur."revoked_at" IS NULL
    AND (ur."expires_at" IS NULL OR ur."expires_at" > CURRENT_TIMESTAMP)
    AND r."code" = 'teacher' AND r."archived_at" IS NULL
    AND p."code" = 'summative-examination.chairman-approval.approve_department'
    AND p."resource" = 'summative-examination.chairman-approval'
    AND p."action" = 'approve' AND p."scope" = 'DEPARTMENT';
  IF NOT FOUND THEN RAISE EXCEPTION 'Chairman live permission is invalid'; END IF;

  SELECT COUNT(*) INTO formal_seat_count
  FROM "examination_committee_assignments" a
  LEFT JOIN "users" u ON u."id" = a."assigned_user_id" AND u."department_id" = a."department_id"
  WHERE a."department_id" = NEW."department_id"
    AND a."examination_id" = NEW."examination_id"
    AND a."committee_id" = NEW."committee_id"
    AND a."status" = 'ACTIVE'
    AND a."assigned_at" <= CURRENT_TIMESTAMP
    AND (a."expires_at" IS NULL OR a."expires_at" > CURRENT_TIMESTAMP)
    AND a."unassigned_at" IS NULL AND a."archived_at" IS NULL
    AND (
      (a."seat" IN ('CHAIRMAN', 'MEMBER_1', 'MEMBER_2')
       AND a."assigned_user_id" IS NOT NULL
       AND a."external_member_name" IS NULL AND a."external_member_affiliation" IS NULL
       AND u."status" = 'ACTIVE' AND u."archived_at" IS NULL AND u."deleted_at" IS NULL)
      OR
      (a."seat" = 'EXTERNAL_MEMBER' AND a."assigned_user_id" IS NULL
       AND LENGTH(BTRIM(a."external_member_name")) > 0
       AND LENGTH(BTRIM(a."external_member_affiliation")) > 0)
    );
  IF formal_seat_count <> 4 OR EXISTS (
    SELECT 1 FROM "examination_committee_assignments" a
    WHERE a."department_id" = NEW."department_id"
      AND a."examination_id" = NEW."examination_id"
      AND a."committee_id" = NEW."committee_id"
      AND a."status" = 'ACTIVE'
      AND a."assigned_at" <= CURRENT_TIMESTAMP
      AND (a."expires_at" IS NULL OR a."expires_at" > CURRENT_TIMESTAMP)
      AND a."unassigned_at" IS NULL AND a."archived_at" IS NULL
    GROUP BY a."seat" HAVING COUNT(*) <> 1
  ) THEN
    RAISE EXCEPTION 'Chairman approval requires a complete four-seat Committee';
  END IF;

  SELECT * INTO review_1 FROM "summative_committee_member_reviews"
  WHERE "id" = NEW."member_1_review_id";
  SELECT * INTO review_2 FROM "summative_committee_member_reviews"
  WHERE "id" = NEW."member_2_review_id";
  IF review_1."id" IS NULL OR review_2."id" IS NULL
     OR review_1."reviewer_seat" <> 'MEMBER_1'
     OR review_2."reviewer_seat" <> 'MEMBER_2'
     OR review_1."outcome" <> 'VERIFIED' OR review_2."outcome" <> 'VERIFIED'
     OR review_1."department_id" <> NEW."department_id"
     OR review_2."department_id" <> NEW."department_id"
     OR review_1."examination_id" <> NEW."examination_id"
     OR review_2."examination_id" <> NEW."examination_id"
     OR review_1."examination_course_id" <> NEW."examination_course_id"
     OR review_2."examination_course_id" <> NEW."examination_course_id"
     OR review_1."candidate_id" <> NEW."candidate_id"
     OR review_2."candidate_id" <> NEW."candidate_id"
     OR review_1."calculated_mark_id" <> NEW."calculated_mark_id"
     OR review_2."calculated_mark_id" <> NEW."calculated_mark_id"
     OR review_1."calculated_mark_version_snapshot" <> NEW."calculated_mark_version_snapshot"
     OR review_2."calculated_mark_version_snapshot" <> NEW."calculated_mark_version_snapshot"
     OR review_1."committee_id" <> NEW."committee_id"
     OR review_2."committee_id" <> NEW."committee_id" THEN
    RAISE EXCEPTION 'Chairman approval Member review binding is invalid';
  END IF;
  IF NEW."approved_at" < review_1."reviewed_at"
     OR NEW."approved_at" < review_2."reviewed_at" THEN
    RAISE EXCEPTION 'Chairman approval cannot predate Member review evidence';
  END IF;
  PERFORM 1 FROM "examination_committee_assignments" a
  WHERE a."id" = review_1."committee_assignment_id"
    AND a."department_id" = NEW."department_id"
    AND a."committee_id" = NEW."committee_id"
    AND a."assigned_user_id" = review_1."reviewer_user_id"
    AND a."seat" = 'MEMBER_1'
    AND a."assigned_at" = review_1."assignment_assigned_at_snapshot"
    AND a."status" = 'ACTIVE' AND a."assigned_at" <= CURRENT_TIMESTAMP
    AND (a."expires_at" IS NULL OR a."expires_at" > CURRENT_TIMESTAMP)
    AND a."unassigned_at" IS NULL AND a."archived_at" IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_1 review is stale'; END IF;
  PERFORM 1 FROM "examination_committee_assignments" a
  WHERE a."id" = review_2."committee_assignment_id"
    AND a."department_id" = NEW."department_id"
    AND a."committee_id" = NEW."committee_id"
    AND a."assigned_user_id" = review_2."reviewer_user_id"
    AND a."seat" = 'MEMBER_2'
    AND a."assigned_at" = review_2."assignment_assigned_at_snapshot"
    AND a."status" = 'ACTIVE' AND a."assigned_at" <= CURRENT_TIMESTAMP
    AND (a."expires_at" IS NULL OR a."expires_at" > CURRENT_TIMESTAMP)
    AND a."unassigned_at" IS NULL AND a."archived_at" IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_2 review is stale'; END IF;

  SELECT COALESCE(MAX("approval_version"), 0) + 1 INTO expected_version
  FROM "summative_chairman_approvals"
  WHERE "department_id" = NEW."department_id"
    AND "examination_course_id" = NEW."examination_course_id"
    AND "candidate_id" = NEW."candidate_id";
  IF NEW."approval_version" <> expected_version THEN
    RAISE EXCEPTION 'Chairman approval version is invalid';
  END IF;
  RETURN NEW;
END;
$body$;

COMMIT;
