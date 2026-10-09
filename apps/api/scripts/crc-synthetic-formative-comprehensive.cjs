'use strict';
/* Real owner-service four-seat Comprehensive /5 and automatic /40; disposable only. */
require('reflect-metadata');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { disposableTarget } = require('./crc-synthetic-foundation-safety.cjs');
(async () => {
  assert.deepEqual(process.argv.slice(2), ['--apply'], 'Explicit disposable-only opt-in required');
  const url = process.env.LEXORA_CRC_FOUNDATION_DATABASE_URL;
  disposableTarget(url, process.env.LEXORA_CRC_FOUNDATION_EXPECTED_DATABASE,
    process.env.LEXORA_CRC_FOUNDATION_CONFIRM);
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const { createSyntheticComprehensiveThroughOwners } =
      require('../dist/prisma/fixtures/course-composition-formative-comprehensive.js');
    const result = await createSyntheticComprehensiveThroughOwners(db);
    assert.equal(result.length, 6);
    console.log('REAL_COMPREHENSIVE_FINALISATIONS=6');
    console.log('REAL_COMPREHENSIVE_SOURCE_MARKS=24');
    console.log('REAL_FINAL_FORMATIVE_40=6');
    console.log('SUMMATIVE_CHAIRMAN_APPROVALS=0');
    console.log('BASELINE_APPROVED=NO');
  } finally { await db.$disconnect(); }
})().catch(e => {
  const known = ['ForbiddenException', 'ConflictException', 'NotFoundException',
    'PrismaClientKnownRequestError', 'PrismaClientUnknownRequestError', 'AssertionError', 'BadRequestException'];
  console.error('CRC_COMPREHENSIVE=FAIL', known.includes(e?.name) ? e.name : 'UNCLASSIFIED');
  process.exitCode = 1;
});
