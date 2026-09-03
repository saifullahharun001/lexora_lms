BEGIN;

CREATE TYPE "SummativeCalculatedMarkPath" AS ENUM (
  'FIRST_SECOND_AVERAGE',
  'THREE_TOTAL_NEAREST_PAIR'
);

CREATE TYPE "SummativeCommitteeMemberReviewOutcome" AS ENUM (
  'VERIFIED',
  'CORRECTION_REQUIRED'
);

CREATE TABLE "summative_calculated_marks" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "examination_id" TEXT NOT NULL,
  "examination_course_id" TEXT NOT NULL,
  "candidate_id" TEXT NOT NULL,
  "comparison_id" TEXT NOT NULL,
  "comparison_version_snapshot" SMALLINT NOT NULL,
  "three_total_calculation_id" TEXT,
  "three_total_calculation_version_snapshot" SMALLINT,
  "question_configuration_id" TEXT NOT NULL,
  "first_submission_id" TEXT NOT NULL,
  "second_submission_id" TEXT NOT NULL,
  "third_submission_id" TEXT,
  "first_submission_version" SMALLINT NOT NULL,
  "second_submission_version" SMALLINT NOT NULL,
  "third_submission_version" SMALLINT,
  "summative_full_mark_snapshot" DECIMAL(6,2) NOT NULL,
  "calculation_path" "SummativeCalculatedMarkPath" NOT NULL,
  "calculated_mark_version" SMALLINT NOT NULL,
  "rule_version_code" VARCHAR(64) NOT NULL,
  "derived_summative_value" DECIMAL(7,3) NOT NULL,
  "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT statement_timestamp(),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT "summative_calculated_marks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sum_calc_mark_three_calc_uq"
ON "summative_calculated_marks"("three_total_calculation_id");

CREATE UNIQUE INDEX "sum_calc_mark_comparison_uq"
ON "summative_calculated_marks"("comparison_id");

CREATE UNIQUE INDEX "sum_calc_mark_scope_version_uq"
ON "summative_calculated_marks"(
  "id", "department_id", "examination_id", "examination_course_id",
  "candidate_id", "calculated_mark_version"
);

CREATE UNIQUE INDEX "sum_calc_mark_candidate_version_uq"
ON "summative_calculated_marks"(
  "department_id", "examination_course_id", "candidate_id",
  "calculated_mark_version"
);

CREATE INDEX "sum_calc_mark_candidate_lookup_idx"
ON "summative_calculated_marks"(
  "department_id", "examination_course_id", "candidate_id", "calculated_at"
);

CREATE INDEX "sum_calc_mark_first_source_idx"
ON "summative_calculated_marks"("first_submission_id");

CREATE INDEX "sum_calc_mark_second_source_idx"
ON "summative_calculated_marks"("second_submission_id");

CREATE INDEX "sum_calc_mark_third_source_idx"
ON "summative_calculated_marks"("third_submission_id");

CREATE TABLE "summative_committee_member_reviews" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "examination_id" TEXT NOT NULL,
  "examination_course_id" TEXT NOT NULL,
  "candidate_id" TEXT NOT NULL,
  "calculated_mark_id" TEXT NOT NULL,
  "calculated_mark_version_snapshot" SMALLINT NOT NULL,
  "committee_id" TEXT NOT NULL,
  "committee_assignment_id" TEXT NOT NULL,
  "reviewer_user_id" TEXT NOT NULL,
  "reviewer_seat" "ExaminationCommitteeSeat" NOT NULL,
  "assignment_assigned_at_snapshot" TIMESTAMP(3) NOT NULL,
  "review_version" SMALLINT NOT NULL,
  "outcome" "SummativeCommitteeMemberReviewOutcome" NOT NULL,
  "review_comment" VARCHAR(1000),
  "reviewed_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT "summative_committee_member_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sum_member_review_appointment_uq"
ON "summative_committee_member_reviews"(
  "calculated_mark_id", "committee_assignment_id",
  "assignment_assigned_at_snapshot"
);

CREATE UNIQUE INDEX "sum_member_review_seat_version_uq"
ON "summative_committee_member_reviews"(
  "department_id", "calculated_mark_id", "reviewer_seat", "review_version"
);

CREATE INDEX "sum_member_review_lookup_idx"
ON "summative_committee_member_reviews"(
  "department_id", "calculated_mark_id", "reviewer_seat", "reviewed_at"
);

