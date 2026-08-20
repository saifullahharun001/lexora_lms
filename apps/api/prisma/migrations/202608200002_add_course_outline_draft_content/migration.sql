BEGIN;

ALTER TABLE "course_outline_versions"
ADD COLUMN "course_summary" TEXT,
ADD COLUMN "delivery_plan" TEXT,
ADD COLUMN "teaching_strategies" TEXT,
ADD COLUMN "assessment_strategy" TEXT,
ADD COLUMN "evaluation_policy" TEXT,
ADD COLUMN "make_up_procedure" TEXT;

COMMIT;
