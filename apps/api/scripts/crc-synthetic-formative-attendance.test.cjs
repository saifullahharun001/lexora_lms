'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../prisma/fixtures/course-composition-formative-attendance.ts');
const code = fs.readFileSync(root, 'utf8');
const cli = fs.readFileSync(path.join(__dirname, 'crc-synthetic-formative-attendance.cjs'), 'utf8');
test('real teacher lifecycle owns every conducted Attendance session and record', () => {
  for (const call of ['classSessions.create(', 'classSessions.activate(', 'capture.captureAttendance(', 'classSessions.complete('])
    assert.ok(code.includes(call), `Missing real owner operation ${call}`);
});
test('real authorised Chairman generation; no protected or audit insertion', () => {
  assert.match(code, /generation\.generate\(ids\.examinationId\)/);
  assert.match(code, /new AttendanceMarkGenerationAuthorizerService/);
  assert.doesNotMatch(code + cli, /(?:formativeAttendanceGeneration|formativeAttendanceVersion|formativeAttendanceSourceItem|formativeFinalResult|summativeChairmanApproval|auditLog)\.(?:create|createMany|update|delete)\(/);
});
test('all six attendance recipes derive exact source-feasible mark bands', () => {
  const recipe = [...code.matchAll(/(?:boundary|formative_fail|summative_fail|precision|zero|maximum): \{ conducted: (\d+), present: (\d+), mark: '(\d+)' \}/g)];
  assert.equal(recipe.length, 6);
  for (const [, total, attended, mark] of recipe) {
    const percent = Number(attended) * 100 / Number(total);
    const expected = percent >= 90 ? 5 : percent >= 85 ? 4.5 : percent >= 80 ? 4 : percent >= 75 ? 3.5 : percent >= 70 ? 3 : percent >= 65 ? 2.5 : percent >= 60 ? 2 : 0;
    assert.equal(Number(mark), expected);
  }
});
test('disposable database identity, no terminal records, and strict cli opt-in', () => {
  for (const marker of ['^crc_[a-zA-Z0-9_]+_test$', 'YES_DISPOSABLE_SYNTHETIC_FOUNDATION', 'actual[0]?.version', 'actual[0]?.composition', 'formativeFinalResult.count()', 'summativeChairmanApproval.count()'])
    assert.ok(code.includes(marker) || code.includes(marker.replaceAll('?', '')) || (marker.startsWith('^crc_') && code.includes('^crc_[a-zA-Z0-9_]+_test$')), `Missing ${marker}`);
  assert.match(cli, /disposableTarget/);
  assert.match(cli, /\['--apply'\]/);
});
