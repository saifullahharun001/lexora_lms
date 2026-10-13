'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { split, extractFunctionBody, buildOverlay } = require('./crc-fresh-sql.cjs');
const { cleanEnvironment, ownedContainer } = require('./crc-fresh-runtime.cjs');
const { assertFreshDatabase } = require('./crc-fresh-safety.cjs');
const api = path.resolve(__dirname, '..');
let overlay, prismaSQL;
before(() => {
  const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff',
    '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'],
  { cwd: api, env: cleanEnvironment(process.env), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  prismaSQL = result.stdout;
  overlay = buildOverlay(api, prismaSQL);
});
test('SQL tokenizer preserves function bodies, comments, quoted separators and nested checks', () => {
  assert.deepEqual(split("SELECT ';'; /* ; /* nested */ */ SELECT 'it''s'; -- ;\n DO $tag$ BEGIN RAISE NOTICE ';'; END $tag$;"),
    ["SELECT ';'", "SELECT 'it''s'", "DO $tag$ BEGIN RAISE NOTICE ';'; END $tag$"]);
  assert.deepEqual(split("a numeric(6,2), CHECK (a IN (1,2)), b text", ','), ['a numeric(6,2)', 'CHECK (a IN (1,2))', 'b text']);
  for (const broken of ["SELECT 'oops", 'DO $$ BEGIN', 'SELECT (1', '/* unfinished']) assert.throws(() => split(broken));
});
test('function extraction preserves exact ordinary and named dollar-quoted bodies', () => {
  const ordinary = "\nBEGIN\n  RETURN '$1 and $other$ are body text';\nEND;\n";
  const named = "\r\nBEGIN\r\n  -- $$ and $different$ are body text.\r\n  RETURN $$inner literal with $1$$;\r\nEND;\r\n";
  assert.equal(extractFunctionBody('CREATE FUNCTION f() RETURNS text AS $$' + ordinary + '$$ LANGUAGE plpgsql;'), ordinary);
  assert.equal(extractFunctionBody(
    "CREATE FUNCTION f(p text DEFAULT $default$AS $$decoy$$$default$, q text DEFAULT 'AS $$quoted$$') " +
    'RETURNS text LANGUAGE plpgsql AS /* outside comment */ $Body_1$' + named + '$Body_1$;'), named);
  for (const malformed of [
    'CREATE FUNCTION f() RETURNS text AS $body$SELECT 1;$$;',
    'CREATE FUNCTION f() RETURNS text AS $$SELECT 1;',
    "CREATE FUNCTION f() RETURNS text AS 'SELECT 1';",
  ]) assert.throws(() => extractFunctionBody(malformed));
});
test('fresh compiler retains final invariant definitions and excludes historical data/ledger actions', () => {
  assert.equal(overlay.functions.length, 99);
  assert.equal(overlay.triggers.length, 105);
  assert.equal(overlay.checks.length, 125);
  assert.equal(overlay.extraIndexes.length, 18);
  assert.equal(overlay.extraConstraints.length, 11);
  assert.match(overlay.sql, /CREATE SEQUENCE attendance_evidence_revision_seq/);
  assert.match(overlay.sql, /crc_package_validate[\s\S]*DEFERRABLE INITIALLY DEFERRED/);
  assert.match(overlay.sql, /ff_package_validate[\s\S]*DEFERRABLE INITIALLY DEFERRED/);
  assert.match(overlay.sql, /formative_mark_values_check/);
  assert.match(overlay.sql, /exam_committee_assignment_active_seat_uq/);
  assert.doesNotMatch(overlay.sql, /_prisma_migrations|DISABLE TRIGGER|session_replication_role|DROP TABLE/);
  const chronology = fs.readFileSync(path.join(api, 'prisma/migrations/202610090001_correct_summative_timestamp3_chronology/migration.sql'), 'utf8');
  for (const fn of split(chronology).filter(s => s.startsWith('CREATE OR REPLACE FUNCTION'))) {
    assert.ok(overlay.sql.includes(fn));
    const name = /^CREATE OR REPLACE FUNCTION "([^"]+)"/.exec(fn)[1];
    const delimiter = '$body$';
    const opening = fn.indexOf(delimiter), closing = fn.lastIndexOf(delimiter);
    assert.ok(opening >= 0 && closing > opening);
    const expectedBody = fn.slice(opening + delimiter.length, closing);
    assert.ok(expectedBody.includes('BEGIN') && expectedBody.includes('END;'));
    assert.equal(overlay.functionBodies.find(entry => entry.name === name)?.body, expectedBody);
  }
  assert.equal(overlay.triggers.filter(t => t.name === 'attendance_correction_insert').length, 1);
});
test('inherited canonical and PostgreSQL settings are removed from all child processes', () => {
  const env = cleanEnvironment({ PATH: 'safe', DATABASE_URL: 'secret', DATABASE_DIRECT_URL: 'secret',
    PGHOST: 'remote', PGSERVICE: 'production', LEXORA_CRC_PRODUCTION_CONFIRM: 'yes', NODE_OPTIONS: '--require evil', POSTGRES_PASSWORD: 'secret' });
  assert.equal(env.PATH, 'safe');
  for (const key of ['PGHOST','PGSERVICE','LEXORA_CRC_PRODUCTION_CONFIRM','NODE_OPTIONS','POSTGRES_PASSWORD']) assert.equal(env[key], undefined);
  assert.match(env.DATABASE_URL, /127\.0\.0\.1:1\/crc_offline_test/);
});
const nonce = 'a'.repeat(32);
const env = {
  LEXORA_CRC_FRESH_RUN_ID: nonce, LEXORA_CRC_FOUNDATION_EXPECTED_DATABASE: 'crc_' + nonce + '_test',
  LEXORA_CRC_FOUNDATION_DATABASE_URL: 'postgresql://crc_app:temporary@127.0.0.1:12345/crc_' + nonce + '_test?schema=public',
  LEXORA_CRC_FOUNDATION_CONFIRM: 'YES_DISPOSABLE_SYNTHETIC_FOUNDATION',
};
const identity = { name: env.LEXORA_CRC_FOUNDATION_EXPECTED_DATABASE, version: '180006',
  marker: 'LEXORA_CRC_FRESH:' + nonce, ledger: null, elevated: false };
