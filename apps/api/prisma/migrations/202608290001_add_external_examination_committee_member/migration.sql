BEGIN;

ALTER TYPE "ExaminationCommitteeSeat"
ADD VALUE 'EXTERNAL_MEMBER';

COMMIT;

BEGIN;

ALTER TABLE "examination_committee_assignments"
ALTER COLUMN "assigned_user_id" DROP NOT NULL,
ADD COLUMN "external_member_name" VARCHAR(128),
ADD COLUMN "external_member_affiliation" VARCHAR(255);

ALTER TABLE "examination_committee_assignments"
ADD CONSTRAINT "exam_committee_assignment_member_shape_ck"
CHECK (
  (
    "seat" IN (
      'CHAIRMAN'::"ExaminationCommitteeSeat",
      'MEMBER_1'::"ExaminationCommitteeSeat",
      'MEMBER_2'::"ExaminationCommitteeSeat"
    )
    AND "assigned_user_id" IS NOT NULL
    AND "external_member_name" IS NULL
    AND "external_member_affiliation" IS NULL
  )
  OR (
    "seat" = 'EXTERNAL_MEMBER'::"ExaminationCommitteeSeat"
    AND "assigned_user_id" IS NULL
    AND "external_member_name" IS NOT NULL
    AND btrim("external_member_name") <> ''
    AND "external_member_affiliation" IS NOT NULL
    AND btrim("external_member_affiliation") <> ''
  )
);

COMMENT ON COLUMN "examination_committee_assignments"."external_member_name" IS
'Formal External Member name. This appointment does not create a Lexora user or grant digital committee authority.';

COMMENT ON COLUMN "examination_committee_assignments"."external_member_affiliation" IS
'Formal External Member public-university affiliation.';

COMMIT;
