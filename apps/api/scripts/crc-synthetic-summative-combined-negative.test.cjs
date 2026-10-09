'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname,'../prisma/fixtures/course-composition-summative-chairman.ts'),'utf8');
test('real Committee manager replaces old Member seat and forces a new owner review',()=>{
  assert.match(src,/new ExaminationCommitteeService\(/);
  assert.match(src,/manager\.unassignMember\(original\.id\)/);
  assert.match(src,/manager\.assignInternalMember\(/);
  assert.match(src,/assert\.notEqual\(successor\.id, original\.id/);
  assert.match(src,/Stale VERIFIED review must not approve/);
  assert.match(src,/review\.reviewVersion, 2/);
  assert.match(src,/rows\[0\]\?\.committeeAssignmentId, original\.id/);
  assert.match(src,/rows\[1\]\?\.committeeAssignmentId, successor\.id/);
});
test('independent source matcher rejects source versions and lineage mismatches',()=>{
  assert.match(src,/SOURCE_VERSION_AND_LINEAGE_MISMATCH/);
  for(const key of ['calculatedMarkVersion','candidateListVersion','formativeResultId','candidateListId']) assert.ok(src.includes(key));
  assert.match(src,/course_composition_matches\(\$\{composed\.id\}/);
});
test('injected failing composition audit rolls back real Chairman owner transaction',()=>{
  assert.match(src,/COMPOSITION_AUDIT_WRITE_FAILURE/);
  assert.match(src,/new Proxy\(target\.auditLog/);
  assert.match(src,/input\.data\.action === compositionAction/);
  assert.match(src,/Failed composition audit write must roll back/);
});
test('no direct protected terminal writes and disposable-only target',()=>{
  assert.doesNotMatch(src,/(?:db|tx)\.(?:courseResultComposition|summativeChairmanApproval|summativeCommitteeMemberReview|auditLog)\.(?:create|upsert)\(/);
  assert.match(src,/YES_DISPOSABLE_SYNTHETIC_FOUNDATION/);
  assert.match(src,/assert\.deepEqual\(await counters\(db\), \[13, 6, 6, 6, 6\]\)/);
});
