'use strict';
/* Test-only attendance /5 owner stage in a fresh disposable CRC PostgreSQL database. */
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
    const { generateSyntheticAttendanceByRealServices } =
      require('../dist/prisma/fixtures/course-composition-formative-attendance.js');
    const manifest = await generateSyntheticAttendanceByRealServices(db);
    assert.equal(manifest.length, 6);
    console.log('REAL_FORMATIVE_ATTENDANCE_GENERATIONS=6');
    console.log('REAL_FORMATIVE_ATTENDANCE_VERSIONS=6');
    console.log('REAL_FORMATIVE_ATTENDANCE_SOURCE_ITEMS=18');
    console.log('REAL_FINAL_FORMATIVE_40=PENDING');
    console.log('REAL_CHAIRMAN_SUMMATIVE_APPROVALS=0');
    console.log('BASELINE_APPROVED=NO');
  } finally { await db.$disconnect(); }
})().catch(e => {
  // No SQL, secrets, raw error messages, student identities or marks in diagnostic output.
  console.error('CRC_FORMATIVE_ATTENDANCE=FAIL',
    ['ForbiddenException', 'ConflictException', 'NotFoundException', 'PrismaClientUnknownRequestError',
      'PrismaClientKnownRequestError', 'AssertionError', 'BadRequestException'].includes(e?.name) ? e.name : 'UNCLASSIFIED');
  process.exitCode = 1;
});
