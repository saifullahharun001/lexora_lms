BEGIN;

CREATE TYPE "ExaminationCommitteeSeat" AS ENUM (
  'CHAIRMAN',
  'MEMBER_1',
  'MEMBER_2'
);

CREATE TYPE "ExaminationCommitteeAssignmentStatus" AS ENUM (
  'ACTIVE',
  'INACTIVE',
  'ARCHIVED'
);

CREATE UNIQUE INDEX "curriculum_version_id_dept_program_uq"
ON "curriculum_versions"("id", "department_id", "academic_program_id");

CREATE UNIQUE INDEX "student_batch_exam_scope_identity_uq"
ON "student_batches"(
  "id",
  "department_id",
  "academic_program_id",
  "academic_session_id"
);

CREATE UNIQUE INDEX "curriculum_course_exam_identity_uq"
ON "curriculum_courses"(
  "id",
  "department_id",
  "curriculum_version_id",
  "assessment_template_id"
);

CREATE UNIQUE INDEX "course_offering_exam_identity_uq"
ON "course_offerings"(
  "id",
  "department_id",
  "academic_term_id",
  "curriculum_course_id",
  "syllabus_version_id"
);

CREATE UNIQUE INDEX "course_offering_exam_batch_identity_uq"
ON "course_offerings"(
  "id",
  "department_id",
  "academic_term_id",
  "curriculum_course_id",
  "syllabus_version_id",
  "student_batch_id"
);

CREATE UNIQUE INDEX "assessment_component_summative_identity_uq"
ON "assessment_template_components"(
  "id",
  "department_id",
  "assessment_template_id",
  "code",
  "maximum_marks"
);

CREATE TABLE "examinations" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "academic_program_id" TEXT NOT NULL,
  "academic_session_id" TEXT NOT NULL,
  "academic_term_id" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "category_code" VARCHAR(64) NOT NULL,
  "rule_version_code" VARCHAR(64) NOT NULL,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "examinations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "examination_courses" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "examination_id" TEXT NOT NULL,
  "academic_program_id" TEXT NOT NULL,
  "academic_session_id" TEXT NOT NULL,
  "academic_term_id" TEXT NOT NULL,
  "course_offering_id" TEXT NOT NULL,
  "student_batch_id" TEXT,
  "curriculum_version_id" TEXT NOT NULL,
  "curriculum_course_id" TEXT NOT NULL,
  "syllabus_version_id" TEXT NOT NULL,
  "assessment_template_id" TEXT NOT NULL,
  "summative_assessment_component_id" TEXT NOT NULL,
  "summative_component_code" VARCHAR(64) NOT NULL DEFAULT 'SUMMATIVE_EXAMINATION',
  "summative_full_mark" DECIMAL(6,2) NOT NULL,
  "marking_deadline" TIMESTAMP(3),
  "rule_version_code" VARCHAR(64) NOT NULL,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "examination_courses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "examination_committees" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "examination_id" TEXT NOT NULL,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "examination_committees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "examination_committee_assignments" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "examination_id" TEXT NOT NULL,
  "committee_id" TEXT NOT NULL,
  "assigned_user_id" TEXT NOT NULL,
  "assigned_by_user_id" TEXT NOT NULL,
  "seat" "ExaminationCommitteeSeat" NOT NULL,
  "status" "ExaminationCommitteeAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3),
  "unassigned_at" TIMESTAMP(3),
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "examination_committee_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "examination_id_department_uq"
ON "examinations"("id", "department_id");

CREATE UNIQUE INDEX "examination_scope_identity_uq"
ON "examinations"(
  "id",
  "department_id",
  "academic_program_id",
  "academic_session_id",
  "academic_term_id"
);

CREATE UNIQUE INDEX "examination_department_code_uq"
ON "examinations"("department_id", "code");

CREATE INDEX "examination_academic_scope_idx"
ON "examinations"(
  "department_id",
  "academic_program_id",
  "academic_session_id",
  "academic_term_id"
);

CREATE UNIQUE INDEX "examination_course_scope_identity_uq"
ON "examination_courses"("id", "department_id", "examination_id");

CREATE UNIQUE INDEX "examination_course_offering_uq"
ON "examination_courses"(
  "department_id",
  "examination_id",
  "course_offering_id"
);

CREATE INDEX "examination_course_examination_idx"
ON "examination_courses"("department_id", "examination_id");

CREATE INDEX "examination_course_offering_idx"
ON "examination_courses"("department_id", "course_offering_id");

CREATE INDEX "examination_course_student_batch_idx"
ON "examination_courses"("department_id", "student_batch_id");

CREATE INDEX "examination_course_curriculum_idx"
ON "examination_courses"(
  "department_id",
  "curriculum_version_id",
  "curriculum_course_id"
);

CREATE INDEX "examination_course_template_idx"
ON "examination_courses"("department_id", "assessment_template_id");

