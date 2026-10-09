'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const stage = fs.readFileSync(path.join(__dirname, '../prisma/fixtures/course-composition-formative-certified-activities.ts'),'utf8');
const entry = fs.readFileSync(path.join(__dirname, 'crc-synthetic-formative-certified-activities.cjs'),'utf8');
test('source-owner certified REGULAR workflow is called through real services', () => {
  for(const label of ['registrations.createList(', 'registrations.putCandidate(', 'registrations.certify(',
    "category: 'REGULAR'", 'new ExaminationRegistrationService(']) assert.ok(stage.includes(label), label);
});
test('Activities marks and finalisation are created through their owner services', () => {
  for(const label of ['formative.createActivity(', 'formative.startMarking(',
    'formative.saveMark(', 'formative.submitActivity(', 'activities.finalise(',
    'new FormativeActivitiesFinalisationService(']) assert.ok(stage.includes(label), label);
});
test('no direct insertion into terminal academics or audit log', () => {
  assert.doesNotMatch(stage, /(?:formativeActivitiesFinalisation|formativeActivitiesFinalResult|formativeFinalResult|summativeChairmanApproval|courseResultComposition|auditLog)\.create\s*\(/);
  assert.doesNotMatch(stage, /(?:session_replication_role|DISABLE\s+TRIGGER|ALTER\s+TABLE\s+.+DISABLE)/i);
});
test('only disposable, exact six-scenario academic context with no published/Chairman records', () => {
  for(const label of ["/^crc_[a-zA-Z0-9_]+_test$/", "'YES_DISPOSABLE_SYNTHETIC_FOUNDATION'",
    'await db.summativeChairmanApproval.count()', 'assert.equal(manifest.length, 6)']) assert.ok(stage.includes(label), label);
  assert.ok(entry.includes('disposableTarget('));
  assert.doesNotMatch(entry, /console\.error\([^\n]*(?:\.message|\.stack|url|raw)/);
});
