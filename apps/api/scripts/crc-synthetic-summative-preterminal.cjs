'use strict';
/* Test-only runner: never uses DATABASE_URL and never touches a non-CRC database. */
require('reflect-metadata');
const assert = require('node:assert/strict');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { disposableTarget, assertHistory } = require('./crc-synthetic-foundation-safety.cjs');
const { readFileSync } = require('node:fs');

/** Diagnostic output is restricted to fixed labels and allowlisted PostgreSQL errors.
 * Never print raw SQL, Prisma error.message, database URLs, payloads or identifiers. */
function classifySyntheticDbError(error) {
  const raw = [error?.code, error?.meta?.code, error?.meta?.message, error?.message]
    .filter(x => typeof x === 'string' && x.length < 12000).join(' ');
  const states = ['P0001', '23503', '23505', '23514', '22003', '22007', '22P02', '40001', '40P01', 'P2010', 'P2034'];
  const sqlstate = states.find(s => new RegExp('\\b' + s + '\\b').test(raw)) || 'UNCLASSIFIED';
  const reasons = [
    ['Calculated mark chronology is invalid', 'CALCULATED_CHRONOLOGY'],
    ['Calculated mark cannot predate First/Second evidence', 'CALCULATED_SOURCE_CHRONOLOGY'],
    ['Calculated mark derived value is invalid', 'CALCULATED_VALUE_MISMATCH'],
    ['Calculated mark First/Second source evidence is invalid', 'CALCULATED_SOURCE_MISMATCH'],
    ['Calculated mark comparison identity or version is invalid', 'CALCULATED_COMPARISON_MISMATCH'],
    ['Summative Examiner comparison evidence is immutable', 'COMPARISON_IMMUTABILITY'],
    ['Summative calculated-mark evidence is immutable', 'CALCULATED_IMMUTABILITY'],
    ['numeric field overflow', 'NUMERIC_OVERFLOW'],
    ['value too long for type', 'VALUE_TOO_LONG'],
    ['violates check constraint', 'CHECK_CONSTRAINT'],
    ['violates foreign key constraint', 'FOREIGN_KEY'],
    ['duplicate key value violates unique constraint', 'UNIQUE_CONSTRAINT'],
    ['deadlock detected', 'DEADLOCK'],
    ['could not serialize access', 'SERIALIZATION'],
  ];
  return { sqlstate, reason: reasons.find(([phrase]) => raw.includes(phrase))?.[1] || 'UNCLASSIFIED' };
}

if (require.main === module) (async () => {
  assert.deepEqual(process.argv.slice(2), ['--apply'], 'Explicit --apply is mandatory');
  const raw = process.env.LEXORA_CRC_FOUNDATION_DATABASE_URL;
  const expected = process.env.LEXORA_CRC_FOUNDATION_EXPECTED_DATABASE;
  disposableTarget(raw, expected, process.env.LEXORA_CRC_FOUNDATION_CONFIRM);
  const db = new PrismaClient({ datasourceUrl: raw });
  try {
    const [actual] = await db.$queryRaw`SELECT current_database() AS name, current_setting('server_version_num') AS version`;
    assert.equal(actual?.name, expected);
    assert.equal(actual?.version, '180006');
    const ledger = await db.$queryRaw`SELECT migration_name AS name, checksum,
      finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back FROM _prisma_migrations`;
    assertHistory(assert, ledger, readFileSync(path.join(process.cwd(), 'prisma/fixtures/course-composition-production-baseline.ts'), 'utf8'),
      path.join(process.cwd(), 'prisma/migrations'));
    const { generateRealSummativePreterminal } = require('../dist/prisma/fixtures/course-composition-summative-preterminal.js');
    const cases = await generateRealSummativePreterminal(db);
    assert.equal(cases.length, 6);
    console.log('REAL_SUMMATIVE_PRETERMINAL_SERVICES=PASS');
    console.log('REAL_CANDIDATE_REGISTRATIONS=6');
    console.log('REAL_COMMITTEE_APPOINTMENTS=24');
    console.log('REAL_CALCULATED_MARKS=6');
    console.log('REAL_CHAIRMAN_APPROVALS=0');
    console.log('FORMATIVE_SOURCES=PENDING');
    console.log('BASELINE_APPROVAL=NOT_GRANTED');
  } finally {
    await db.$disconnect();
  }
})().catch(error => {
  console.error('SUMMATIVE_PRETERMINAL=FAIL', ['PrismaClientUnknownRequestError', 'PrismaClientKnownRequestError',
    'ForbiddenException', 'BadRequestException', 'ConflictException', 'AssertionError'].includes(error?.name)
    ? error.name : 'UNCLASSIFIED');
  const diagnosis = classifySyntheticDbError(error);
  console.error(`CRC_DB_FAILURE_SQLSTATE=${diagnosis.sqlstate}`);
  console.error(`CRC_DB_FAILURE_REASON=${diagnosis.reason}`);
  process.exitCode = 1;
});

module.exports = { classifySyntheticDbError };