CREATE INDEX "examination_course_summative_component_idx"
ON "examination_courses"(
  "department_id",
  "summative_assessment_component_id"
);

CREATE UNIQUE INDEX "examination_committee_scope_identity_uq"
ON "examination_committees"("id", "department_id", "examination_id");

CREATE UNIQUE INDEX "examination_committee_examination_uq"
ON "examination_committees"("department_id", "examination_id");

CREATE UNIQUE INDEX "exam_committee_assignment_scope_identity_uq"
ON "examination_committee_assignments"("id", "department_id", "committee_id");

CREATE INDEX "exam_committee_assignment_scope_status_idx"
ON "examination_committee_assignments"(
  "department_id",
  "committee_id",
  "examination_id",
  "status"
);

CREATE INDEX "exam_committee_assignment_user_status_idx"
ON "examination_committee_assignments"(
  "department_id",
  "assigned_user_id",
  "status"
);

CREATE INDEX "exam_committee_assignment_assigner_idx"
ON "examination_committee_assignments"("department_id", "assigned_by_user_id");

CREATE UNIQUE INDEX "exam_committee_assignment_active_seat_uq"
ON "examination_committee_assignments"(
  "department_id",
  "committee_id",
  "examination_id",
  "seat"
)
WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "exam_committee_assignment_active_user_uq"
ON "examination_committee_assignments"(
  "department_id",
  "committee_id",
  "examination_id",
  "assigned_user_id"
)
WHERE "status" = 'ACTIVE';

ALTER TABLE "examinations"
ADD CONSTRAINT "examination_code_nonempty_ck"
CHECK (btrim("code") <> '');

ALTER TABLE "examinations"
ADD CONSTRAINT "examination_category_code_nonempty_ck"
CHECK (btrim("category_code") <> '');

ALTER TABLE "examinations"
ADD CONSTRAINT "examination_rule_version_code_nonempty_ck"
CHECK (btrim("rule_version_code") <> '');

ALTER TABLE "examination_courses"
ADD CONSTRAINT "examination_course_positive_full_mark_ck"
CHECK ("summative_full_mark" > 0);

ALTER TABLE "examination_courses"
ADD CONSTRAINT "examination_course_summative_component_code_ck"
CHECK ("summative_component_code" = 'SUMMATIVE_EXAMINATION');

ALTER TABLE "examination_courses"
ADD CONSTRAINT "examination_course_rule_version_nonempty_ck"
CHECK (btrim("rule_version_code") <> '');

ALTER TABLE "examination_committee_assignments"
ADD CONSTRAINT "exam_committee_assignment_expiry_order_ck"
CHECK ("expires_at" IS NULL OR "expires_at" > "assigned_at");

ALTER TABLE "examination_committee_assignments"
ADD CONSTRAINT "exam_committee_assignment_unassigned_order_ck"
CHECK ("unassigned_at" IS NULL OR "unassigned_at" >= "assigned_at");

ALTER TABLE "examination_committee_assignments"
ADD CONSTRAINT "exam_committee_assignment_archived_order_ck"
CHECK ("archived_at" IS NULL OR "archived_at" >= "assigned_at");

ALTER TABLE "examination_committee_assignments"
ADD CONSTRAINT "exam_committee_assignment_lifecycle_ck"
CHECK (
  (
    "status" = 'ACTIVE'
    AND "unassigned_at" IS NULL
    AND "archived_at" IS NULL
  )
  OR (
    "status" = 'INACTIVE'
    AND "unassigned_at" IS NOT NULL
    AND "archived_at" IS NULL
  )
  OR (
    "status" = 'ARCHIVED'
    AND "archived_at" IS NOT NULL
  )
);