CREATE TABLE "summative_chairman_approvals" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "examination_id" TEXT NOT NULL,
  "examination_course_id" TEXT NOT NULL,
  "candidate_id" TEXT NOT NULL,
  "calculated_mark_id" TEXT NOT NULL,
  "calculated_mark_version_snapshot" SMALLINT NOT NULL,
  "committee_id" TEXT NOT NULL,
  "chairman_assignment_id" TEXT NOT NULL,
  "chairman_user_id" TEXT NOT NULL,
  "chairman_assigned_at_snapshot" TIMESTAMP(3) NOT NULL,
  "member_1_review_id" TEXT NOT NULL,
  "member_2_review_id" TEXT NOT NULL,
  "approved_summative_value_snapshot" DECIMAL(7,3) NOT NULL,
  "summative_full_mark_snapshot" DECIMAL(6,2) NOT NULL,
  "approval_version" SMALLINT NOT NULL,
  "approved_at" TIMESTAMP(3) NOT NULL,
  "locked_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT "summative_chairman_approvals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sum_chair_approval_calc_mark_uq"
ON "summative_chairman_approvals"("calculated_mark_id");

CREATE UNIQUE INDEX "sum_chair_approval_member1_review_uq"
ON "summative_chairman_approvals"("member_1_review_id");

CREATE UNIQUE INDEX "sum_chair_approval_member2_review_uq"
ON "summative_chairman_approvals"("member_2_review_id");

CREATE UNIQUE INDEX "sum_chair_approval_candidate_version_uq"
ON "summative_chairman_approvals"(
  "department_id", "examination_course_id", "candidate_id", "approval_version"
);

CREATE UNIQUE INDEX "sum_chair_approval_calc_scope_uq"
ON "summative_chairman_approvals"(
  "calculated_mark_id", "department_id", "examination_id",
  "examination_course_id", "candidate_id", "calculated_mark_version_snapshot"
);

CREATE INDEX "sum_chair_approval_lookup_idx"
ON "summative_chairman_approvals"(
  "department_id", "examination_course_id", "candidate_id", "approved_at"
);

ALTER TABLE "summative_calculated_marks"
ADD CONSTRAINT "sum_calc_mark_values_ck"
CHECK (
  "comparison_version_snapshot" > 0
  AND "first_submission_version" > 0
  AND "second_submission_version" > 0
  AND "calculated_mark_version" > 0
  AND "summative_full_mark_snapshot" > 0
  AND "derived_summative_value" >= 0
  AND "derived_summative_value" <= "summative_full_mark_snapshot"
  AND LENGTH(BTRIM("rule_version_code")) > 0
);

ALTER TABLE "summative_calculated_marks"
ADD CONSTRAINT "sum_calc_mark_path_shape_ck"
CHECK (
  (
    "calculation_path" = 'FIRST_SECOND_AVERAGE'
    AND "three_total_calculation_id" IS NULL
    AND "three_total_calculation_version_snapshot" IS NULL
    AND "third_submission_id" IS NULL
    AND "third_submission_version" IS NULL
  )
  OR (
    "calculation_path" = 'THREE_TOTAL_NEAREST_PAIR'
    AND "three_total_calculation_id" IS NOT NULL
    AND "three_total_calculation_version_snapshot" > 0
    AND "third_submission_id" IS NOT NULL
    AND "third_submission_version" > 0
  )
);

ALTER TABLE "summative_committee_member_reviews"
ADD CONSTRAINT "sum_member_review_values_ck"
CHECK (
  "calculated_mark_version_snapshot" > 0
  AND "review_version" > 0
  AND "reviewer_seat" IN ('MEMBER_1', 'MEMBER_2')
  AND LENGTH("review_comment") <= 1000
  AND (
    "outcome" <> 'CORRECTION_REQUIRED'
    OR ("review_comment" IS NOT NULL AND LENGTH(BTRIM("review_comment")) > 0)
  )
);

ALTER TABLE "summative_chairman_approvals"
ADD CONSTRAINT "sum_chair_approval_values_ck"
CHECK (
  "calculated_mark_version_snapshot" > 0
  AND "approval_version" > 0
  AND "approved_summative_value_snapshot" >= 0
  AND "approved_summative_value_snapshot" <= "summative_full_mark_snapshot"
  AND "summative_full_mark_snapshot" > 0
  AND "approved_at" = "locked_at"
  AND "member_1_review_id" <> "member_2_review_id"
);

