'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../prisma/fixtures/course-composition-summative-chairman.ts'), 'utf8');

test('expired ACTIVE Member seat is denied after principal load; assignment restored', () => {
  assert.match(src, /CRC_APPOINTMENT_STAGE=summative_fail:DENY_EXPIRED_ACTIVE_MEMBER/);
  assert.match(src, /await asUser\(db, memberId, async/);
  assert.match(src, /appointment\.assignedAt\.getTime\(\) \+ 1/);
  assert.match(src, /data: \{ expiresAt: expired \}/);
  assert.match(src, /await assert\.rejects\(workflow\(db\)\.submitMemberReview/);
  assert.match(src, /data: \{ expiresAt: appointment\.expiresAt \}/);
  assert.match(src, /CRC_APPOINTMENT_STAGE=summative_fail:EXPIRED_MEMBER_RESTORED/);
});
test('INACTIVE Chairman seat fails closed and restores synthetic appointment in finally', () => {
  assert.match(src, /CRC_APPOINTMENT_STAGE=boundary:DENY_INACTIVE_CHAIRMAN/);
  assert.match(src, /await asUser\(db, chairmanId, async/);
  assert.match(src, /status: ExaminationCommitteeAssignmentStatus\.INACTIVE, unassignedAt: at/);
  assert.match(src, /await assert\.rejects\(workflow\(db\)\.approveAndFinalLock/);
  assert.match(src, /status: appointment\.status, unassignedAt: appointment\.unassignedAt/);
  assert.match(src, /CRC_APPOINTMENT_STAGE=boundary:CHAIRMAN_APPOINTMENT_RESTORED/);
});
test('no direct protected writes, all terminal effects remain owner-service managed', () => {
  assert.doesNotMatch(src, /(?:db|tx)\.(?:courseResultComposition|summativeChairmanApproval|summativeCommitteeMemberReview|auditLog)\.(?:create|upsert)\(/);
  assert.match(src, /assert\.deepEqual\(await counters\(db\), before/);
  assert.equal((src.match(/finally \{/g)||[]).length >= 2, true);
  assert.match(src, /YES_DISPOSABLE_SYNTHETIC_FOUNDATION/);
});
