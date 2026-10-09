'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { disposableTarget, assertHistory } = require('./crc-synthetic-foundation-safety.cjs');
const cwd = path.resolve(__dirname, '..');
const source = readFileSync(path.join(cwd,'prisma/fixtures/course-composition-production-baseline.ts'), 'utf8');
const mig = path.join(cwd,'prisma/migrations');
const names = [...(/export const PRE_COMPOSITION_MIGRATIONS\s*=\s*\[([\s\S]*?)\] as const/.exec(source))[1]
  .matchAll(/"([A-Za-z0-9_]+)"/g)].map(m => m[1]);
const sha = txt => createHash('sha256').update(txt).digest('hex');
function rows() {
  return [...names.map(name => ({ name,
    checksum: sha(readFileSync(path.join(mig,name,'migration.sql'))),
    finished: true, rolled_back: false })),
    { name: '202608210001_add_course_offering_student_batch_binding_foundation',
      checksum: 'historical-rollback', finished: false, rolled_back: true },
    { name: '202609020001_fix_summative_third_referral_integrity_trigger',
      checksum: 'historical-rollback', finished: false, rolled_back: true }];
}
const raw = 'postgresql://fixture@127.0.0.1:55432/crc_foundation_test?schema=public';
const pass = 'YES_DISPOSABLE_SYNTHETIC_FOUNDATION';
test('allows only explicitly named CRC localhost test infrastructure', () => {
  assert.equal(disposableTarget(raw, 'crc_foundation_test', pass), 'crc_foundation_test');
  const bad = [raw.replace('127.0.0.1','192.168.0.7'), raw.replace('crc_foundation_test','lexora_lms'),
    raw.replace('crc_foundation_test','other_test'), raw+'&host=remote.example',
    raw.replace('schema=public','schema=other'), raw.replace('postgresql:','file:'),
    raw.replace('127.0.0.1:55432','127.0.0.1:55432@remote.invalid:5432')];
  for (const u of bad) assert.throws(() => disposableTarget(u,'crc_foundation_test',pass));
  assert.throws(() => disposableTarget(raw,'crc_other_test',pass));
  assert.throws(() => disposableTarget(raw,'crc_foundation_test','YES'));
});
test('41 source checksums plus two exact historical rollbacks are accepted', () => {
  assert.deepEqual(assertHistory(assert, rows(), source, mig), {applied: 41, rolledBack: 2});
});
test('LF/CRLF checksum equivalence is accepted; not arbitrary edited bytes', () => {
  const r = rows();
  const name = names[0];
  const txt = readFileSync(path.join(mig,name,'migration.sql'),'utf8');
  r[0].checksum = sha(txt.replace(/\r\n/g,'\n').replace(/\n/g,'\r\n'));
  assert.doesNotThrow(() => assertHistory(assert,r,source,mig));
  r[0].checksum = sha(txt+'UNAUTHORIZED EDIT');
  assert.throws(() => assertHistory(assert,r,source,mig));
});
test('unresolved rollback, additional names, duplicate applied and missing rows fail closed', () => {
  const bad = [
    r => { r[41].rolled_back=false; },
    r => { r[41].name='crc_unknown_migration'; },
    r => { r[41].finished=true; r[41].rolled_back=false; r[41].checksum=r[15].checksum; },
    r => { r.pop(); },
    r => { r[0].finished=false; r[0].rolled_back=false; },
  ];
  for (const modify of bad) { const r=rows(); modify(r); assert.throws(() => assertHistory(assert,r,source,mig)); }
});