ALTER TABLE "summative_calculated_marks"
ADD CONSTRAINT "sum_calc_mark_department_fkey"
FOREIGN KEY ("department_id") REFERENCES "departments"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_calculated_marks"
ADD CONSTRAINT "sum_calc_mark_examination_fkey"
FOREIGN KEY ("examination_id", "department_id")
REFERENCES "examinations"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_calculated_marks"
ADD CONSTRAINT "sum_calc_mark_exam_course_fkey"
FOREIGN KEY ("examination_course_id", "department_id", "examination_id")
REFERENCES "examination_courses"("id", "department_id", "examination_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_calculated_marks"
ADD CONSTRAINT "sum_calc_mark_candidate_fkey"
FOREIGN KEY ("candidate_id", "department_id", "examination_id", "examination_course_id")
REFERENCES "summative_examination_candidates"(
  "id", "department_id", "examination_id", "examination_course_id"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_calculated_marks"
ADD CONSTRAINT "sum_calc_mark_comparison_fkey"
FOREIGN KEY ("comparison_id", "department_id", "examination_id", "examination_course_id", "candidate_id")
REFERENCES "summative_examiner_comparisons"(
  "id", "department_id", "examination_id", "examination_course_id", "candidate_id"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_calculated_marks"
ADD CONSTRAINT "sum_calc_mark_three_calc_fkey"
FOREIGN KEY ("three_total_calculation_id")
REFERENCES "summative_three_total_calculations"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_calculated_marks"
ADD CONSTRAINT "sum_calc_mark_config_fkey"
FOREIGN KEY ("question_configuration_id", "department_id", "examination_id", "examination_course_id")
REFERENCES "summative_question_configurations"(
  "id", "department_id", "examination_id", "examination_course_id"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_calculated_marks"
ADD CONSTRAINT "sum_calc_mark_first_source_fkey"
FOREIGN KEY ("first_submission_id", "department_id", "examination_id", "examination_course_id", "candidate_id")
REFERENCES "summative_examiner_mark_submissions"(
  "id", "department_id", "examination_id", "examination_course_id", "candidate_id"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_calculated_marks"
ADD CONSTRAINT "sum_calc_mark_second_source_fkey"
FOREIGN KEY ("second_submission_id", "department_id", "examination_id", "examination_course_id", "candidate_id")
REFERENCES "summative_examiner_mark_submissions"(
  "id", "department_id", "examination_id", "examination_course_id", "candidate_id"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_calculated_marks"
ADD CONSTRAINT "sum_calc_mark_third_source_fkey"
FOREIGN KEY ("third_submission_id")
REFERENCES "summative_third_examiner_mark_submissions"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_committee_member_reviews"
ADD CONSTRAINT "sum_member_review_department_fkey"
FOREIGN KEY ("department_id") REFERENCES "departments"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_committee_member_reviews"
ADD CONSTRAINT "sum_member_review_examination_fkey"
FOREIGN KEY ("examination_id", "department_id")
REFERENCES "examinations"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_committee_member_reviews"
ADD CONSTRAINT "sum_member_review_exam_course_fkey"
FOREIGN KEY ("examination_course_id", "department_id", "examination_id")
REFERENCES "examination_courses"("id", "department_id", "examination_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_committee_member_reviews"
ADD CONSTRAINT "sum_member_review_candidate_fkey"
FOREIGN KEY ("candidate_id", "department_id", "examination_id", "examination_course_id")
REFERENCES "summative_examination_candidates"(
  "id", "department_id", "examination_id", "examination_course_id"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_committee_member_reviews"
ADD CONSTRAINT "sum_member_review_calc_mark_fkey"
FOREIGN KEY (
  "calculated_mark_id", "department_id", "examination_id",
  "examination_course_id", "candidate_id", "calculated_mark_version_snapshot"
)
REFERENCES "summative_calculated_marks"(
  "id", "department_id", "examination_id", "examination_course_id",
  "candidate_id", "calculated_mark_version"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_committee_member_reviews"
ADD CONSTRAINT "sum_member_review_committee_fkey"
FOREIGN KEY ("committee_id", "department_id", "examination_id")
REFERENCES "examination_committees"("id", "department_id", "examination_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_committee_member_reviews"
ADD CONSTRAINT "sum_member_review_assignment_fkey"
FOREIGN KEY (
  "committee_assignment_id", "department_id", "committee_id"
)
REFERENCES "examination_committee_assignments"(
  "id", "department_id", "committee_id"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_committee_member_reviews"
ADD CONSTRAINT "sum_member_review_reviewer_fkey"
FOREIGN KEY ("reviewer_user_id", "department_id")
REFERENCES "users"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_chairman_approvals"
ADD CONSTRAINT "sum_chair_approval_department_fkey"
FOREIGN KEY ("department_id") REFERENCES "departments"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_chairman_approvals"
ADD CONSTRAINT "sum_chair_approval_examination_fkey"
FOREIGN KEY ("examination_id", "department_id")
REFERENCES "examinations"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_chairman_approvals"
ADD CONSTRAINT "sum_chair_approval_exam_course_fkey"
FOREIGN KEY ("examination_course_id", "department_id", "examination_id")
REFERENCES "examination_courses"("id", "department_id", "examination_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_chairman_approvals"
ADD CONSTRAINT "sum_chair_approval_candidate_fkey"
FOREIGN KEY ("candidate_id", "department_id", "examination_id", "examination_course_id")
REFERENCES "summative_examination_candidates"(
  "id", "department_id", "examination_id", "examination_course_id"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_chairman_approvals"
ADD CONSTRAINT "sum_chair_approval_calc_mark_fkey"
FOREIGN KEY (
  "calculated_mark_id", "department_id", "examination_id",
  "examination_course_id", "candidate_id", "calculated_mark_version_snapshot"
)
REFERENCES "summative_calculated_marks"(
  "id", "department_id", "examination_id", "examination_course_id",
  "candidate_id", "calculated_mark_version"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_chairman_approvals"
ADD CONSTRAINT "sum_chair_approval_committee_fkey"
FOREIGN KEY ("committee_id", "department_id", "examination_id")
REFERENCES "examination_committees"("id", "department_id", "examination_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_chairman_approvals"
ADD CONSTRAINT "sum_chair_approval_assignment_fkey"
FOREIGN KEY (
  "chairman_assignment_id", "department_id", "committee_id"
)
REFERENCES "examination_committee_assignments"(
  "id", "department_id", "committee_id"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_chairman_approvals"
ADD CONSTRAINT "sum_chair_approval_chairman_fkey"
FOREIGN KEY ("chairman_user_id", "department_id")
REFERENCES "users"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_chairman_approvals"
ADD CONSTRAINT "sum_chair_approval_member1_review_fkey"
FOREIGN KEY ("member_1_review_id")
REFERENCES "summative_committee_member_reviews"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_chairman_approvals"
ADD CONSTRAINT "sum_chair_approval_member2_review_fkey"
FOREIGN KEY ("member_2_review_id")
REFERENCES "summative_committee_member_reviews"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "lexora_validate_summative_calculated_mark"()
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
  IF NEW."calculated_at" > statement_timestamp()
     OR NEW."created_at" < NEW."calculated_at"
     OR NEW."created_at" > statement_timestamp() THEN
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

CREATE TRIGGER "summative_calculated_mark_validate_trg"
BEFORE INSERT OR UPDATE OR DELETE ON "summative_calculated_marks"
FOR EACH ROW EXECUTE FUNCTION "lexora_validate_summative_calculated_mark"();

CREATE FUNCTION "lexora_validate_summative_member_review"()
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
     OR NEW."reviewed_at" > statement_timestamp()
     OR NEW."created_at" < NEW."reviewed_at"
     OR NEW."created_at" > statement_timestamp() THEN
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

CREATE TRIGGER "summative_member_review_validate_trg"
BEFORE INSERT OR UPDATE OR DELETE ON "summative_committee_member_reviews"
FOR EACH ROW EXECUTE FUNCTION "lexora_validate_summative_member_review"();

CREATE FUNCTION "lexora_validate_summative_chairman_approval"()
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
     OR NEW."approved_at" > statement_timestamp()
     OR NEW."created_at" < NEW."approved_at"
     OR NEW."created_at" > statement_timestamp() THEN
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

CREATE TRIGGER "summative_chairman_approval_validate_trg"
BEFORE INSERT OR UPDATE OR DELETE ON "summative_chairman_approvals"
FOR EACH ROW EXECUTE FUNCTION "lexora_validate_summative_chairman_approval"();

COMMENT ON TABLE "summative_calculated_marks" IS
'Immutable common calculated Summative evidence for no-Third and Third paths; not approval or published result evidence.';

COMMENT ON TABLE "summative_committee_member_reviews" IS
'Immutable candidate/calculated-mark review evidence bound to an exact internal Committee appointment instance.';

COMMENT ON TABLE "summative_chairman_approvals" IS
'Immutable Chairman-approved final-lock evidence; no Result Engine handoff or published result is created here.';

COMMIT;
