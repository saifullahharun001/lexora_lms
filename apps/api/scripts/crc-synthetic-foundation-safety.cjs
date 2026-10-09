'use strict';
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');

function disposableTarget(raw, expected, confirmation) {
  if (!raw || !expected || confirmation !== 'YES_DISPOSABLE_SYNTHETIC_FOUNDATION')
    throw Error('Explicit disposable opt-in required');
  let url;
  try { url = new URL(raw); } catch { throw Error('Invalid disposable connection identity'); }
  let name;
  try { name = decodeURIComponent(url.pathname.slice(1)); } catch { throw Error('Invalid disposable database identity'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !/^crc_[a-zA-Z0-9_]*_test$/.test(name) || name !== expected ||
    url.hash || [...url.searchParams.keys()].some(k => k !== 'schema') ||
    url.searchParams.getAll('schema').length > 1 ||
    (url.searchParams.get('schema') || 'public') !== 'public')
    throw Error('Only explicit CRC loopback test database is allowed');
  return name;
}
function sha(v) { return createHash('sha256').update(v).digest('hex'); }
function assertHistory(assert, history, baselineSource, migrationsRoot) {
  const names = /export const PRE_COMPOSITION_MIGRATIONS\s*=\s*\[([\s\S]*?)\] as const/.exec(baselineSource);
  assert.ok(names, 'Original migration manifest missing');
  const expected = [...names[1].matchAll(/"([A-Za-z0-9_]+)"/g)].map(m => m[1]);
  assert.equal(expected.length, 41);
  assert.equal(history.length, 43);
  const extras = { '202608210001_add_course_offering_student_batch_binding_foundation': 1,
    '202609020001_fix_summative_third_referral_integrity_trigger': 1 };
  for (const row of history) {
    assert.ok(expected.includes(row.name), 'Unknown historical migration');
    if (row.finished && !row.rolled_back) {
      const migration = readFileSync(path.join(migrationsRoot, row.name, 'migration.sql'), 'utf8');
      const lf = migration.replace(/\r\n/g, '\n');
      assert.ok(new Set([sha(migration), sha(lf), sha(lf.replace(/\n/g, '\r\n'))]).has(row.checksum),
        'Migration history checksum mismatch');
    } else {
      assert.ok(row.rolled_back && !row.finished && extras[row.name] > 0,
        'Unknown or unresolved migration attempt');
      extras[row.name]--;
    }
  }
  for (const name of expected)
    assert.equal(history.filter(r => r.name === name && r.finished && !r.rolled_back).length, 1,
      'A migration must be applied exactly once');
  assert.deepEqual(Object.values(extras), [0, 0]);
  return { applied: expected.length, rolledBack: 2 };
}
module.exports = { disposableTarget, assertHistory };