ALTER TABLE "examinations"
ADD CONSTRAINT "examination_department_fkey"
FOREIGN KEY ("department_id")
REFERENCES "departments"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examinations"
ADD CONSTRAINT "examination_program_identity_fkey"
FOREIGN KEY ("academic_program_id", "department_id")
REFERENCES "academic_programs"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examinations"
ADD CONSTRAINT "examination_session_identity_fkey"
FOREIGN KEY ("academic_session_id", "department_id")
REFERENCES "academic_sessions"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examinations"
ADD CONSTRAINT "examination_term_identity_fkey"
FOREIGN KEY ("academic_term_id", "department_id")
REFERENCES "academic_terms"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_courses"
ADD CONSTRAINT "examination_course_department_fkey"
FOREIGN KEY ("department_id")
REFERENCES "departments"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_courses"
ADD CONSTRAINT "examination_course_examination_scope_fkey"
FOREIGN KEY (
  "examination_id",
  "department_id",
  "academic_program_id",
  "academic_session_id",
  "academic_term_id"
)
REFERENCES "examinations"(
  "id",
  "department_id",
  "academic_program_id",
  "academic_session_id",
  "academic_term_id"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_courses"
ADD CONSTRAINT "examination_course_offering_identity_fkey"
FOREIGN KEY (
  "course_offering_id",
  "department_id",
  "academic_term_id",
  "curriculum_course_id",
  "syllabus_version_id"
)
REFERENCES "course_offerings"(
  "id",
  "department_id",
  "academic_term_id",
  "curriculum_course_id",
  "syllabus_version_id"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_courses"
ADD CONSTRAINT "examination_course_offering_batch_scope_fkey"
FOREIGN KEY (
  "course_offering_id",
  "department_id",
  "academic_term_id",
  "curriculum_course_id",
  "syllabus_version_id",
  "student_batch_id"
)
REFERENCES "course_offerings"(
  "id",
  "department_id",
  "academic_term_id",
  "curriculum_course_id",
  "syllabus_version_id",
  "student_batch_id"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_courses"
ADD CONSTRAINT "examination_course_student_batch_scope_fkey"
FOREIGN KEY (
  "student_batch_id",
  "department_id",
  "academic_program_id",
  "academic_session_id"
)
REFERENCES "student_batches"(
  "id",
  "department_id",
  "academic_program_id",
  "academic_session_id"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_courses"
ADD CONSTRAINT "examination_course_curriculum_version_fkey"
FOREIGN KEY ("curriculum_version_id", "department_id", "academic_program_id")
REFERENCES "curriculum_versions"("id", "department_id", "academic_program_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_courses"
ADD CONSTRAINT "examination_course_curriculum_course_fkey"
FOREIGN KEY (
  "curriculum_course_id",
  "department_id",
  "curriculum_version_id",
  "assessment_template_id"
)
REFERENCES "curriculum_courses"(
  "id",
  "department_id",
  "curriculum_version_id",
  "assessment_template_id"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_courses"
ADD CONSTRAINT "examination_course_syllabus_identity_fkey"
FOREIGN KEY ("syllabus_version_id", "department_id", "curriculum_course_id")
REFERENCES "syllabus_versions"("id", "department_id", "curriculum_course_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_courses"
ADD CONSTRAINT "examination_course_assessment_template_fkey"
FOREIGN KEY ("assessment_template_id", "department_id")
REFERENCES "course_assessment_templates"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_courses"
ADD CONSTRAINT "examination_course_summative_component_fkey"
FOREIGN KEY (
  "summative_assessment_component_id",
  "department_id",
  "assessment_template_id",
  "summative_component_code",
  "summative_full_mark"
)
REFERENCES "assessment_template_components"(
  "id",
  "department_id",
  "assessment_template_id",
  "code",
  "maximum_marks"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMENT ON COLUMN "examination_courses"."student_batch_id" IS
'Server-derived from CourseOffering.student_batch_id. Creation and any later offering batch binding must lock both records; NULL is allowed only while the offering is unbound, and later binding must atomically validate and populate this field or reject.';

COMMENT ON COLUMN "examination_courses"."summative_full_mark" IS
'Immutable snapshot constrained to the selected assessment template SUMMATIVE_EXAMINATION component maximum_marks. Later counted question configuration must total this snapshot.';

COMMENT ON TABLE "examination_committees" IS
'One stable committee container per Examination; appointment history is stored in examination_committee_assignments.';

COMMENT ON TABLE "examination_committee_assignments" IS
'Expired assignments provide no authority. Replacement must transactionally retire an expired ACTIVE row before inserting a new active occupant.';

ALTER TABLE "examination_committees"
ADD CONSTRAINT "examination_committee_department_fkey"
FOREIGN KEY ("department_id")
REFERENCES "departments"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_committees"
ADD CONSTRAINT "examination_committee_examination_identity_fkey"
FOREIGN KEY ("examination_id", "department_id")
REFERENCES "examinations"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_committee_assignments"
ADD CONSTRAINT "exam_committee_assignment_department_fkey"
FOREIGN KEY ("department_id")
REFERENCES "departments"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_committee_assignments"
ADD CONSTRAINT "exam_committee_assignment_examination_fkey"
FOREIGN KEY ("examination_id", "department_id")
REFERENCES "examinations"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_committee_assignments"
ADD CONSTRAINT "exam_committee_assignment_committee_fkey"
FOREIGN KEY ("committee_id", "department_id", "examination_id")
REFERENCES "examination_committees"("id", "department_id", "examination_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_committee_assignments"
ADD CONSTRAINT "exam_committee_assignment_user_fkey"
FOREIGN KEY ("assigned_user_id", "department_id")
REFERENCES "users"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "examination_committee_assignments"
ADD CONSTRAINT "exam_committee_assignment_assigner_fkey"
FOREIGN KEY ("assigned_by_user_id", "department_id")
REFERENCES "users"("id", "department_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;
