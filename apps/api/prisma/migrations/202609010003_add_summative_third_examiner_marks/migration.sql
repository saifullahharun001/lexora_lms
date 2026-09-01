-- CreateEnum
CREATE TYPE "SummativeThirdExaminerMarkSubmissionStatus" AS ENUM ('DRAFT', 'LOCKED');

-- CreateTable
CREATE TABLE "summative_third_examiner_mark_submissions" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "examination_id" TEXT NOT NULL,
    "examination_course_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "referral_id" TEXT NOT NULL,
    "third_examiner_user_id" TEXT NOT NULL,
    "question_configuration_id" TEXT NOT NULL,
    "version_number" SMALLINT NOT NULL,
    "status" "SummativeThirdExaminerMarkSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "total_mark" DECIMAL(6,2),
    "submitted_at" TIMESTAMP(3),
    "locked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "summative_third_examiner_mark_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "summative_third_examiner_question_marks" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "examination_course_id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "question_configuration_id" TEXT NOT NULL,
    "question_item_id" TEXT NOT NULL,
    "awarded_mark" DECIMAL(6,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "summative_third_examiner_question_marks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "summative_third_mark_submission_lookup_idx" ON "summative_third_examiner_mark_submissions"("department_id", "examination_course_id", "third_examiner_user_id", "candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "summative_third_mark_submission_config_scope_uq" ON "summative_third_examiner_mark_submissions"("id", "department_id", "examination_course_id", "question_configuration_id");

-- CreateIndex
CREATE UNIQUE INDEX "summative_third_mark_submission_referral_version_uq" ON "summative_third_examiner_mark_submissions"("department_id", "referral_id", "version_number");

-- CreateIndex
CREATE INDEX "summative_third_question_mark_lookup_idx" ON "summative_third_examiner_question_marks"("department_id", "submission_id", "question_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "summative_third_question_mark_submission_item_uq" ON "summative_third_examiner_question_marks"("submission_id", "question_item_id");

-- AddForeignKey
ALTER TABLE "summative_third_examiner_mark_submissions" ADD CONSTRAINT "summative_third_mark_submission_department_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "summative_third_examiner_mark_submissions" ADD CONSTRAINT "summative_third_mark_submission_examination_fkey" FOREIGN KEY ("examination_id", "department_id") REFERENCES "examinations"("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "summative_third_examiner_mark_submissions" ADD CONSTRAINT "summative_third_mark_submission_exam_course_fkey" FOREIGN KEY ("examination_course_id", "department_id", "examination_id") REFERENCES "examination_courses"("id", "department_id", "examination_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "summative_third_examiner_mark_submissions" ADD CONSTRAINT "summative_third_mark_submission_candidate_fkey" FOREIGN KEY ("candidate_id", "department_id", "examination_id", "examination_course_id") REFERENCES "summative_examination_candidates"("id", "department_id", "examination_id", "examination_course_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "summative_third_examiner_mark_submissions" ADD CONSTRAINT "summative_third_mark_submission_referral_fkey" FOREIGN KEY ("referral_id") REFERENCES "summative_third_examination_referrals"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "summative_third_examiner_mark_submissions" ADD CONSTRAINT "summative_third_mark_submission_examiner_fkey" FOREIGN KEY ("third_examiner_user_id", "department_id") REFERENCES "users"("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "summative_third_examiner_mark_submissions" ADD CONSTRAINT "summative_third_mark_submission_config_fkey" FOREIGN KEY ("question_configuration_id", "department_id", "examination_id", "examination_course_id") REFERENCES "summative_question_configurations"("id", "department_id", "examination_id", "examination_course_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "summative_third_examiner_question_marks" ADD CONSTRAINT "summative_third_question_mark_department_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "summative_third_examiner_question_marks" ADD CONSTRAINT "summative_third_question_mark_submission_fkey" FOREIGN KEY ("submission_id", "department_id", "examination_course_id", "question_configuration_id") REFERENCES "summative_third_examiner_mark_submissions"("id", "department_id", "examination_course_id", "question_configuration_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "summative_third_examiner_question_marks" ADD CONSTRAINT "summative_third_question_mark_config_fkey" FOREIGN KEY ("question_configuration_id", "department_id", "examination_course_id") REFERENCES "summative_question_configurations"("id", "department_id", "examination_course_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "summative_third_examiner_question_marks" ADD CONSTRAINT "summative_third_question_mark_item_fkey" FOREIGN KEY ("question_item_id", "department_id", "question_configuration_id", "examination_course_id") REFERENCES "summative_question_configuration_items"("id", "department_id", "configuration_id", "examination_course_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "summative_third_examiner_mark_submissions"
ADD CONSTRAINT "summative_third_mark_submission_version_positive_ck"
CHECK ("version_number" > 0);

ALTER TABLE "summative_third_examiner_mark_submissions"
ADD CONSTRAINT "summative_third_mark_submission_lifecycle_ck"
CHECK (
  (
    "status" = 'DRAFT'
    AND "total_mark" IS NULL
    AND "submitted_at" IS NULL
    AND "locked_at" IS NULL
  )
  OR (
    "status" = 'LOCKED'
    AND "total_mark" IS NOT NULL
    AND "total_mark" >= 0
    AND "submitted_at" IS NOT NULL
    AND "locked_at" IS NOT NULL
    AND "locked_at" >= "submitted_at"
  )
);

ALTER TABLE "summative_third_examiner_question_marks"
ADD CONSTRAINT "summative_third_question_mark_nonnegative_ck"
CHECK ("awarded_mark" >= 0);

CREATE FUNCTION "lexora_guard_locked_summative_third_submission"()
RETURNS trigger
LANGUAGE plpgsql
AS $body$
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(
    OLD."department_id",
    OLD."examination_id",
    OLD."examination_course_id",
    OLD."candidate_id",
    OLD."referral_id",
    OLD."third_examiner_user_id",
    OLD."question_configuration_id",
    OLD."version_number",
    OLD."created_at"
  ) IS DISTINCT FROM ROW(
    NEW."department_id",
    NEW."examination_id",
    NEW."examination_course_id",
    NEW."candidate_id",
    NEW."referral_id",
    NEW."third_examiner_user_id",
    NEW."question_configuration_id",
    NEW."version_number",
    NEW."created_at"
  ) THEN
    RAISE EXCEPTION 'Third Examiner mark submission identity is immutable';
  END IF;
  IF OLD."status" = 'LOCKED' THEN
    RAISE EXCEPTION 'Locked Third Examiner mark submission is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$body$;

CREATE TRIGGER "summative_third_locked_submission_immutable_trg"
BEFORE UPDATE OR DELETE ON "summative_third_examiner_mark_submissions"
FOR EACH ROW
EXECUTE FUNCTION "lexora_guard_locked_summative_third_submission"();

CREATE FUNCTION "lexora_validate_summative_third_question_mark"()
RETURNS trigger
LANGUAGE plpgsql
AS $body$
DECLARE
  target_submission_id TEXT;
  submission_status "SummativeThirdExaminerMarkSubmissionStatus";
  configured_full_mark DECIMAL(6,2);
  configured_active BOOLEAN;
BEGIN
  target_submission_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."submission_id" ELSE NEW."submission_id" END;

  IF TG_OP = 'UPDATE' AND ROW(
    OLD."department_id",
    OLD."examination_course_id",
    OLD."submission_id",
    OLD."question_configuration_id",
    OLD."question_item_id",
    OLD."created_at"
  ) IS DISTINCT FROM ROW(
    NEW."department_id",
    NEW."examination_course_id",
    NEW."submission_id",
    NEW."question_configuration_id",
    NEW."question_item_id",
    NEW."created_at"
  ) THEN
    RAISE EXCEPTION 'Third Examiner question mark identity is immutable';
  END IF;

  SELECT "status"
  INTO submission_status
  FROM "summative_third_examiner_mark_submissions"
  WHERE "id" = target_submission_id
  FOR UPDATE;

  IF submission_status IS NULL THEN
    RAISE EXCEPTION 'Third Examiner question mark requires an existing submission';
  ELSIF submission_status = 'LOCKED' THEN
    RAISE EXCEPTION 'Question marks of a locked submission are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT "full_mark", "is_active"
  INTO configured_full_mark, configured_active
  FROM "summative_question_configuration_items"
  WHERE "id" = NEW."question_item_id"
    AND "department_id" = NEW."department_id"
    AND "configuration_id" = NEW."question_configuration_id"
    AND "examination_course_id" = NEW."examination_course_id";

  IF configured_full_mark IS NULL OR configured_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Examiner mark requires an active authoritative question item';
  END IF;
  IF NEW."awarded_mark" > configured_full_mark THEN
    RAISE EXCEPTION 'Awarded mark exceeds configured question full mark';
  END IF;
  RETURN NEW;
END;
$body$;

CREATE TRIGGER "summative_third_question_mark_validate_trg"
BEFORE INSERT OR UPDATE OR DELETE ON "summative_third_examiner_question_marks"
FOR EACH ROW
EXECUTE FUNCTION "lexora_validate_summative_third_question_mark"();

CREATE FUNCTION "lexora_validate_summative_third_submission_lock"()
RETURNS trigger
LANGUAGE plpgsql
AS $body$
DECLARE
  authoritative_configuration_id TEXT;
  authoritative_full_mark DECIMAL(6,2);
  configuration_status "SummativeQuestionConfigurationStatus";
  configuration_archived_at TIMESTAMP(3);
  missing_required_count INTEGER;
  invalid_mark_count INTEGER;
  persisted_total DECIMAL(6,2);
BEGIN
  IF NEW."status" <> 'LOCKED' OR OLD."status" = 'LOCKED' THEN
    RETURN NEW;
  END IF;

  SELECT
    ref."question_configuration_id",
    ec."summative_full_mark",
    sqc."status",
    sqc."archived_at"
  INTO
    authoritative_configuration_id,
    authoritative_full_mark,
    configuration_status,
    configuration_archived_at
  FROM "summative_third_examination_referrals" ref
  JOIN "examination_courses" ec
    ON ec."id" = ref."examination_course_id"
  JOIN "summative_question_configurations" sqc
    ON sqc."id" = ref."question_configuration_id"
   AND sqc."department_id" = ec."department_id"
   AND sqc."examination_course_id" = ec."id"
  WHERE ref."id" = NEW."referral_id"
    AND ec."archived_at" IS NULL;

  IF authoritative_configuration_id IS NULL
     OR authoritative_configuration_id <> NEW."question_configuration_id"
     OR configuration_status <> 'LOCKED'
     OR configuration_archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Submission does not use the exact question configuration bound to the referral';
  END IF;

  SELECT COUNT(*)
  INTO missing_required_count
  FROM "summative_question_configuration_items" item
  LEFT JOIN "summative_third_examiner_question_marks" mark
    ON mark."submission_id" = NEW."id"
   AND mark."question_item_id" = item."id"
  WHERE item."department_id" = NEW."department_id"
    AND item."configuration_id" = NEW."question_configuration_id"
    AND item."examination_course_id" = NEW."examination_course_id"
    AND item."is_active" = TRUE
    AND item."is_required" = TRUE
    AND mark."id" IS NULL;

  IF missing_required_count <> 0 THEN
    RAISE EXCEPTION 'Required question marks are missing';
  END IF;

  SELECT COUNT(*)
  INTO invalid_mark_count
  FROM "summative_third_examiner_question_marks" mark
  LEFT JOIN "summative_question_configuration_items" item
    ON item."id" = mark."question_item_id"
   AND item."department_id" = mark."department_id"
   AND item."configuration_id" = mark."question_configuration_id"
   AND item."examination_course_id" = mark."examination_course_id"
  WHERE mark."submission_id" = NEW."id"
    AND (
      item."id" IS NULL
      OR item."is_active" IS DISTINCT FROM TRUE
      OR mark."awarded_mark" > item."full_mark"
    );

  IF invalid_mark_count <> 0 THEN
    RAISE EXCEPTION 'Submission contains invalid question marks';
  END IF;

  SELECT COALESCE(SUM("awarded_mark"), 0)
  INTO persisted_total
  FROM "summative_third_examiner_question_marks"
  WHERE "submission_id" = NEW."id";

  IF NEW."total_mark" IS DISTINCT FROM persisted_total THEN
    RAISE EXCEPTION 'Submission total does not equal persisted question marks';
  END IF;
  IF NEW."total_mark" > authoritative_full_mark THEN
    RAISE EXCEPTION 'Submission total exceeds ExaminationCourse full mark';
  END IF;

  RETURN NEW;
END;
$body$;

CREATE TRIGGER "summative_third_submission_lock_validate_trg"
BEFORE UPDATE ON "summative_third_examiner_mark_submissions"
FOR EACH ROW
EXECUTE FUNCTION "lexora_validate_summative_third_submission_lock"();

COMMENT ON TABLE "summative_third_examiner_mark_submissions" IS
'Referral-bound versioned Third Examiner submissions. LOCKED versions are immutable.';

COMMENT ON TABLE "summative_third_examiner_question_marks" IS
'Protected question-wise marks for one exact Third Examiner submission and authoritative locked question configuration.';
