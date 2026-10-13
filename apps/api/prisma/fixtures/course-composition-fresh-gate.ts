import { PrismaClient } from '@prisma/client';
import path from 'node:path';

/** Additional opt-in for current-schema synthetic runs; never approves a baseline. */
export async function isFreshSynthetic(db: PrismaClient): Promise<boolean> {
  if (!process.env.LEXORA_CRC_FRESH_RUN_ID) return false;
  const { assertFreshDatabase } = require(path.join(process.cwd(), 'scripts/crc-fresh-safety.cjs')) as {
    assertFreshDatabase(db: PrismaClient): Promise<string>;
  };
  await assertFreshDatabase(db);
  return true;
}
