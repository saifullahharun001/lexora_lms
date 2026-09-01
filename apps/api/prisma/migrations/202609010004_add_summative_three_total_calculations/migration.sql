BEGIN;

-- Reconcile the additive Third-referral schema contract without changing its
-- committed owning migration. Existing rows remain active unless later retired.
ALTER TABLE "summative_third_examination_referrals"
ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);

CREATE TYPE "SummativeThreeTotalSelectedPair" AS ENUM (
  'FIRST_SECOND',
  'FIRST_THIRD',
  'SECOND_THIRD'
);

CREATE TYPE "SummativeThreeTotalSelectionReason" AS ENUM (
  'UNIQUE_NEAREST',
  'EQUAL_DISTANCE_HIGHER_PAIR',
  'ALL_EQUAL_CANONICAL'
);

CREATE UNIQUE INDEX "summative_third_referral_calc_scope_uq"
ON "summative_third_examination_referrals"(
  "id", "department_id", "examination_id", "examination_course_id",
  "candidate_id", "comparison_id", "question_configuration_id"
);

CREATE UNIQUE INDEX "summative_third_submission_calc_scope_uq"
ON "summative_third_examiner_mark_submissions"(
  "id", "department_id", "examination_id", "examination_course_id",
  "candidate_id", "referral_id", "question_configuration_id"
);

CREATE TABLE "summative_three_total_calculations" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "examination_id" TEXT NOT NULL,
  "examination_course_id" TEXT NOT NULL,
  "candidate_id" TEXT NOT NULL,
  "comparison_id" TEXT NOT NULL,
  "third_referral_id" TEXT NOT NULL,
  "first_submission_id" TEXT NOT NULL,
  "second_submission_id" TEXT NOT NULL,
  "third_submission_id" TEXT NOT NULL,
  "first_submission_version" SMALLINT NOT NULL,
  "second_submission_version" SMALLINT NOT NULL,
  "third_submission_version" SMALLINT NOT NULL,
  "comparison_version_snapshot" SMALLINT NOT NULL,
  "third_referral_assignment_version_snapshot" SMALLINT NOT NULL,
  "question_configuration_id" TEXT NOT NULL,
  "calculation_version" SMALLINT NOT NULL,
  "first_total_snapshot" DECIMAL(6,2) NOT NULL,
  "second_total_snapshot" DECIMAL(6,2) NOT NULL,
  "third_total_snapshot" DECIMAL(6,2) NOT NULL,
  "summative_full_mark_snapshot" DECIMAL(6,2) NOT NULL,
  "first_second_distance" DECIMAL(6,2) NOT NULL,
  "first_third_distance" DECIMAL(6,2) NOT NULL,
  "second_third_distance" DECIMAL(6,2) NOT NULL,
  "selected_pair" "SummativeThreeTotalSelectedPair" NOT NULL,
  "selection_reason" "SummativeThreeTotalSelectionReason" NOT NULL,
  "rule_version_code" VARCHAR(64) NOT NULL,
  "derived_summative_value" DECIMAL(7,3) NOT NULL,
  "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "summative_three_total_calculations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sum_three_calc_source_triplet_uq"
ON "summative_three_total_calculations"(
  "first_submission_id", "second_submission_id", "third_submission_id"
);

CREATE UNIQUE INDEX "sum_three_calc_candidate_version_uq"
ON "summative_three_total_calculations"(
  "department_id", "examination_course_id", "candidate_id", "calculation_version"
);

CREATE INDEX "sum_three_calc_candidate_lookup_idx"
ON "summative_three_total_calculations"(
  "department_id", "examination_course_id", "candidate_id", "calculated_at"
);

CREATE INDEX "sum_three_calc_comparison_idx"
ON "summative_three_total_calculations"("comparison_id");

CREATE INDEX "sum_three_calc_referral_idx"
ON "summative_three_total_calculations"("third_referral_id");

CREATE INDEX "sum_three_calc_third_source_idx"
ON "summative_three_total_calculations"("third_submission_id");

ALTER TABLE "summative_three_total_calculations"
ADD CONSTRAINT "sum_three_calc_versions_positive_ck"
CHECK (
  "first_submission_version" > 0
  AND "second_submission_version" > 0
  AND "third_submission_version" > 0
  AND "comparison_version_snapshot" > 0
  AND "third_referral_assignment_version_snapshot" > 0
  AND "calculation_version" > 0
);

