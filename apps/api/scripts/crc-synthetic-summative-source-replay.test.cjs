'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../prisma/fixtures/course-composition-summative-chairman.ts'), 'utf8');

test('six authoritative aggregates use source-owner reconciliation; exact replay is EXISTING with stable ID and audit counts', () => {
  assert.match(source, /CRC_SOURCE_STAGE=\$\{key\}:EXACT_SOURCE_RECONCILIATION_REPLAY/);
  assert.match(source, /composition\.reconcileInTransaction\(tx,/);
  assert.match(source, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(source, /if \(replay\.status !== 'EXISTING'\)/);
  assert.match(source, /assert\.equal\(replay\.result\.id, composed\.id/);
  assert.match(source, /assert\.deepEqual\(await counters\(db\), beforeReplay/);
});
test('cross-department reconciliation fails closed with exact parent scope and no audit/terminal writes', () => {
  assert.match(source, /DENY_WRONG_DEPARTMENT_RECONCILIATION/);
  assert.match(source, /'crc_fixture_unrelated_department', id\.examinationId, id\.examinationCourseId, id\.enrollmentId/);
  assert.match(source, /await assert\.rejects\(db\.\$transaction/);
});
test('cross-offering enrollment is rejected by exact PostgreSQL P0002 parent gate, with unchanged protected counts', () => {
  assert.match(source, /DENY_MIXED_ENROLLMENT_SOURCE/);
  assert.match(source, /fixtureIds\('precision'\)/);
  assert.match(source, /composition\.inspectInTransaction\(tx,/);
  assert.match(source, /error instanceof Prisma\.PrismaClientKnownRequestError/);
  assert.match(source, /error\.code === 'P2010'/);
  assert.match(source, /\?\.code === 'P0002'/);
  assert.match(source, /Rejected mixed-enrollment projection cannot create an approval/);
  assert.doesNotMatch(source, /mixed\.status|Cross-candidate source substitution is not ready/);
  const migration = fs.readFileSync(path.join(__dirname, '../prisma/migrations/202610080001_authoritative_course_composition/migration.sql'), 'utf8');
  assert.match(migration, /FROM enrollments WHERE id=enrollment AND department_id=dept AND course_offering_id=ec\.course_offering_id/);
  assert.match(migration, /IF NOT FOUND THEN RAISE EXCEPTION 'Course-result context not found' USING ERRCODE='P0002'/);
});
test('database source matcher rejects forged calculated-mark reference using read-only SQL', () => {
  assert.match(source, /REJECT_FORGED_SOURCE_ID/);
  assert.match(source, /SELECT course_composition_sources\(/);
  assert.equal((source.match(/SELECT course_composition_matches\(/g) || []).length, 3);
  assert.match(source, /assert\.equal\(legitimate\?\.matches, true/);
  assert.match(source, /calculatedMarkId: 'crc_fixture_forged_calculated_mark'/);
  assert.match(source, /assert\.equal\(invalid\?\.matches, false/);
  assert.doesNotMatch(source, /(?:db|tx)\.(?:courseResultComposition|summativeCalculatedMark|formativeFinalResult|auditLog)\.(?:create|upsert)\(/);
});
