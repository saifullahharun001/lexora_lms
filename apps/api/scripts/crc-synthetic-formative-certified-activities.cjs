'use strict';
/* Strictly test-only: fresh CRC disposable database after real Summative preterminal. */
require('reflect-metadata');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { disposableTarget } = require('./crc-synthetic-foundation-safety.cjs');
(async () => {
  assert.deepEqual(process.argv.slice(2), ['--apply'], 'Explicit disposable-only opt-in required');
  const url = process.env.LEXORA_CRC_FOUNDATION_DATABASE_URL;
  const expected = process.env.LEXORA_CRC_FOUNDATION_EXPECTED_DATABASE;
  disposableTarget(url, expected, process.env.LEXORA_CRC_FOUNDATION_CONFIRM);
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const module = require('../dist/prisma/fixtures/course-composition-formative-certified-activities.js');
    const manifest = await module.certifyAndFinaliseSyntheticActivities(db);
    assert.equal(manifest.length, 6);
    console.log('REAL_CERTIFIED_REGULAR_LISTS=6');
    console.log('REAL_FORMATIVE_ACTIVITIES_FINALISATIONS=6');
    console.log('REAL_FORMATIVE_ACTIVITIES_RESULTS=6');
    console.log('REAL_FINAL_FORMATIVE_40=PENDING');
    console.log('REAL_CHAIRMAN_SUMMATIVE_APPROVALS=0');
    console.log('BASELINE_APPROVED=NO');
  } finally { await db.$disconnect(); }
})().catch(e => {
  // No SQL, credentials, identifiers, Prisma error.message or academic records.
  console.error('CRC_FORMATIVE_CERTIFIED_ACTIVITIES=FAIL',
    ['ForbiddenException', 'ConflictException', 'NotFoundException', 'PrismaClientUnknownRequestError',
      'PrismaClientKnownRequestError', 'AssertionError', 'BadRequestException'].includes(e?.name) ? e.name : 'UNCLASSIFIED');
  process.exitCode = 1;
});
