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

test('forged department header preserves real principal ownership', () => {
  assert.match(
    source,
    /loadPrincipal\(userId\)/,
    'Principal must originate from the database loader',
  );

  assert.match(
    source,
    /principal\.activeDepartmentId === dept/,
    'Principal department must remain independently checked',
  );

  assert.match(
    source,
    /headerDepartment \?\? dept/,
    'Synthetic header override must remain explicit',
  );

  const start = source.indexOf("const forgedHeader = 'crc_fixture_unrelated_department'");
  const end = source.indexOf(
    "CRC_SECURITY_STAGE=boundary:FORGED_HEADER_OWNER_DENIAL_PASS",
    start,
  );

  assert.ok(start >= 0 && end > start);

  const negative = source.slice(start, end);

  assert.match(negative, /submitMemberReview\(foreign\.id/);
  assert.match(negative, /approveAndFinalLock\(foreign\.id\)/);
  assert.match(negative, /approveAndFinalLock\(calculated\.id\)/);

  assert.equal(
    (negative.match(/ForbiddenException/g) || []).length,
    3,
    'Three exact forbidden-duty/object assertions must be present',
  );

  assert.match(negative, /assert\.deepEqual\(\s*await counters\(db\),\s*base/);
  assert.match(negative, /await db\.auditLog\.count\(\)/);

  assert.match(
    source,
    /key === 'boundary' \? 'crc_fixture_unrelated_department' : undefined/,
    'Valid principal must be tested with a forged header',
  );

  assert.match(
    source,
    /FORGED_HEADER_VALID_PRINCIPAL_SUCCEEDED/,
  );

  assert.match(
    source,
    /assert\.deepEqual\(await counters\(db\), \[13, 6, 6, 6, 6\]\)/,
    'Normal owner workflow must retain the six-case terminal invariant',
  );

  assert.doesNotMatch(
    source,
    /(?:db|tx)\.(?:courseResultComposition|summativeChairmanApproval|summativeCommitteeMemberReview|auditLog)\.(?:create|upsert)\(/,
  );
});
