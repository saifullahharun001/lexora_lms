'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = process.cwd();
const historical = fs.readFileSync(path.join(root, 'apps/api/prisma/migrations/202609020002_add_summative_calculated_committee_approval/migration.sql'), 'utf8').replace(/\r\n/g, '\n');
const fix = fs.readFileSync(path.join(root, 'apps/api/prisma/migrations/202610090001_correct_summative_timestamp3_chronology/migration.sql'), 'utf8').replace(/\r\n/g, '\n');
const names = [
  'lexora_validate_summative_calculated_mark',
  'lexora_validate_summative_member_review',
  'lexora_validate_summative_chairman_approval',
];
function oldBody(name) {
  const pattern = new RegExp(`CREATE FUNCTION "${name}"\\(\\)\\s*RETURNS trigger\\s*LANGUAGE plpgsql\\s*AS \\$body\\$[\\s\\S]*?\\$body\\$;`);
  const value = historical.match(pattern)?.[0];
  assert.ok(value, `Missing historical function ${name}`);
  return value;
}
function updatedBody(name) {
  const pattern = new RegExp(`CREATE OR REPLACE FUNCTION "${name}"\\(\\)\\s*RETURNS trigger\\s*LANGUAGE plpgsql\\s*AS \\$body\\$[\\s\\S]*?\\$body\\$;`);
  const value = fix.match(pattern)?.[0];
  assert.ok(value, `Missing corrective function ${name}`);
  return value;
}

test('all three trigger functions differ ONLY by six precision-compatible upper bounds', () => {
  for (const name of names) {
    const old = oldBody(name);
    const rebuilt = updatedBody(name).replace('CREATE OR REPLACE FUNCTION', 'CREATE FUNCTION')
      .replaceAll('> statement_timestamp()::timestamp(3)', '> statement_timestamp()');
    assert.equal(rebuilt, old, `Unrelated trigger/authorization change detected: ${name}`);
    assert.equal((updatedBody(name).match(/> statement_timestamp\(\)::timestamp\(3\)/g) || []).length, 2);
  }
  assert.equal((fix.match(/CREATE OR REPLACE FUNCTION/g) || []).length, 3);
  assert.equal((fix.match(/> statement_timestamp\(\)::timestamp\(3\)/g) || []).length, 6);
});

test('no historical migration modifications, trigger disable, direct evidence write or unsafe DDL', () => {
  const top = fix.replace(/\$body\$[\s\S]*?\$body\$/g, '$body$ $body$');
  assert.doesNotMatch(top, /\b(?:ALTER\s+TABLE|DROP|TRUNCATE|DISABLE\s+TRIGGER|SET\s+session_replication_role|INSERT|UPDATE|DELETE)\b/i);
  assert.doesNotMatch(fix, /\bSECURITY\s+DEFINER\b|\bDISABLE\s+TRIGGER\b/i);
});

test('immutability and authorization guards retained from historical trigger bytes', () => {
  for (const name of names) {
    const current = updatedBody(name);
    const original = oldBody(name);
    for (const needle of ['IF TG_OP = \'UPDATE\' OR TG_OP = \'DELETE\' THEN']) {
      assert.ok(original.includes(needle));
      assert.ok(current.includes(needle));
    }
  }
});
