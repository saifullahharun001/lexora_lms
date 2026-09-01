BEGIN;

CREATE TYPE "SummativeThirdExaminationReferralStatus" AS ENUM (
  'ASSIGNED',
  'EXPIRED',
  'ARCHIVED'
);

CREATE UNIQUE INDEX "summative_comparison_scope_uq"
ON "summative_examiner_comparisons"(
  "id",
  "department_id",
  "examination_id",
  "examination_course_id",
  "candidate_id"
);

CREATE TABLE "summative_third_examination_referrals" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "examination_id" TEXT NOT NULL,
  "examination_course_id" TEXT NOT NULL,
  "candidate_id" TEXT NOT NULL,
  "comparison_id" TEXT NOT NULL,
  "third_examiner_user_id" TEXT NOT NULL,
  "assigned_by_user_id" TEXT NOT NULL,
  "question_configuration_id" TEXT NOT NULL,
  "comparison_version_snapshot" SMALLINT NOT NULL,
  "rule_version_code" VARCHAR(64) NOT NULL,
  "deadline" TIMESTAMP(3) NOT NULL,
  "status" "SummativeThirdExaminationReferralStatus" NOT NULL DEFAULT 'ASSIGNED',
  "assignment_version" SMALLINT NOT NULL,
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "summative_third_examination_referrals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "summative_third_referral_candidate_version_uq"
ON "summative_third_examination_referrals"(
  "department_id",
  "examination_course_id",
  "candidate_id",
  "assignment_version"
);


CREATE UNIQUE INDEX "summative_third_referral_active_uq"
ON "summative_third_examination_referrals"(
  "department_id",
  "examination_id",
  "examination_course_id",
  "candidate_id"
)
WHERE "status" = 'ASSIGNED';

CREATE INDEX "summative_third_referral_lookup_idx"
ON "summative_third_examination_referrals"(
  "department_id",
  "examination_course_id",
  "candidate_id",
  "status"
);

CREATE INDEX "summative_third_referral_comparison_idx"
ON "summative_third_examination_referrals"(
  "comparison_id"
);

ALTER TABLE "summative_third_examination_referrals"
  ADD CONSTRAINT "summative_third_referral_department_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_third_examination_referrals"
  ADD CONSTRAINT "summative_third_referral_examination_fkey"
  FOREIGN KEY ("examination_id", "department_id") REFERENCES "examinations"("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_third_examination_referrals"
  ADD CONSTRAINT "summative_third_referral_exam_course_fkey"
  FOREIGN KEY ("examination_course_id", "department_id", "examination_id") REFERENCES "examination_courses"("id", "department_id", "examination_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_third_examination_referrals"
  ADD CONSTRAINT "summative_third_referral_candidate_fkey"
  FOREIGN KEY ("candidate_id", "department_id", "examination_id", "examination_course_id") REFERENCES "summative_examination_candidates"("id", "department_id", "examination_id", "examination_course_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_third_examination_referrals"
  ADD CONSTRAINT "summative_third_referral_comparison_fkey"
  FOREIGN KEY ("comparison_id", "department_id", "examination_id", "examination_course_id", "candidate_id") REFERENCES "summative_examiner_comparisons"("id", "department_id", "examination_id", "examination_course_id", "candidate_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_third_examination_referrals"
  ADD CONSTRAINT "summative_third_referral_examiner_user_fkey"
  FOREIGN KEY ("third_examiner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_third_examination_referrals"
  ADD CONSTRAINT "summative_third_referral_assigned_by_user_fkey"
  FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_third_examination_referrals"
  ADD CONSTRAINT "summative_third_referral_config_fkey"
  FOREIGN KEY ("question_configuration_id", "department_id", "examination_course_id") REFERENCES "summative_question_configurations"("id", "department_id", "examination_course_id") ON DELETE RESTRICT ON UPDATE RESTRICT;




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
    a1."assignee_user_id",
    a2."assignee_user_id"
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

CREATE TRIGGER "trg_summative_third_referral_integrity"
BEFORE INSERT OR UPDATE ON "summative_third_examination_referrals"
FOR EACH ROW EXECUTE FUNCTION "summative_third_referral_integrity_check"();

COMMIT;
