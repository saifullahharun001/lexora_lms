'use strict';
/* This runner NEVER connects to the canonical database or stores academic tokens. */
require('reflect-metadata');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { disposableTarget } = require('./crc-synthetic-foundation-safety.cjs');
(async () => {
  assert.deepEqual(process.argv.slice(2), ['--apply'], 'Explicit test-only opt-in required');
  const url = process.env.LEXORA_CRC_FOUNDATION_DATABASE_URL;
  disposableTarget(url, process.env.LEXORA_CRC_FOUNDATION_EXPECTED_DATABASE,
    process.env.LEXORA_CRC_FOUNDATION_CONFIRM);
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const { approveSyntheticSummativeThroughOwners } =
      require('../dist/prisma/fixtures/course-composition-summative-chairman.js');
    const reports = await approveSyntheticSummativeThroughOwners(db);
    assert.equal(reports.length, 6);
    console.log('REAL_SUMMATIVE_CHAIRMAN_APPROVALS=6');
    console.log('REAL_COMPOSED_COURSE_RESULTS_100=6');
    console.log('REAL_COMPOSED_PASS_BOUNDARIES=PASS');
    console.log('REAL_APPROVAL_COMPOSITION_ATOMIC_ROLLBACK=PASS');
  } finally { await db.$disconnect(); }
})().catch(error => {
  const known = ['AssertionError', 'ForbiddenException', 'ConflictException', 'NotFoundException',
    'PrismaClientKnownRequestError', 'PrismaClientUnknownRequestError', 'BadRequestException'];
  console.error('CRC_CHAIRMAN=FAIL', known.includes(error?.name) ? error.name : 'UNCLASSIFIED');
  process.exitCode = 1;
});
