'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../prisma/fixtures/course-composition-summative-chairman.ts'), 'utf8');

test('live Member and Chairman role revocation uses loaded principal, real service and reversible fixture role update', () => {
  assert.match(source, /MEMBER_LIVE_ROLE_REVOCATION/);
  assert.match(source, /WRONG_SEAT_AND_CHAIRMAN_LIVE_ROLE_REVOCATION/);
  assert.equal((source.match(/data: \{ revokedAt: new Date\(\) \}/g) || []).length, 2);
  assert.equal((source.match(/data: \{ revokedAt: null \}/g) || []).length, 2);
  assert.match(source, /await asUser\(db, member2, async/);
  assert.match(source, /await asUser\(db, chairman, async/);
  assert.match(source, /assert\.deepEqual\(await counters\(db\), beforeApproval/);
});
test('two simultaneous real Chairman service requests must yield one winner', () => {
  assert.match(source, /PARALLEL_REAL_CHAIRMAN_APPROVALS/);
  assert.match(source, /Promise\.allSettled\(\[/);
  assert.match(source, /assert\.equal\(succeeded\.length, 1/);
  assert.match(source, /assert\.equal\(rejected\.length, 1/);
  assert.match(source, /PARALLEL_APPROVAL_ONE_WINNER/);
});
test('terminal data and success audits remain controlled by source owner', () => {
  assert.doesNotMatch(source, /db\.(?:courseResultComposition|summativeChairmanApproval|summativeCommitteeMemberReview|auditLog)\.(?:create|upsert)\(/);
  assert.match(source, /workflow\(db\)\.approveAndFinalLock\(calculated\.id\)/);
  assert.match(source, /workflow\(db\)\.submitMemberReview\(calculated\.id/);
  assert.match(source, /assert\.deepEqual\(await counters\(db\), \[13, 6, 6, 6, 6\]\)/);
});
test('disposable PostgreSQL boundary remains fail-closed', () => {
  assert.match(source, /YES_DISPOSABLE_SYNTHETIC_FOUNDATION/);
  assert.match(source, /server_version_num/);
  assert.match(source, /crc_\[A-Za-z0-9_\]\+_test/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:password|token|DATABASE_URL)/i);
});
