'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { buildOverlay, hash } = require('./crc-fresh-sql.cjs');
const api = path.resolve(__dirname, '..');
const repository = path.resolve(api, '../..');
const image = 'postgres:18.6';
function cleanEnvironment(source) {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    if (/^(DATABASE_|PG|LEXORA_|POSTGRES_|DOCKER_|NODE_OPTIONS$)/i.test(key)) delete env[key];
  }
  // Offline Prisma diff needs no database; explicit non-routable test placeholders.
  env.DATABASE_URL = env.DATABASE_DIRECT_URL = 'postgresql://unused:unused@127.0.0.1:1/crc_offline_test?schema=public';
  return env;
}
function ownedContainer(info, name, runId, id) {
  assert.equal(info.Name, '/' + name);
  assert.equal(info.Config.Labels['lexora.crc.fresh'], runId);
  if (id) assert.equal(info.Id, id);
  assert.equal(info.Config.Image, image);
  assert.equal(info.HostConfig.RestartPolicy.Name, 'no');
  assert.equal(info.HostConfig.PortBindings['5432/tcp'][0].HostIp, '127.0.0.1');
  assert.ok(info.HostConfig.Tmpfs['/var/lib/postgresql']);
}
async function main() {
  assert.deepEqual(process.argv.slice(2), ['--apply'], 'Run with --apply; this creates only owned synthetic containers');
  process.chdir(api);
  const runId = randomBytes(16).toString('hex');
  const stage = path.join(repository, '.crc-runtime', runId);
  fs.mkdirSync(stage, { recursive: true });
  const env = cleanEnvironment(process.env);
  const secrets = [];
  const redact = text => secrets.reduce((s, secret) => s.replaceAll(secret, '[REDACTED]'),
    String(text).replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[REDACTED_DATABASE_URL]'));
  const evidence = { runId, baselineApproved: false, postgresRequired: '180006', image,
    status: 'RUNNING', campaigns: [], cleanup: [], startedAt: new Date().toISOString() };
  function save() { fs.writeFileSync(path.join(stage, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n'); }
  function command(executable, args, options = {}) {
    const result = spawnSync(executable, args, { cwd: api, env, encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024, timeout: 120000, ...options });
    if (result.error || result.status !== 0) {
      fs.appendFileSync(path.join(stage, 'commands.log'), redact(result.stdout || '') + redact(result.stderr || ''));
      throw Error(path.basename(executable) + ' failed: ' + (result.error?.code ?? result.status));
    }
    return result.stdout;
  }
  function psql(name, database, sql) {
    return command('docker', ['exec', '-i', name, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
      '-U', 'postgres', '-d', database, '-At'], { input: sql });
  }
  save();
  try {
    // No connection strings, Docker host endpoints, .env files or baselines accepted.
    const context = command('docker', ['context', 'inspect']);
    const endpoint = JSON.parse(context)[0]?.Endpoints?.docker?.Host;
    assert.ok(typeof endpoint === 'string' && /^(unix:\/\/|npipe:\/\/)/.test(endpoint),
      'Only a local Docker daemon is allowed');
    command('docker', ['version', '--format', '{{.Server.Version}}']);
    command('docker', ['image', 'inspect', image]); // Operator pulls explicitly; no version fallback.
    evidence.imageId = command('docker', ['image', 'inspect', image, '--format', '{{.Id}}']).trim();
    fs.copyFileSync(path.join(api, 'prisma/schema.prisma'), path.join(stage, 'schema.prisma'));
    const schemaSQL = command(process.execPath, [require.resolve('prisma/build/index.js'),
      'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.join(stage, 'schema.prisma'), '--script'], { cwd: stage });
    const overlay = buildOverlay(api, schemaSQL);
    fs.writeFileSync(path.join(stage, 'current-schema.sql'), schemaSQL);
    fs.writeFileSync(path.join(stage, 'invariants.sql'), overlay.sql);
    fs.writeFileSync(path.join(stage, 'invariant-inventory.json'), JSON.stringify(overlay, null, 2));
    evidence.schemaSha256 = hash(fs.readFileSync(path.join(stage, 'schema.prisma'), 'utf8'));
    evidence.invariantsSha256 = hash(overlay.sql);
    evidence.gitHead = command('git', ['rev-parse', 'HEAD']).trim();
    fs.writeFileSync(path.join(stage, 'working-tree.diff'), command('git', ['diff', '--', 'apps/api', 'docs/runtime-test-checklist.md']));
    for (const order of ['formative-first', 'summative-first']) {
      const nonce = randomBytes(16).toString('hex');
      const name = 'lexora-crc-' + nonce;
      const database = 'crc_' + nonce + '_test';
      const adminPassword = randomBytes(32).toString('hex');
      const appPassword = randomBytes(32).toString('hex');
      secrets.push(adminPassword, appPassword);
      let containerId;
      const cleanup = { name, nonce, removed: false };
      evidence.cleanup.push(cleanup); save();
      try {
        containerId = command('docker', ['create', '--name', name, '--label', 'lexora.crc.fresh=' + nonce,
          '--restart', 'no', '--publish', '127.0.0.1::5432',
          '--tmpfs', '/var/lib/postgresql:rw,nosuid,nodev,size=1073741824',
          '--shm-size', '256m', '--memory', '2g', '--cpus', '2',
          '--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256',
          image], { env: { ...env, POSTGRES_PASSWORD: adminPassword } }).trim();
        assert.match(containerId, /^[a-f0-9]{64}$/);
        cleanup.containerId = containerId; save();
        command('docker', ['start', containerId]);
        let ready = false;
        for (let attempt = 0; attempt < 60; attempt++) {
          // Ignore the temporary PostgreSQL server used during image initialization.
          // PID 1 must be the final postgres process before checking readiness.
          const pidOne = spawnSync('docker', ['exec', containerId, 'cat', '/proc/1/comm'],
            { env, encoding: 'utf8', timeout: 5000 });
          if (pidOne.status === 0 && pidOne.stdout.trim() === 'postgres') {
            const result = spawnSync('docker',
              ['exec', containerId, 'pg_isready', '-U', 'postgres', '-d', 'postgres'],
              { env, encoding: 'utf8', timeout: 5000 });
            if (result.status === 0) { ready = true; break; }
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        assert.ok(ready, 'Owned database did not become ready');
        const info = JSON.parse(command('docker', ['inspect', containerId]))[0];
        ownedContainer(info, name, nonce, containerId);
        assert.equal(psql(containerId, 'postgres', 'SHOW server_version_num;').trim(), '180006');
        const ports = info.NetworkSettings.Ports['5432/tcp'];
        assert.equal(ports.length, 1); assert.equal(ports[0].HostIp, '127.0.0.1');
        const port = ports[0].HostPort; assert.match(port, /^\d+$/);
        psql(containerId, 'postgres',
          "CREATE ROLE crc_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;\n" +
          "CREATE ROLE crc_app LOGIN PASSWORD '" + appPassword + "' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;\n" +
          'CREATE DATABASE "' + database + '" OWNER crc_owner;\n' +
          'REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;\nREVOKE CONNECT ON DATABASE template1 FROM PUBLIC;\n' +
          'REVOKE ALL ON DATABASE "' + database + '" FROM PUBLIC;\n' +
          'GRANT CONNECT ON DATABASE "' + database + '" TO crc_app;\n' +
          'COMMENT ON DATABASE "' + database + '" IS \'LEXORA_CRC_FRESH:' + nonce + "';\n");
        psql(containerId, database, 'BEGIN;\nSET ROLE crc_owner;\n' + schemaSQL + '\n' + overlay.sql +
          '\nREVOKE CREATE ON SCHEMA public FROM PUBLIC;\nGRANT USAGE ON SCHEMA public TO crc_app;\n' +
          'GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO crc_app;\n' +
          'GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO crc_app;\n' +
          'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;\n' +
          'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO crc_app;\nCOMMIT;\n');
        // Catalog validation happens before ANY fixture writes.
        const triggers = JSON.parse(psql(containerId, database,
          "SELECT json_agg(json_build_object('table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'deferred',t.tgdeferrable AND t.tginitdeferred)) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname='public';").trim());
        for (const expected of overlay.triggers) assert.ok(triggers.some(t =>
          t.table === expected.table && t.name === expected.name && t.enabled === 'O' && t.deferred === expected.deferred), 'Missing/enforcement-disabled trigger: ' + expected.name);
        const functionBodies = JSON.parse(psql(containerId, database,
          "SELECT json_agg(json_build_object('name',p.proname,'body',p.prosrc)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public';").trim());
        for (const expected of overlay.functionBodies) assert.ok(functionBodies.some(f =>
          f.name === expected.name && hash(f.body) === hash(expected.body)), 'Function body mismatch: ' + expected.name);
        assert.equal(psql(containerId, database,
          "SELECT count(*) FROM pg_constraint WHERE conrelid='course_result_compositions'::regclass AND contype='f' AND convalidated;").trim(), '12');
        const constraints = JSON.parse(psql(containerId, database,
          "SELECT json_agg(json_build_object('table',c.relname,'name',p.conname,'valid',p.convalidated)) FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public';").trim());
        for (const expected of [...overlay.checks, ...overlay.extraConstraints]) assert.ok(constraints.some(c =>
          c.table === expected.table && c.name === expected.name && c.valid), 'Missing invariant: ' + expected.name);
        const url = 'postgresql://crc_app:' + appPassword + '@127.0.0.1:' + port + '/' + database + '?schema=public';
        const childEnv = { ...env, DATABASE_URL: url, DATABASE_DIRECT_URL: url,
          LEXORA_CRC_FOUNDATION_DATABASE_URL: url, LEXORA_CRC_FOUNDATION_EXPECTED_DATABASE: database,
          LEXORA_CRC_FOUNDATION_CONFIRM: 'YES_DISPOSABLE_SYNTHETIC_FOUNDATION',
          LEXORA_CRC_FRESH_RUN_ID: nonce };
        const output = command(process.execPath, ['-r', './scripts/register-test-paths.cjs',
          'scripts/crc-fresh-owner.cjs', order], { env: childEnv, timeout: 1800000 });
        fs.writeFileSync(path.join(stage, order + '.log'), redact(output));
        assert.ok(output.includes('CRC_FRESH_ORDER=' + order + ':PASS'));
        evidence.campaigns.push({ order, status: 'PASS', reviews: 13, approvals: 6,
          formative: 6, compositions: 6, terminalAudits: 12 });
        console.log('CRC_FRESH_ORDER=' + order + ':PASS');
      } finally {
        // Never remove by a broad prefix, never touch volumes or other containers.
        const found = spawnSync('docker', ['inspect', name], { env, encoding: 'utf8', timeout: 10000 });
        if (found.status === 0) {
          const info = JSON.parse(found.stdout)[0];
          ownedContainer(info, name, nonce, containerId);
          command('docker', ['rm', '--force', '--volumes', info.Id]);
          const remaining = command('docker', ['ps', '-aq', '--filter', 'id=' + info.Id]).trim();
          assert.equal(remaining, '', 'Owned container cleanup not confirmed');
          cleanup.removed = true;
        } else {
          assert.ok(!containerId, 'Cannot verify cleanup of created container');
          cleanup.removed = true; cleanup.notCreated = true;
        }
        save();
      }
    }
    evidence.status = 'PASS';
    console.log('CRC_FRESH_RUNTIME_AND_CLEANUP=PASS');
  } catch (error) {
    evidence.status = 'BLOCKED_OR_FAILED';
    evidence.failure = redact(error.message);
    throw error;
  } finally {
    evidence.finishedAt = new Date().toISOString(); save();
    console.log('BASELINE_APPROVED=NO');
    console.log('CRC_FRESH_EVIDENCE=' + stage);
  }
}
module.exports = { cleanEnvironment, ownedContainer };
if (require.main === module) main().catch(error => {
  console.error('CRC_FRESH_RUNTIME=BLOCKED_OR_FAILED', error.message);
  process.exitCode = 1;
});
