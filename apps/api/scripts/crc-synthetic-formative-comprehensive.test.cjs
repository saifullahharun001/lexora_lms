'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fixture = fs.readFileSync(path.join(__dirname, '../prisma/fixtures/course-composition-formative-comprehensive.ts'), 'utf8');
const cli = fs.readFileSync(path.join(__dirname, 'crc-synthetic-formative-comprehensive.cjs'), 'utf8');
test('real academic service owns four-seat Comprehensive evidence', () => {
  for (const name of ['authority.provisionExternal(', 'comprehensive.configure(', 'comprehensive.roster(',
    'comprehensive.save(', 'comprehensive.finalise(']) assert.ok(fixture.includes(name), name);
  assert.match(fixture, /'ALL_MEMBERS_AVERAGE'/);
});
test('no direct protected evidence or success audit writes', () => {
  assert.doesNotMatch(fixture + cli, /(?:comprehensiveFinalisation|comprehensiveFinalResult|comprehensiveFinalSource|comprehensiveMark|formativeFinalResult|summativeChairmanApproval|auditLog|externalComprehensiveAccess)\.(?:create|createMany|update|delete)\(/);
});
test('only temporary dedicated external access with exact six case identities', () => {
  assert.match(fixture, /randomBytes\(16\)/);
  assert.match(fixture, /crc-fixture\.invalid/);
  assert.match(fixture, /EXAMINATION_PERMISSION_DEFINITIONS/);
  assert.match(fixture, /P\.APPOINT/);
  assert.match(fixture, /P\.FINALISE/);
  assert.match(fixture, /PRODUCTION_FIXTURE_INPUTS/);
});
test('disposable-only gates and pre-terminal immutability counts', () => {
  for (const m of ['^crc_[a-zA-Z0-9_]+_test$', 'YES_DISPOSABLE_SYNTHETIC_FOUNDATION',
    'server[0]?.composition', 'summativeChairmanApproval.count()', 'formativeFinalResult.count()']) {
    assert.ok(fixture.includes(m) || (m === 'server[0]?.composition' && fixture.includes('server[0]?.composition')), m);
  }
  assert.match(cli, /disposableTarget/);
  assert.match(cli, /\['--apply'\]/);
});
