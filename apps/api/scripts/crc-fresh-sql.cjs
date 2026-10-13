'use strict';
// Current-schema synthetic invariants, NOT historical migration replay.
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const hash = s => createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('hex');
const ident = '(?:"[A-Za-z0-9_]+"|[A-Za-z_][A-Za-z0-9_]*)';
const unquote = s => s.replaceAll('"', '');
function split(sql, separator = ';') {
  let out = [], text = '', quote = '', dollar = '', depth = 0, block = 0, line = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i], pair = sql.slice(i, i + 2);
    if (line) { if (c === '\n') { line = false; text += '\n'; } continue; }
    if (block) { if (pair === '/*') { block++; i++; } else if (pair === '*/') { block--; i++; } continue; }
    if (dollar) {
      if (sql.startsWith(dollar, i)) { text += dollar; i += dollar.length - 1; dollar = ''; }
      else text += c;
      continue;
    }
    if (quote) {
      text += c;
      if (c === quote) { if (sql[i + 1] === quote) text += sql[++i]; else quote = ''; }
      continue;
    }
    if (pair === '--') { line = true; i++; continue; }
    if (pair === '/*') { block = 1; text += ' '; i++; continue; }
    if (c === "'" || c === '"') { quote = c; text += c; continue; }
    const tag = c === '$' && /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
    if (tag) { dollar = tag[0]; text += dollar; i += dollar.length - 1; continue; }
    if (c === '(') depth++;
    if (c === ')') depth--;
    assert.ok(depth >= 0, 'Unbalanced SQL');
    if (c === separator && depth === 0) { if (text.trim()) out.push(text.trim()); text = ''; }
    else text += c;
  }
  assert.ok(!quote && !dollar && !block && depth === 0, 'Incomplete SQL');
  if (text.trim()) out.push(text.trim());
  return out;
}
function extractFunctionBody(sql) {
  // Reuse statement tokenization to discard only comments outside dollar literals.
  const statements = split(sql);
  assert.equal(statements.length, 1, 'Expected one function statement');
  const statement = statements[0];
  let quote = '';
  for (let i = 0; i < statement.length; i++) {
    const c = statement[i];
    if (quote) {
      if (c === quote) {
        if (statement[i + 1] === quote) i++;
        else quote = '';
      }
      continue;
    }
    if (c === "'" || c === '"') { quote = c; continue; }
    const opening = c === '$' && /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(statement.slice(i));
    if (!opening) continue;
    const delimiter = opening[0];
    const start = i + delimiter.length;
    const end = statement.indexOf(delimiter, start);
    assert.ok(end >= start, 'Unterminated function dollar quote');
    if (/(?:^|[^A-Za-z0-9_$])AS\s*$/i.test(statement.slice(0, i)))
      return statement.slice(start, end);
    // A parameter default may itself be dollar-quoted; it is not the AS body.
    i = end + delimiter.length - 1;
  }
  throw Error('Expected a dollar-quoted AS function body');
}
function buildOverlay(apiRoot, prismaSQL) {
  const manifest = JSON.parse(readFileSync(path.join(__dirname, 'crc-fresh-migrations.json'), 'utf8'));
  const excluded = new Set(manifest.filter(x => x.excludedReason).map(x => x.name));
  const directories = readdirSync(path.join(apiRoot, 'prisma/migrations'), { withFileTypes: true })
    .filter(x => x.isDirectory() && !excluded.has(x.name)).map(x => x.name).sort();
  assert.deepEqual(directories, manifest.filter(x => !x.excludedReason).map(x => x.name).sort(), 'New migration requires invariant review');
  const functions = new Map(), triggers = new Map(), indexes = new Map(), checks = new Map(), foreign = new Map();
  const base = split(prismaSQL);
  const baseNames = new Set(base.flatMap(s => [...s.matchAll(/(?:CONSTRAINT|INDEX) "([^"]+)"/g)].map(m => m[1])));
  const tables = new Set(base.map(s => /^CREATE TABLE "([^"]+)"/.exec(s)?.[1]).filter(Boolean));
  const inventory = [], sequences = [];
  let unnamed = 0;
  function addConstraint(table, clause, origin) {
    const name = new RegExp('^CONSTRAINT\\s+(' + ident + ')\\s+', 'i').exec(clause);
    const body = name ? clause.slice(name[0].length) : clause;
    const key = name ? unquote(name[1]) : 'crc_fresh_check_' + (++unnamed);
    if (/^CHECK\s*\(/i.test(body)) {
      checks.set(table + '.' + key, { table, name: key, sql: 'ALTER TABLE "' + table + '" ADD CONSTRAINT "' + key + '" ' + body, origin });
    } else if (/^(FOREIGN KEY|UNIQUE|PRIMARY KEY)\b/i.test(body)) {
      if (name) foreign.set(table + '.' + key, { table, name: key, sql: 'ALTER TABLE "' + table + '" ADD ' + clause, origin });
      else throw Error('Unnamed non-check table constraint needs review: ' + origin);
    } else throw Error('Unclassified constraint: ' + origin + ': ' + clause.slice(0, 120));
  }
  for (const entry of manifest) {
    let sql;
    try {
      sql = readFileSync(path.join(apiRoot, 'prisma/migrations', entry.name, 'migration.sql'), 'utf8');
    } catch (error) {
      // Reviewed, ignored drafts are absent in a clean checkout. Nothing else is optional.
      if (!entry.excludedReason || error.code !== 'ENOENT') throw error;
    }
    if (sql !== undefined)
      assert.equal(hash(sql), entry.sha256, 'Migration changed; review fresh invariant manifest: ' + entry.name);
    if (entry.excludedReason) {
      inventory.push({ migration: entry.name, kind: 'reviewed-exclusion', reason: entry.excludedReason,
        sha256: entry.sha256, sourcePresent: sql !== undefined });
      continue;
    }
    for (const s of split(sql)) {
      let m, kind;
      if ((m = new RegExp('^CREATE (?:OR REPLACE )?FUNCTION\\s+(' + ident + ')\\s*\\(', 'i').exec(s))) {
        functions.set(unquote(m[1]), { sql: s.replace(/^CREATE FUNCTION/i, 'CREATE OR REPLACE FUNCTION'), origin: entry.name }); kind = 'function';
      } else if ((m = new RegExp('^CREATE (?:CONSTRAINT )?TRIGGER\\s+(' + ident + ')[\\s\\S]*?\\sON\\s+(' + ident + ')', 'i').exec(s))) {
        triggers.set(unquote(m[2]) + '.' + unquote(m[1]), { sql: s, table: unquote(m[2]), name: unquote(m[1]), origin: entry.name }); kind = 'trigger';
      } else if ((m = new RegExp('^DROP TRIGGER(?: IF EXISTS)?\\s+(' + ident + ')\\s+ON\\s+(' + ident + ')', 'i').exec(s))) {
        assert.ok(triggers.delete(unquote(m[2]) + '.' + unquote(m[1])), 'Unknown dropped trigger'); kind = 'superseded-trigger';
      } else if ((m = new RegExp('^CREATE (?:UNIQUE )?INDEX\\s+(' + ident + ')', 'i').exec(s))) {
        indexes.set(unquote(m[1]), { sql: s, name: unquote(m[1]), origin: entry.name }); kind = 'index';
      } else if ((m = new RegExp('^DROP INDEX\\s+(' + ident + ')$', 'i').exec(s))) {
        indexes.delete(unquote(m[1])); kind = 'superseded-index';
      } else if ((m = new RegExp('^ALTER INDEX\\s+(' + ident + ')\\s+RENAME TO\\s+(' + ident + ')$', 'i').exec(s))) {
        const old = indexes.get(unquote(m[1])); assert.ok(old, 'Unknown renamed index');
        indexes.delete(unquote(m[1])); indexes.set(unquote(m[2]), { ...old, name: unquote(m[2]), sql: old.sql.replace(m[1], m[2]) }); kind = 'renamed-index';
      } else if ((m = new RegExp('^CREATE TABLE\\s+(' + ident + ')\\s*\\(([\\s\\S]*)\\)$', 'i').exec(s))) {
        const table = unquote(m[1]); assert.ok(tables.has(table), 'Table absent from current schema: ' + table);
        for (const col of split(m[2], ',')) {
          if (/^(CONSTRAINT|CHECK|FOREIGN KEY|UNIQUE|PRIMARY KEY)\b/i.test(col)) addConstraint(table, col, entry.name);
          else if (/\bCHECK\s*\(/i.test(col)) addConstraint(table, col.slice(col.search(/\bCHECK\s*\(/i)), entry.name);
        }
        kind = 'current-prisma-table-plus-inline-checks';
      } else if ((m = new RegExp('^ALTER TABLE\\s+(' + ident + ')\\s+([\\s\\S]*)$', 'i').exec(s))) {
        const table = unquote(m[1]); assert.ok(tables.has(table));
        for (const action of split(m[2], ',')) {
          if (/^ADD (?:CONSTRAINT|CHECK)\b/i.test(action)) addConstraint(table, action.slice(4), entry.name);
          else if (/^DROP CONSTRAINT\b/i.test(action)) {
            const name = unquote(action.match(new RegExp('^DROP CONSTRAINT\\s+(' + ident + ')', 'i'))[1]);
            checks.delete(table + '.' + name); foreign.delete(table + '.' + name);
          } else assert.match(action, /^(ADD COLUMN|ALTER COLUMN|DROP COLUMN)\b/i, 'Unreviewed table alteration');
        }
        kind = 'current-prisma-columns-plus-constraints';
      } else if (/^(CREATE TYPE|ALTER TYPE)\b/i.test(s)) kind = 'current-prisma-enum';
      else if (/^CREATE SEQUENCE\b/.test(s)) { sequences.push(s); kind = 'sequence'; }
      else if (/^UPDATE (class_sessions|attendance_records) SET attendance_evidence_revision = nextval/.test(s) && entry.name === '202609230001_add_authoritative_formative_attendance') kind = 'empty-data-revision-backfill';
      else if (s === 'LOCK TABLE formative_activities IN SHARE ROW EXCLUSIVE MODE' && entry.name === '202610010001_add_formative_activity_submission') kind = 'empty-data-migration-lock';
      else if (/^COMMENT ON (COLUMN|TABLE)\b/.test(s)) kind = 'documentation';
      else if (/^(BEGIN|COMMIT)$/.test(s)) kind = 'transaction-wrapper';
      else if (/^DO \$\$/.test(s) && ['202608100002_redesign_course_offering_uniqueness','202610010001_add_formative_activity_submission'].includes(entry.name)) kind = 'empty-data-preflight';
      else if (/^INSERT INTO roles\(/.test(s) && entry.name === '202609280001_ordinary_attendance_corrections') kind = 'empty-data-role-backfill-trigger-retained';
      else throw Error('Unclassified migration SQL: ' + entry.name + ': ' + s.slice(0, 160));
      inventory.push({ migration: entry.name, kind, sha256: hash(s) });
    }
  }
  const normalize = value => value.replaceAll('"', '').replace(/\s+/g, '').toLowerCase();
  const collisions = [...foreign.values()].filter(x => /FOREIGN KEY/.test(x.sql) && baseNames.has(x.name));
  for (const constraint of collisions) {
    const original = base.find(x => x.includes('CONSTRAINT "' + constraint.name + '"'));
    assert.equal(normalize(original), normalize(constraint.sql),
      'Current Prisma FK differs from SQL invariant: ' + constraint.name);
  }
  for (const index of indexes.values()) {
    if (!baseNames.has(index.name)) continue;
    const original = base.find(x => x.startsWith('CREATE ') && x.includes('INDEX "' + index.name + '"'));
    assert.ok(original, 'Index name collides with another Prisma object: ' + index.name);
    assert.equal(normalize(original), normalize(index.sql), 'Current Prisma index differs: ' + index.name);
  }
  const extraIndexes = [...indexes.values()].filter(x => !baseNames.has(x.name));
  const extraForeign = [...foreign.values()].filter(x => !baseNames.has(x.name));
  // Only defer function body name resolution during DDL, never enforcement.
  const parts = [...sequences, 'SET check_function_bodies = off', ...[...functions.values()].map(x => x.sql),
    'SET check_function_bodies = on', ...extraIndexes.map(x => x.sql),
    ...extraForeign.map(x => x.sql), ...[...checks.values()].map(x => x.sql),
    ...[...triggers.values()].map(x => x.sql)];
  assert.ok(functions.size === 99 && triggers.size === 105 && checks.size === 125, 'Incomplete invariant inventory: ' + [functions.size,triggers.size,checks.size]);
  return { sql: parts.join(';\n\n') + ';\n', inventory,
    functions: [...functions.keys()], functionBodies: [...functions.entries()].map(([name, fn]) => ({ name, body: extractFunctionBody(fn.sql) })),
    triggers: [...triggers.values()].map(({table,name,sql}) => ({table,name,deferred: /DEFERRABLE INITIALLY DEFERRED/.test(sql)})),
    checks: [...checks.values()].map(({table,name}) => ({table,name})),
    extraIndexes: extraIndexes.map(x => x.name), extraConstraints: extraForeign.map(({table,name}) => ({table,name})) };
}
module.exports = { split, extractFunctionBody, buildOverlay, hash };