test('fresh database gate verifies actual identity, exact engine, marker, ledger absence and role restrictions', async () => {
  const db = row => ({ $queryRawUnsafe: async () => [row] });
  await assertFreshDatabase(db(identity), env);
  for (const change of [{ name: 'lexora_lms' }, { version: '180005' }, { marker: 'approved-baseline' },
    { ledger: '_prisma_migrations' }, { elevated: true }]) await assert.rejects(assertFreshDatabase(db({ ...identity, ...change }), env));
  for (const change of [{ LEXORA_CRC_FOUNDATION_CONFIRM: '' }, { LEXORA_CRC_FRESH_RUN_ID: 'b'.repeat(32) },
    { LEXORA_CRC_FOUNDATION_DATABASE_URL: env.LEXORA_CRC_FOUNDATION_DATABASE_URL.replace('127.0.0.1', 'remote') },
    { LEXORA_CRC_FOUNDATION_DATABASE_URL: env.LEXORA_CRC_FOUNDATION_DATABASE_URL + '&host=remote' }])
    await assert.rejects(assertFreshDatabase(db(identity), { ...env, ...change }));
});
test('container cleanup rejects wrong identity, label, image, exposure and persistent data configuration', () => {
  const id = 'b'.repeat(64), name = 'lexora-crc-' + nonce;
  const info = { Id: id, Name: '/' + name, Config: { Image: 'postgres:18.6', Labels: { 'lexora.crc.fresh': nonce } },
    HostConfig: { RestartPolicy: { Name: 'no' }, PortBindings: { '5432/tcp': [{ HostIp: '127.0.0.1' }] },
      Tmpfs: { '/var/lib/postgresql': 'rw' } } };
  ownedContainer(info, name, nonce, id);
  for (const mutate of [
    x => { x.Id = 'c'.repeat(64); }, x => { x.Name = '/unowned'; },
    x => { x.Config.Labels['lexora.crc.fresh'] = 'unowned'; }, x => { x.Config.Image = 'postgres:latest'; },
    x => { x.HostConfig.PortBindings['5432/tcp'][0].HostIp = '0.0.0.0'; },
    x => { x.HostConfig.Tmpfs = {}; },
  ]) { const changed = structuredClone(info); mutate(changed); assert.throws(() => ownedContainer(changed, name, nonce, id)); }
});