ALTER TABLE "summative_three_total_calculations"
ADD CONSTRAINT "sum_three_calc_values_valid_ck"
CHECK (
  "summative_full_mark_snapshot" > 0
  AND "first_total_snapshot" >= 0
  AND "second_total_snapshot" >= 0
  AND "third_total_snapshot" >= 0
  AND "first_total_snapshot" <= "summative_full_mark_snapshot"
  AND "second_total_snapshot" <= "summative_full_mark_snapshot"
  AND "third_total_snapshot" <= "summative_full_mark_snapshot"
  AND "first_second_distance" >= 0
  AND "first_third_distance" >= 0
  AND "second_third_distance" >= 0
  AND "derived_summative_value" >= 0
  AND "derived_summative_value" <= "summative_full_mark_snapshot"
  AND LENGTH(BTRIM("rule_version_code")) > 0
);

ALTER TABLE "summative_three_total_calculations"
ADD CONSTRAINT "sum_three_calc_department_fkey"
FOREIGN KEY ("department_id") REFERENCES "departments"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_three_total_calculations"
ADD CONSTRAINT "sum_three_calc_examination_fkey"
FOREIGN KEY ("examination_id", "department_id")
REFERENCES "examinations"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_three_total_calculations"
ADD CONSTRAINT "sum_three_calc_exam_course_fkey"
FOREIGN KEY ("examination_course_id", "department_id", "examination_id")
REFERENCES "examination_courses"("id", "department_id", "examination_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_three_total_calculations"
ADD CONSTRAINT "sum_three_calc_candidate_fkey"
FOREIGN KEY ("candidate_id", "department_id", "examination_id", "examination_course_id")
REFERENCES "summative_examination_candidates"(
  "id", "department_id", "examination_id", "examination_course_id"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_three_total_calculations"
ADD CONSTRAINT "sum_three_calc_comparison_fkey"
FOREIGN KEY ("comparison_id", "department_id", "examination_id", "examination_course_id", "candidate_id")
REFERENCES "summative_examiner_comparisons"(
  "id", "department_id", "examination_id", "examination_course_id", "candidate_id"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_three_total_calculations"
ADD CONSTRAINT "sum_three_calc_referral_fkey"
FOREIGN KEY (
  "third_referral_id", "department_id", "examination_id", "examination_course_id",
  "candidate_id", "comparison_id", "question_configuration_id"
)
REFERENCES "summative_third_examination_referrals"(
  "id", "department_id", "examination_id", "examination_course_id",
  "candidate_id", "comparison_id", "question_configuration_id"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_three_total_calculations"
ADD CONSTRAINT "sum_three_calc_first_source_fkey"
FOREIGN KEY ("first_submission_id", "department_id", "examination_id", "examination_course_id", "candidate_id")
REFERENCES "summative_examiner_mark_submissions"(
  "id", "department_id", "examination_id", "examination_course_id", "candidate_id"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_three_total_calculations"
ADD CONSTRAINT "sum_three_calc_second_source_fkey"
FOREIGN KEY ("second_submission_id", "department_id", "examination_id", "examination_course_id", "candidate_id")
REFERENCES "summative_examiner_mark_submissions"(
  "id", "department_id", "examination_id", "examination_course_id", "candidate_id"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_three_total_calculations"
ADD CONSTRAINT "sum_three_calc_third_source_fkey"
FOREIGN KEY (
  "third_submission_id", "department_id", "examination_id", "examination_course_id",
  "candidate_id", "third_referral_id", "question_configuration_id"
)
REFERENCES "summative_third_examiner_mark_submissions"(
  "id", "department_id", "examination_id", "examination_course_id",
  "candidate_id", "referral_id", "question_configuration_id"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_three_total_calculations"
ADD CONSTRAINT "sum_three_calc_config_fkey"
FOREIGN KEY ("question_configuration_id", "department_id", "examination_id", "examination_course_id")
REFERENCES "summative_question_configurations"(
  "id", "department_id", "examination_id", "examination_course_id"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "lexora_validate_sum_three_calc"()
RETURNS trigger
LANGUAGE plpgsql
AS $body$
DECLARE
  comparison_row "summative_examiner_comparisons"%ROWTYPE;
  referral_row "summative_third_examination_referrals"%ROWTYPE;
  first_source "summative_examiner_mark_submissions"%ROWTYPE;
  second_source "summative_examiner_mark_submissions"%ROWTYPE;
  third_source "summative_third_examiner_mark_submissions"%ROWTYPE;
  authoritative_full_mark DECIMAL(6,2);
  expected_fs DECIMAL(6,2);
  expected_ft DECIMAL(6,2);
  expected_st DECIMAL(6,2);
  minimum_distance DECIMAL(6,2);
  expected_pair "SummativeThreeTotalSelectedPair";
  expected_reason "SummativeThreeTotalSelectionReason";
  expected_derived DECIMAL(7,3);
  expected_version SMALLINT;
  minimum_count INTEGER;
  missing_required_count INTEGER;
  invalid_mark_count INTEGER;
  persisted_third_total DECIMAL(6,2);
  configuration_valid BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Summative three-total calculation evidence is immutable';
  END IF;

  PERFORM 1
  FROM "summative_examination_candidates"
  WHERE "id" = NEW."candidate_id"
    AND "department_id" = NEW."department_id"
    AND "examination_id" = NEW."examination_id"
    AND "examination_course_id" = NEW."examination_course_id"
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Three-total calculation requires an exact candidate scope';
  END IF;

  SELECT "summative_full_mark"
  INTO authoritative_full_mark
  FROM "examination_courses"
  WHERE "id" = NEW."examination_course_id"
    AND "department_id" = NEW."department_id"
    AND "examination_id" = NEW."examination_id"
    AND "archived_at" IS NULL;
  IF authoritative_full_mark IS NULL OR authoritative_full_mark <= 0 THEN
    RAISE EXCEPTION 'Three-total calculation requires a positive authoritative full mark';
  END IF;

  SELECT * INTO comparison_row
  FROM "summative_examiner_comparisons"
  WHERE "id" = NEW."comparison_id"
    AND "department_id" = NEW."department_id"
    AND "examination_id" = NEW."examination_id"
    AND "examination_course_id" = NEW."examination_course_id"
    AND "candidate_id" = NEW."candidate_id";
  IF NOT FOUND OR comparison_row."decision" <> 'THIRD_EXAMINATION_REQUIRED' THEN
    RAISE EXCEPTION 'Three-total calculation requires the exact qualifying comparison';
  END IF;

  SELECT * INTO referral_row
  FROM "summative_third_examination_referrals"
  WHERE "id" = NEW."third_referral_id"
    AND "department_id" = NEW."department_id"
    AND "examination_id" = NEW."examination_id"
    AND "examination_course_id" = NEW."examination_course_id"
    AND "candidate_id" = NEW."candidate_id"
    AND "comparison_id" = NEW."comparison_id"
    AND "question_configuration_id" = NEW."question_configuration_id";
  IF NOT FOUND
     OR referral_row."comparison_version_snapshot" <> comparison_row."comparison_version"
     OR referral_row."rule_version_code" IS DISTINCT FROM comparison_row."rule_version_code"
     OR referral_row."assignment_version" <> NEW."third_referral_assignment_version_snapshot"
     OR referral_row."status" <> 'ASSIGNED'
     OR referral_row."archived_at" IS NOT NULL THEN
    RAISE EXCEPTION 'Three-total calculation Third referral evidence is invalid';
  END IF;

  SELECT * INTO first_source
  FROM "summative_examiner_mark_submissions"
  WHERE "id" = NEW."first_submission_id"
    AND "department_id" = NEW."department_id"
    AND "examination_id" = NEW."examination_id"
    AND "examination_course_id" = NEW."examination_course_id"
    AND "candidate_id" = NEW."candidate_id";
  SELECT * INTO second_source
  FROM "summative_examiner_mark_submissions"
  WHERE "id" = NEW."second_submission_id"
    AND "department_id" = NEW."department_id"
    AND "examination_id" = NEW."examination_id"
    AND "examination_course_id" = NEW."examination_course_id"
    AND "candidate_id" = NEW."candidate_id";
  SELECT * INTO third_source
  FROM "summative_third_examiner_mark_submissions"
  WHERE "id" = NEW."third_submission_id"
    AND "department_id" = NEW."department_id"
    AND "examination_id" = NEW."examination_id"
    AND "examination_course_id" = NEW."examination_course_id"
    AND "candidate_id" = NEW."candidate_id"
    AND "referral_id" = NEW."third_referral_id"
    AND "question_configuration_id" = NEW."question_configuration_id";

  IF first_source."id" IS NULL OR second_source."id" IS NULL OR third_source."id" IS NULL
     OR comparison_row."first_submission_id" <> first_source."id"
     OR comparison_row."second_submission_id" <> second_source."id"
     OR first_source."examiner_seat" <> 'FIRST_EXAMINER'
     OR second_source."examiner_seat" <> 'SECOND_EXAMINER'
     OR first_source."status" <> 'LOCKED'
     OR second_source."status" <> 'LOCKED'
     OR third_source."status" <> 'LOCKED'
     OR first_source."total_mark" IS NULL
     OR second_source."total_mark" IS NULL
     OR third_source."total_mark" IS NULL
     OR third_source."submitted_at" IS NULL
     OR third_source."locked_at" IS NULL
     OR third_source."third_examiner_user_id" <> referral_row."third_examiner_user_id"
     OR first_source."question_configuration_id" <> NEW."question_configuration_id"
     OR second_source."question_configuration_id" <> NEW."question_configuration_id" THEN
    RAISE EXCEPTION 'Three-total calculation source identity or state is invalid';
  END IF;

  IF NEW."first_submission_version" <> first_source."version_number"
     OR NEW."second_submission_version" <> second_source."version_number"
     OR NEW."third_submission_version" <> third_source."version_number"
     OR NEW."comparison_version_snapshot" <> comparison_row."comparison_version"
     OR comparison_row."first_submission_version" <> first_source."version_number"
     OR comparison_row."second_submission_version" <> second_source."version_number"
     OR comparison_row."first_total_snapshot" IS DISTINCT FROM first_source."total_mark"
     OR comparison_row."second_total_snapshot" IS DISTINCT FROM second_source."total_mark"
     OR comparison_row."summative_full_mark_snapshot" IS DISTINCT FROM authoritative_full_mark
     OR NEW."first_total_snapshot" IS DISTINCT FROM first_source."total_mark"
     OR NEW."second_total_snapshot" IS DISTINCT FROM second_source."total_mark"
     OR NEW."third_total_snapshot" IS DISTINCT FROM third_source."total_mark"
     OR NEW."summative_full_mark_snapshot" IS DISTINCT FROM authoritative_full_mark THEN
    RAISE EXCEPTION 'Three-total calculation source snapshots are invalid';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM "summative_question_configurations"
    WHERE "id" = NEW."question_configuration_id"
      AND "department_id" = NEW."department_id"
      AND "examination_id" = NEW."examination_id"
      AND "examination_course_id" = NEW."examination_course_id"
      AND "status" = 'LOCKED'
      AND "archived_at" IS NULL
  ) INTO configuration_valid;
  IF configuration_valid IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Three-total calculation question configuration is invalid';
  END IF;

  SELECT COUNT(*) INTO missing_required_count
  FROM "summative_question_configuration_items" item
  LEFT JOIN "summative_third_examiner_question_marks" mark
    ON mark."submission_id" = third_source."id"
   AND mark."question_item_id" = item."id"
  WHERE item."department_id" = NEW."department_id"
    AND item."configuration_id" = NEW."question_configuration_id"
    AND item."examination_course_id" = NEW."examination_course_id"
    AND item."is_active" = TRUE
    AND item."is_required" = TRUE
    AND mark."id" IS NULL;

  SELECT COUNT(*) INTO invalid_mark_count
  FROM "summative_third_examiner_question_marks" mark
  LEFT JOIN "summative_question_configuration_items" item
    ON item."id" = mark."question_item_id"
   AND item."department_id" = mark."department_id"
   AND item."configuration_id" = mark."question_configuration_id"
   AND item."examination_course_id" = mark."examination_course_id"
  WHERE mark."submission_id" = third_source."id"
    AND (
      item."id" IS NULL
      OR item."is_active" IS DISTINCT FROM TRUE
      OR mark."awarded_mark" < 0
      OR mark."awarded_mark" > item."full_mark"
    );

  SELECT COALESCE(SUM("awarded_mark"), 0)
  INTO persisted_third_total
  FROM "summative_third_examiner_question_marks"
  WHERE "submission_id" = third_source."id";
  IF missing_required_count <> 0 OR invalid_mark_count <> 0
     OR persisted_third_total IS DISTINCT FROM third_source."total_mark" THEN
    RAISE EXCEPTION 'Three-total calculation Third question-mark evidence is invalid';
  END IF;

  IF first_source."total_mark" < 0 OR second_source."total_mark" < 0 OR third_source."total_mark" < 0
     OR first_source."total_mark" > authoritative_full_mark
     OR second_source."total_mark" > authoritative_full_mark
     OR third_source."total_mark" > authoritative_full_mark THEN
    RAISE EXCEPTION 'Three-total calculation source totals are invalid';
  END IF;

  expected_fs := ABS(first_source."total_mark" - second_source."total_mark");
  expected_ft := ABS(first_source."total_mark" - third_source."total_mark");
  expected_st := ABS(second_source."total_mark" - third_source."total_mark");
  minimum_distance := LEAST(expected_fs, expected_ft, expected_st);

  IF first_source."total_mark" = second_source."total_mark"
     AND second_source."total_mark" = third_source."total_mark" THEN
    expected_pair := 'FIRST_SECOND';
    expected_reason := 'ALL_EQUAL_CANONICAL';
  ELSE
    SELECT p.pair INTO expected_pair
    FROM (VALUES
      ('FIRST_SECOND'::"SummativeThreeTotalSelectedPair", expected_fs,
        GREATEST(first_source."total_mark", second_source."total_mark"),
        LEAST(first_source."total_mark", second_source."total_mark"), 1),
      ('FIRST_THIRD'::"SummativeThreeTotalSelectedPair", expected_ft,
        GREATEST(first_source."total_mark", third_source."total_mark"),
        LEAST(first_source."total_mark", third_source."total_mark"), 2),
      ('SECOND_THIRD'::"SummativeThreeTotalSelectedPair", expected_st,
        GREATEST(second_source."total_mark", third_source."total_mark"),
        LEAST(second_source."total_mark", third_source."total_mark"), 3)
    ) AS p(pair, distance, high_value, low_value, stable_order)
    WHERE p.distance = minimum_distance
    ORDER BY p.high_value DESC, p.low_value DESC, p.stable_order ASC
    LIMIT 1;
    SELECT COUNT(*) INTO minimum_count
    FROM (VALUES (expected_fs), (expected_ft), (expected_st)) AS d(distance)
    WHERE d.distance = minimum_distance;
    expected_reason := CASE WHEN minimum_count = 1
      THEN 'UNIQUE_NEAREST'::"SummativeThreeTotalSelectionReason"
      ELSE 'EQUAL_DISTANCE_HIGHER_PAIR'::"SummativeThreeTotalSelectionReason"
    END;
  END IF;

  expected_derived := CASE expected_pair
    WHEN 'FIRST_SECOND' THEN (first_source."total_mark" + second_source."total_mark") / 2
    WHEN 'FIRST_THIRD' THEN (first_source."total_mark" + third_source."total_mark") / 2
    WHEN 'SECOND_THIRD' THEN (second_source."total_mark" + third_source."total_mark") / 2
  END;

  IF NEW."first_second_distance" IS DISTINCT FROM expected_fs
     OR NEW."first_third_distance" IS DISTINCT FROM expected_ft
     OR NEW."second_third_distance" IS DISTINCT FROM expected_st
     OR NEW."selected_pair" IS DISTINCT FROM expected_pair
     OR NEW."selection_reason" IS DISTINCT FROM expected_reason
     OR NEW."derived_summative_value" IS DISTINCT FROM expected_derived
     OR NEW."rule_version_code" <> 'SUMMATIVE_THREE_TOTAL_NEAREST_PAIR_V1' THEN
    RAISE EXCEPTION 'Three-total calculation derived evidence is invalid';
  END IF;

  SELECT COALESCE(MAX("calculation_version"), 0) + 1
  INTO expected_version
  FROM "summative_three_total_calculations"
  WHERE "department_id" = NEW."department_id"
    AND "examination_course_id" = NEW."examination_course_id"
    AND "candidate_id" = NEW."candidate_id";
  IF NEW."calculation_version" <> expected_version THEN
    RAISE EXCEPTION 'Three-total calculation version is invalid';
  END IF;

  RETURN NEW;
END;
$body$;

CREATE TRIGGER "sum_three_calc_validate_trg"
BEFORE INSERT OR UPDATE OR DELETE ON "summative_three_total_calculations"
FOR EACH ROW
EXECUTE FUNCTION "lexora_validate_sum_three_calc"();

COMMENT ON TABLE "summative_three_total_calculations" IS
'Immutable exact-source three-total nearest-pair evidence and unrounded derived Summative value; not an approved result.';

COMMIT;
