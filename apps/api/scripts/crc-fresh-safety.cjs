'use strict';
const assert = require('node:assert/strict');
const { disposableTarget } = require('./crc-synthetic-foundation-safety.cjs');
async function assertFreshDatabase(db, env = process.env) {
  const name = disposableTarget(env.LEXORA_CRC_FOUNDATION_DATABASE_URL,
    env.LEXORA_CRC_FOUNDATION_EXPECTED_DATABASE, env.LEXORA_CRC_FOUNDATION_CONFIRM);
  assert.match(name, /^crc_[a-f0-9]{32}_test$/);
  assert.match(env.LEXORA_CRC_FRESH_RUN_ID ?? '', /^[a-f0-9]{32}$/);
  assert.equal(name, 'crc_' + env.LEXORA_CRC_FRESH_RUN_ID + '_test');
  const [row] = await db.$queryRawUnsafe(
    "SELECT current_database() AS name, current_setting('server_version_num') AS version, " +
    "shobj_description(oid,'pg_database') AS marker, " +
    "to_regclass('public._prisma_migrations')::text AS ledger, " +
    "(SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname=current_user) AS elevated " +
    "FROM pg_database WHERE datname=current_database()");
  assert.equal(row?.name, name);
  assert.equal(row?.version, '180006');
  assert.equal(row?.marker, 'LEXORA_CRC_FRESH:' + env.LEXORA_CRC_FRESH_RUN_ID);
  assert.equal(row?.ledger, null, 'Fresh schema must not fabricate historical migration records');
  assert.equal(row?.elevated, false, 'Owner-service campaign must use restricted app role');
  return name;
}
module.exports = { assertFreshDatabase };
