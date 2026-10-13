'use strict';
require('reflect-metadata');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { assertFreshDatabase } = require('./crc-fresh-safety.cjs');
(async () => {
  const [order] = process.argv.slice(2);
  assert.equal(process.argv.length, 3);
  assert.ok(['formative-first', 'summative-first'].includes(order));
  const db = new PrismaClient({ datasourceUrl: process.env.LEXORA_CRC_FOUNDATION_DATABASE_URL });
  try {
    await assertFreshDatabase(db);
    await require('./crc-synthetic-foundation.cjs').seedFresh(db);
    await require('../dist/prisma/fixtures/course-composition-fresh-campaign.js').runFreshOwnerCampaign(db, order);
  } finally { await db.$disconnect(); }
})().catch(error => {
  // Do not emit Prisma arguments, generated credentials or source records.
  const frames = String(error?.stack ?? '').match(
    /(?:course-composition-[A-Za-z0-9-]+|crc-fresh-owner)\.js:\d+:\d+/g
  ) ?? [];
  console.error(
    'CRC_FRESH_OWNER=FAIL',
    error?.name,
    error?.code ?? '',
    'FRAMES=' + (frames.slice(0, 3).join(' | ') || 'NOT_FOUND')
  );
  process.exitCode = 1;
});
