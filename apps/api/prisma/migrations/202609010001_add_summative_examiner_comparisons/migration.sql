BEGIN;

CREATE TYPE "SummativeExaminerComparisonDecision" AS ENUM (
  'THIRD_EXAMINATION_REQUIRED',
  'THIRD_EXAMINATION_NOT_REQUIRED'
);

CREATE UNIQUE INDEX "summative_mark_submission_comparison_scope_uq"
ON "summative_examiner_mark_submissions"(
  "id",
  "department_id",
  "examination_id",
  "examination_course_id",
  "candidate_id"
);

CREATE TABLE "summative_examiner_comparisons" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "examination_id" TEXT NOT NULL,
  "examination_course_id" TEXT NOT NULL,
  "candidate_id" TEXT NOT NULL,
  "first_submission_id" TEXT NOT NULL,
  "second_submission_id" TEXT NOT NULL,
  "first_submission_version" SMALLINT NOT NULL,
  "second_submission_version" SMALLINT NOT NULL,
  "comparison_version" SMALLINT NOT NULL,
  "first_total_snapshot" DECIMAL(6,2) NOT NULL,
  "second_total_snapshot" DECIMAL(6,2) NOT NULL,
  "summative_full_mark_snapshot" DECIMAL(6,2) NOT NULL,
  "absolute_difference" DECIMAL(6,2) NOT NULL,
  "variance_percentage" DECIMAL(9,6) NOT NULL,
  "threshold_percentage_snapshot" DECIMAL(5,2) NOT NULL,
  "rule_version_code" VARCHAR(64) NOT NULL,
  "decision" "SummativeExaminerComparisonDecision" NOT NULL,
  "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "summative_examiner_comparisons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "summative_comparison_source_pair_uq"
ON "summative_examiner_comparisons"(
  "first_submission_id",
  "second_submission_id"
);

CREATE UNIQUE INDEX "summative_comparison_candidate_version_uq"
ON "summative_examiner_comparisons"(
  "department_id",
  "examination_course_id",
  "candidate_id",
  "comparison_version"
);

CREATE INDEX "summative_comparison_candidate_lookup_idx"
ON "summative_examiner_comparisons"(
  "department_id",
  "examination_course_id",
  "candidate_id",
  "calculated_at"
);

CREATE INDEX "summative_comparison_second_source_idx"
ON "summative_examiner_comparisons"("second_submission_id");

ALTER TABLE "summative_examiner_comparisons"
ADD CONSTRAINT "summative_comparison_versions_positive_ck"
CHECK (
  "first_submission_version" > 0
  AND "second_submission_version" > 0
  AND "comparison_version" > 0
);

ALTER TABLE "summative_examiner_comparisons"
ADD CONSTRAINT "summative_comparison_values_valid_ck"
CHECK (
  "first_total_snapshot" >= 0
  AND "second_total_snapshot" >= 0
  AND "summative_full_mark_snapshot" > 0
  AND "first_total_snapshot" <= "summative_full_mark_snapshot"
  AND "second_total_snapshot" <= "summative_full_mark_snapshot"
  AND "absolute_difference" >= 0
  AND "variance_percentage" >= 0
  AND "threshold_percentage_snapshot" > 0
  AND "threshold_percentage_snapshot" <= 100
  AND LENGTH(BTRIM("rule_version_code")) > 0
  AND "first_submission_id" <> "second_submission_id"
);

ALTER TABLE "summative_examiner_comparisons"
ADD CONSTRAINT "summative_comparison_derived_values_ck"
CHECK (
  "absolute_difference" = ABS("first_total_snapshot" - "second_total_snapshot")
  AND "variance_percentage" = ROUND(
    ("absolute_difference" * 100) / "summative_full_mark_snapshot",
    6
  )
);

ALTER TABLE "summative_examiner_comparisons"
ADD CONSTRAINT "summative_comparison_decision_consistency_ck"
CHECK (
  (
    "absolute_difference" * 100
      >= "summative_full_mark_snapshot" * "threshold_percentage_snapshot"
    AND "decision" = 'THIRD_EXAMINATION_REQUIRED'
  )
  OR
  (
    "absolute_difference" * 100
      < "summative_full_mark_snapshot" * "threshold_percentage_snapshot"
    AND "decision" = 'THIRD_EXAMINATION_NOT_REQUIRED'
  )
);

