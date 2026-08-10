BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "course_offerings"
    WHERE "curriculum_course_id" IS NULL
    GROUP BY "department_id", "academic_term_id", "course_id", "section_code"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'CourseOffering unbound identity duplicates prevent uniqueness redesign';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "course_offerings"
    WHERE "curriculum_course_id" IS NOT NULL
    GROUP BY "department_id", "academic_term_id", "curriculum_course_id", "section_code"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'CourseOffering bound curriculum identity duplicates prevent uniqueness redesign';
  END IF;
END $$;

CREATE UNIQUE INDEX "course_offering_unbound_identity_uq"
  ON "course_offerings"("department_id", "academic_term_id", "course_id", "section_code")
  WHERE "curriculum_course_id" IS NULL;

CREATE UNIQUE INDEX "course_offering_bound_curriculum_identity_uq"
  ON "course_offerings"("department_id", "academic_term_id", "curriculum_course_id", "section_code")
  WHERE "curriculum_course_id" IS NOT NULL;

DROP INDEX "course_offerings_department_id_academic_term_id_course_id_s_key";

COMMIT;
