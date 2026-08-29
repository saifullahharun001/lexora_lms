import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const prismaRoot = join(process.cwd(), "prisma");
const schema = readFileSync(join(prismaRoot, "schema.prisma"), "utf8");
const foundationMigration = readFileSync(
  join(
    prismaRoot,
    "migrations",
    "202608280001_add_summative_examination_committee_foundation",
    "migration.sql",
  ),
);
const correctiveMigration = readFileSync(
  join(
    prismaRoot,
    "migrations",
    "202608290001_add_external_examination_committee_member",
    "migration.sql",
  ),
  "utf8",
);

function model(name: string) {
  return (
    schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ??
    ""
  );
}

const assignment = model("ExaminationCommitteeAssignment");

test("current schema represents three internal seats and one formal External Member seat", () => {
  assert.match(
    schema,
    /enum ExaminationCommitteeSeat \{[\s\S]*?CHAIRMAN[\s\S]*?MEMBER_1[\s\S]*?MEMBER_2[\s\S]*?EXTERNAL_MEMBER[\s\S]*?\}/,
  );
  assert.match(
    assignment,
    /assignedUserId\s+String\?\s+@map\("assigned_user_id"\)/,
  );
  assert.match(
    assignment,
    /externalMemberName\s+String\?\s+@map\("external_member_name"\) @db\.VarChar\(128\)/,
  );
  assert.match(
    assignment,
    /externalMemberAffiliation\s+String\?\s+@map\("external_member_affiliation"\) @db\.VarChar\(255\)/,
  );
  assert.match(
    assignment,
    /assignedUser\s+User\?\s+@relation\("ExaminationCommitteeAssignee"/,
  );
});

test("corrective migration adds the enum value before using it and preserves existing assignments", () => {
  assert.match(
    correctiveMigration,
    /ALTER TYPE "ExaminationCommitteeSeat"\s+ADD VALUE 'EXTERNAL_MEMBER';\s+\n\s*COMMIT;/,
  );
  assert.match(
    correctiveMigration,
    /ALTER COLUMN "assigned_user_id" DROP NOT NULL/,
  );
  assert.match(
    correctiveMigration,
    /ADD COLUMN "external_member_name" VARCHAR\(128\)/,
  );
  assert.match(
    correctiveMigration,
    /ADD COLUMN "external_member_affiliation" VARCHAR\(255\)/,
  );
  assert.doesNotMatch(
    correctiveMigration,
    /^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP TABLE|DROP COLUMN)\b/im,
  );
});

test("database shape check separates authenticated internal users from the formal External Member", () => {
  assert.match(
    correctiveMigration,
    /CONSTRAINT "exam_committee_assignment_member_shape_ck"[\s\S]*?"seat" IN \([\s\S]*?'CHAIRMAN'[\s\S]*?'MEMBER_1'[\s\S]*?'MEMBER_2'[\s\S]*?"assigned_user_id" IS NOT NULL[\s\S]*?"external_member_name" IS NULL[\s\S]*?"external_member_affiliation" IS NULL/,
  );
  assert.match(
    correctiveMigration,
    /"seat" = 'EXTERNAL_MEMBER'::"ExaminationCommitteeSeat"[\s\S]*?"assigned_user_id" IS NULL[\s\S]*?"external_member_name" IS NOT NULL[\s\S]*?btrim\("external_member_name"\) <> ''[\s\S]*?"external_member_affiliation" IS NOT NULL[\s\S]*?btrim\("external_member_affiliation"\) <> ''/,
  );
});

test("active-seat and active-user history indexes remain owned by the foundation migration", () => {
  const historical = foundationMigration.toString("utf8");
  assert.match(
    historical,
    /CREATE UNIQUE INDEX "exam_committee_assignment_active_seat_uq"[\s\S]*?WHERE "status" = 'ACTIVE';/,
  );
  assert.match(
    historical,
    /CREATE UNIQUE INDEX "exam_committee_assignment_active_user_uq"[\s\S]*?WHERE "status" = 'ACTIVE';/,
  );
  assert.doesNotMatch(correctiveMigration, /DROP\s+(?:INDEX|CONSTRAINT)/i);
});

test("the committed foundation migration remains byte-for-byte unchanged", () => {
  assert.equal(
    createHash("sha256").update(foundationMigration).digest("hex"),
    "d406d01c03c7bec36da9d2cac25fbb505a6a39a27a02f18239b78e3dc6ffd019",
  );
});

test("corrective migration is bounded and uses PostgreSQL-safe identifiers", () => {
  assert.equal(
    Array.from(correctiveMigration.matchAll(/ADD COLUMN "([^"]+)"/g)).length,
    2,
  );
  const identifiers = Array.from(
    correctiveMigration.matchAll(/(?:INDEX|CONSTRAINT) "([^"]+)"/g),
  ).map((match) => match[1]!);
  for (const identifier of identifiers) {
    assert.ok(
      Buffer.byteLength(identifier, "utf8") <= 63,
      `${identifier} exceeds PostgreSQL's identifier limit`,
    );
  }
  assert.doesNotMatch(
    correctiveMigration,
    /^\s*(?:GRANT|REVOKE|CREATE\s+TRIGGER)\b/im,
  );
});
