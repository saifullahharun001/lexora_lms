'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../prisma/fixtures/course-composition-summative-chairman.ts'), 'utf8');
const runner = fs.readFileSync(path.join(__dirname, 'crc-synthetic-summative-chairman.cjs'), 'utf8');

test('only exact synthetic committee Teacher role receives two distinct department-scoped grants', () => {
  assert.match(source, /MEMBER_REVIEW_DEPARTMENT/);
  assert.match(source, /CHAIRMAN_APPROVAL_DEPARTMENT/);
  assert.match(source, /crc_fixture_teacher_role/);
  assert.match(source, /PermissionScope\.DEPARTMENT/);
  assert.doesNotMatch(source, /\bALL\b|\bwildcard\b|scope:\s*['"]ANY['"]/);
});
test('real owner methods and independently resolved calculated mark identity', () => {
  assert.match(source, /new SummativeCommitteeWorkflowService\(/);
  assert.match(source, /new SummativeCommitteeWorkflowAuthorizerService\(/);
  assert.match(source, /new SummativeCalculatedMarkService\(/);
  assert.match(source, /submitMemberReview\(calculated\.id/);
  assert.match(source, /approveAndFinalLock\(calculated\.id\)/);
  assert.match(source, /db\.summativeCalculatedMark\.findMany/);
  assert.doesNotMatch(source, /fixtureIds\(key\)\.calculatedMarkId/);
  assert.doesNotMatch(source, /db\.(summativeChairmanApproval|summativeCommitteeMemberReview|courseResultComposition|auditLog)\.create\(/);
});
test('no-approval gate, incomplete Member gate, terminal rollback and actual six-case exact /100 matrix', () => {
  assert.match(source, /DENY_WITHOUT_REVIEWS/);
  assert.match(source, /DENY_INCOMPLETE_REVIEW/);
  assert.match(source, /ATOMIC_ROLLBACK_PROBE/);
  assert.match(source, /REAL_FINAL_LOCK_AUTO_100/);
  assert.match(source, /DENY_DUPLICATE_APPROVAL/);
  assert.match(source, /scenario\.formativePassed && scenario\.summativePassed/);
  assert.match(source, /assert\.deepEqual\(await counters\(db\), \[13, 6, 6, 6, 6\]\)/);
});
test('explicit disposable-only database identity and no raw secrets or unauthorized writes', () => {
  assert.match(source, /current_database\(\)/);
  assert.match(source, /server_version_num/);
  assert.match(source, /YES_DISPOSABLE_SYNTHETIC_FOUNDATION/);
  assert.match(runner, /disposableTarget\(/);
  assert.match(runner, /assert\.deepEqual\(process\.argv\.slice\(2\), \['--apply'\]/);
  assert.doesNotMatch(runner, /console\.log\(.*(?:url|password|token|hash|provenance)/i);
});