const manifest = require('./crc-fresh-migrations.json');
function migrationFixture(t) {
  const temporaryRoot = fs.realpathSync(require('node:os').tmpdir());
  const fixture = fs.mkdtempSync(path.join(temporaryRoot, 'lexora-crc-fresh-sql-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(fixture)), temporaryRoot);
    assert.ok(path.basename(fixture).startsWith('lexora-crc-fresh-sql-'));
    fs.rmSync(fixture, { recursive: true });
  });
  for (const entry of manifest.filter(x => !x.excludedReason)) {
    const directory = path.join(fixture, 'prisma/migrations', entry.name);
    fs.mkdirSync(directory, { recursive: true });
    fs.copyFileSync(path.join(api, 'prisma/migrations', entry.name, 'migration.sql'),
      path.join(directory, 'migration.sql'));
  }
  return fixture;
}
test('clean checkout without reviewed drafts emits identical SQL and invariant definitions', t => {
  const fixture = migrationFixture(t);
  const clean = buildOverlay(fixture, prismaSQL);
  const { inventory: cleanInventory, ...cleanDefinitions } = clean;
  const { inventory: originalInventory, ...originalDefinitions } = overlay;
  assert.deepEqual(cleanDefinitions, originalDefinitions);
  const withoutPresence = inventory => inventory.map(({ sourcePresent, ...entry }) => entry);
  assert.deepEqual(withoutPresence(cleanInventory), withoutPresence(originalInventory));
  assert.equal(cleanInventory.filter(x => x.kind === 'reviewed-exclusion').length, 2);
  assert.ok(cleanInventory.filter(x => x.kind === 'reviewed-exclusion').every(x => x.sourcePresent === false));
});
test('present reviewed draft is checksum verified but never activated', t => {
  const fixture = migrationFixture(t);
  const name = '202608290001_add_external_committee_member';
  const directory = path.join(fixture, 'prisma/migrations', name);
  fs.mkdirSync(directory);
  // Exact pinned draft text; this test must also work without ignored local files.
  fs.writeFileSync(path.join(directory, 'migration.sql'), [
    '-- AlterEnum',
    'ALTER TYPE "ExaminationCommitteeSeat" ADD VALUE \'EXTERNAL_MEMBER\';',
    '',
    '-- AlterTable',
    'ALTER TABLE "examination_committee_assignments" ALTER COLUMN "assigned_user_id" DROP NOT NULL;',
    'ALTER TABLE "examination_committee_assignments" ADD COLUMN "external_member_name" VARCHAR(128);',
    'ALTER TABLE "examination_committee_assignments" ADD COLUMN "external_member_affiliation" VARCHAR(255);',
    '',
  ].join('\n'));
  const present = buildOverlay(fixture, prismaSQL);
  assert.equal(present.sql, overlay.sql);
  assert.equal(present.inventory.find(x => x.migration === name).sourcePresent, true);
});
test('altered active sources and either present excluded draft fail checksum validation', t => {
  const fixture = migrationFixture(t);
  for (const entry of [manifest.find(x => !x.excludedReason), ...manifest.filter(x => x.excludedReason)]) {
    const directory = path.join(fixture, 'prisma/migrations', entry.name);
    const file = path.join(directory, 'migration.sql');
    fs.mkdirSync(directory, { recursive: true });
    const original = entry.excludedReason ? undefined : fs.readFileSync(file);
    fs.writeFileSync(file, '-- altered source must never be accepted\n');
    assert.throws(() => buildOverlay(fixture, prismaSQL),
      error => error.code === 'ERR_ASSERTION' &&
        error.message.includes('Migration changed; review fresh invariant manifest: ' + entry.name));
    if (original) fs.writeFileSync(file, original);
    else fs.unlinkSync(file);
  }
});
test('missing active SQL, unknown directories and unreadable excluded sources fail closed', t => {
  const fixture = migrationFixture(t);
  const active = manifest.find(x => !x.excludedReason);
  const file = path.join(fixture, 'prisma/migrations', active.name, 'migration.sql');
  const original = fs.readFileSync(file);
  fs.unlinkSync(file);
  assert.throws(() => buildOverlay(fixture, prismaSQL), { code: 'ENOENT' });
  fs.rmdirSync(path.dirname(file));
  assert.throws(() => buildOverlay(fixture, prismaSQL), /New migration requires invariant review/);
  fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, original);
  const unknown = path.join(fixture, 'prisma/migrations/209901010001_unreviewed');
  fs.mkdirSync(unknown);
  assert.throws(() => buildOverlay(fixture, prismaSQL), /New migration requires invariant review/);
  fs.rmdirSync(unknown);
  const excluded = manifest.find(x => x.excludedReason);
  fs.mkdirSync(path.join(fixture, 'prisma/migrations', excluded.name, 'migration.sql'), { recursive: true });
  assert.throws(() => buildOverlay(fixture, prismaSQL),
    error => error.code === 'EISDIR' || error.code === 'EPERM');
});
