BEGIN;

-- 1. Ensure comparison decision is THIRD_EXAMINATION_REQUIRED
-- 2. Ensure Third Examiner is not First or Second Examiner
CREATE OR REPLACE FUNCTION "summative_third_referral_integrity_check"()
RETURNS TRIGGER AS $$
DECLARE
  v_decision "SummativeExaminerComparisonDecision";
  v_first_examiner_id TEXT;
  v_second_examiner_id TEXT;
BEGIN

  -- Immutability check for updates
  IF TG_OP = 'UPDATE' THEN
    IF NEW."department_id" != OLD."department_id" OR
       NEW."examination_id" != OLD."examination_id" OR
       NEW."examination_course_id" != OLD."examination_course_id" OR
       NEW."candidate_id" != OLD."candidate_id" OR
       NEW."comparison_id" != OLD."comparison_id" OR
       NEW."third_examiner_user_id" != OLD."third_examiner_user_id" OR
       NEW."assignment_version" != OLD."assignment_version" OR
       NEW."comparison_version_snapshot" != OLD."comparison_version_snapshot" OR
       NEW."rule_version_code" != OLD."rule_version_code" THEN
      RAISE EXCEPTION 'Immutable identity/evidence fields cannot be modified';
    END IF;
  END IF;

  -- Validate assignment version is positive
  IF NEW."assignment_version" <= 0 THEN
    RAISE EXCEPTION 'Invalid assignment_version';
  END IF;

  SELECT
    c."decision",
    a1."assigned_user_id",
    a2."assigned_user_id"
  INTO
    v_decision,
    v_first_examiner_id,
    v_second_examiner_id
  FROM "summative_examiner_comparisons" c
  JOIN "summative_examiner_mark_submissions" s1 ON c."first_submission_id" = s1."id"
  JOIN "examination_course_examiner_assignments" a1 ON s1."examiner_assignment_id" = a1."id"
  JOIN "summative_examiner_mark_submissions" s2 ON c."second_submission_id" = s2."id"
  JOIN "examination_course_examiner_assignments" a2 ON s2."examiner_assignment_id" = a2."id"
  WHERE c."id" = NEW."comparison_id";

  IF v_decision != 'THIRD_EXAMINATION_REQUIRED' THEN
    RAISE EXCEPTION 'Comparison decision must be THIRD_EXAMINATION_REQUIRED';
  END IF;

  IF NEW."third_examiner_user_id" IN (v_first_examiner_id, v_second_examiner_id) THEN
    RAISE EXCEPTION 'Third Examiner cannot be First or Second Examiner';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