ALTER TABLE "summative_examiner_comparisons"
ADD CONSTRAINT "summative_comparison_department_fkey"
FOREIGN KEY ("department_id")
REFERENCES "departments"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_examiner_comparisons"
ADD CONSTRAINT "summative_comparison_examination_fkey"
FOREIGN KEY ("examination_id", "department_id")
REFERENCES "examinations"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_examiner_comparisons"
ADD CONSTRAINT "summative_comparison_exam_course_fkey"
FOREIGN KEY ("examination_course_id", "department_id", "examination_id")
REFERENCES "examination_courses"("id", "department_id", "examination_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_examiner_comparisons"
ADD CONSTRAINT "summative_comparison_candidate_fkey"
FOREIGN KEY (
  "candidate_id",
  "department_id",
  "examination_id",
  "examination_course_id"
)
REFERENCES "summative_examination_candidates"(
  "id",
  "department_id",
  "examination_id",
  "examination_course_id"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_examiner_comparisons"
ADD CONSTRAINT "summative_comparison_first_source_fkey"
FOREIGN KEY (
  "first_submission_id",
  "department_id",
  "examination_id",
  "examination_course_id",
  "candidate_id"
)
REFERENCES "summative_examiner_mark_submissions"(
  "id",
  "department_id",
  "examination_id",
  "examination_course_id",
  "candidate_id"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_examiner_comparisons"
ADD CONSTRAINT "summative_comparison_second_source_fkey"
FOREIGN KEY (
  "second_submission_id",
  "department_id",
  "examination_id",
  "examination_course_id",
  "candidate_id"
)
REFERENCES "summative_examiner_mark_submissions"(
  "id",
  "department_id",
  "examination_id",
  "examination_course_id",
  "candidate_id"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "lexora_validate_summative_examiner_comparison"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  first_source "summative_examiner_mark_submissions"%ROWTYPE;
  second_source "summative_examiner_mark_submissions"%ROWTYPE;
  authoritative_full_mark DECIMAL(6,2);
  expected_difference DECIMAL(6,2);
  expected_variance DECIMAL(9,6);
  expected_version SMALLINT;
  first_source_count INTEGER;
  second_source_count INTEGER;
  expected_decision "SummativeExaminerComparisonDecision";
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Summative Examiner comparison evidence is immutable';
  END IF;

  PERFORM 1
  FROM "summative_examination_candidates"
  WHERE "id" = NEW."candidate_id"
    AND "department_id" = NEW."department_id"
    AND "examination_id" = NEW."examination_id"
    AND "examination_course_id" = NEW."examination_course_id"
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Summative Examiner comparison requires an exact candidate scope';
  END IF;

  SELECT "summative_full_mark"
  INTO authoritative_full_mark
  FROM "examination_courses"
  WHERE "id" = NEW."examination_course_id"
    AND "department_id" = NEW."department_id"
    AND "examination_id" = NEW."examination_id";
  IF authoritative_full_mark IS NULL OR authoritative_full_mark <= 0 THEN
    RAISE EXCEPTION 'Summative Examiner comparison requires a positive authoritative full mark';
  END IF;

  SELECT *
  INTO first_source
  FROM "summative_examiner_mark_submissions"
  WHERE "id" = NEW."first_submission_id"
    AND "department_id" = NEW."department_id"
    AND "examination_id" = NEW."examination_id"
    AND "examination_course_id" = NEW."examination_course_id"
    AND "candidate_id" = NEW."candidate_id";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Summative Examiner comparison First source is invalid';
  END IF;

  SELECT *
  INTO second_source
  FROM "summative_examiner_mark_submissions"
  WHERE "id" = NEW."second_submission_id"
    AND "department_id" = NEW."department_id"
    AND "examination_id" = NEW."examination_id"
    AND "examination_course_id" = NEW."examination_course_id"
    AND "candidate_id" = NEW."candidate_id";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Summative Examiner comparison Second source is invalid';
  END IF;

  IF first_source."examiner_seat" <> 'FIRST_EXAMINER'
     OR second_source."examiner_seat" <> 'SECOND_EXAMINER' THEN
    RAISE EXCEPTION 'Summative Examiner comparison sources use invalid seats';
  END IF;
  IF first_source."status" <> 'LOCKED'
     OR second_source."status" <> 'LOCKED'
     OR first_source."total_mark" IS NULL
     OR second_source."total_mark" IS NULL THEN
    RAISE EXCEPTION 'Summative Examiner comparison requires two LOCKED sources';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE "examiner_seat" = 'FIRST_EXAMINER'),
    COUNT(*) FILTER (WHERE "examiner_seat" = 'SECOND_EXAMINER')
  INTO first_source_count, second_source_count
  FROM "summative_examiner_mark_submissions"
  WHERE "department_id" = NEW."department_id"
    AND "examination_id" = NEW."examination_id"
    AND "examination_course_id" = NEW."examination_course_id"
    AND "candidate_id" = NEW."candidate_id";
  IF first_source_count <> 1 OR second_source_count <> 1 THEN
    RAISE EXCEPTION 'Summative Examiner comparison source versions are ambiguous';
  END IF;

  IF NEW."first_submission_version" <> first_source."version_number"
     OR NEW."second_submission_version" <> second_source."version_number"
     OR NEW."first_total_snapshot" IS DISTINCT FROM first_source."total_mark"
     OR NEW."second_total_snapshot" IS DISTINCT FROM second_source."total_mark" THEN
    RAISE EXCEPTION 'Summative Examiner comparison source snapshots are invalid';
  END IF;
  IF NEW."summative_full_mark_snapshot" IS DISTINCT FROM authoritative_full_mark THEN
    RAISE EXCEPTION 'Summative Examiner comparison full-mark snapshot is invalid';
  END IF;
  IF first_source."total_mark" < 0
     OR second_source."total_mark" < 0
     OR first_source."total_mark" > authoritative_full_mark
     OR second_source."total_mark" > authoritative_full_mark THEN
    RAISE EXCEPTION 'Summative Examiner comparison source totals are invalid';
  END IF;

  IF NEW."threshold_percentage_snapshot" IS DISTINCT FROM 15.00::DECIMAL(5,2)
     OR NEW."rule_version_code" <> 'SUMMATIVE_FS_VARIANCE_15_PERCENT_V1' THEN
    RAISE EXCEPTION 'Summative Examiner comparison rule evidence is invalid';
  END IF;

  expected_difference := ABS(first_source."total_mark" - second_source."total_mark");
  expected_variance := ROUND((expected_difference * 100) / authoritative_full_mark, 6);
  expected_decision := CASE
    WHEN expected_difference * 100
      >= authoritative_full_mark * NEW."threshold_percentage_snapshot"
      THEN 'THIRD_EXAMINATION_REQUIRED'::"SummativeExaminerComparisonDecision"
    ELSE 'THIRD_EXAMINATION_NOT_REQUIRED'::"SummativeExaminerComparisonDecision"
  END;

  IF NEW."absolute_difference" IS DISTINCT FROM expected_difference
     OR NEW."variance_percentage" IS DISTINCT FROM expected_variance
     OR NEW."decision" IS DISTINCT FROM expected_decision THEN
    RAISE EXCEPTION 'Summative Examiner comparison derived evidence is invalid';
  END IF;

  SELECT COALESCE(MAX("comparison_version"), 0) + 1
  INTO expected_version
  FROM "summative_examiner_comparisons"
  WHERE "department_id" = NEW."department_id"
    AND "examination_course_id" = NEW."examination_course_id"
    AND "candidate_id" = NEW."candidate_id";
  IF NEW."comparison_version" <> expected_version THEN
    RAISE EXCEPTION 'Summative Examiner comparison version is invalid';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "summative_examiner_comparison_validate_trg"
BEFORE INSERT OR UPDATE OR DELETE ON "summative_examiner_comparisons"
FOR EACH ROW
EXECUTE FUNCTION "lexora_validate_summative_examiner_comparison"();

COMMENT ON TABLE "summative_examiner_comparisons" IS
'Immutable exact-source First/Second Examiner comparison evidence using the authoritative Summative full mark and versioned variance rule.';

COMMIT;
