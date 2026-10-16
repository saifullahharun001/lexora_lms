'use strict';
// This entrypoint is reachable only from the reviewed disposable fresh runner.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { assertFreshDatabase } = require('./crc-fresh-safety.cjs');
(async () => {
  assert.deepEqual(process.argv.slice(2), []);
  assert.equal(process.env.LEXORA_CRC_HTTP_CONFIRM, 'YES_DISPOSABLE_HTTP_ACCEPTANCE');
  assert.equal(process.env.DATABASE_URL, process.env.LEXORA_CRC_FOUNDATION_DATABASE_URL);
  assert.equal(process.env.DATABASE_DIRECT_URL, process.env.LEXORA_CRC_FOUNDATION_DATABASE_URL);
  const db = new PrismaClient({ datasourceUrl: process.env.LEXORA_CRC_FOUNDATION_DATABASE_URL });
  try {
    await assertFreshDatabase(db);
    await require('./crc-synthetic-foundation.cjs').seedFresh(db);
    const fixture = '../dist/prisma/fixtures/';
    await require(fixture + 'course-composition-summative-preterminal.js').generateRealSummativePreterminal(db);
    await require(fixture + 'course-composition-formative-certified-activities.js').certifyAndFinaliseSyntheticActivities(db);
    await require(fixture + 'course-composition-formative-attendance.js').generateSyntheticAttendanceByRealServices(db);
    await require(fixture + 'course-composition-formative-comprehensive.js').createSyntheticComprehensiveThroughOwners(db);
    await require('./crc-http-acceptance.cjs').run(db);
    console.log('CRC_HTTP_AUTHENTICATED_OWNER_FLOW=PASS');
  } finally { await db.$disconnect(); }
})().catch(err => {
  // No stack/message/SQL/URL/HTTP response disclosure. Affected stage is retained
  // for offline review, and the parent runner owns disposal of the exact container.
  const frames = String(err?.stack || '').match(/(?:crc-http-[\w-]+|course-composition-[\w-]+)\.(?:c?js):\d+:\d+/g) || [];
  console.error('CRC_HTTP_OWNER=BLOCKED_OR_FAILED', err?.name || 'OTHER',
    'FRAMES=' + (frames.slice(0, 3).join('|') || 'NOT_FOUND'));
  process.exitCode = 1;
});
