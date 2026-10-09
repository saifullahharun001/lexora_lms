'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { classifySyntheticDbError } = require('./crc-synthetic-summative-preterminal.cjs');

test('SQLSTATE + trigger reason extracted from known controlled error', () => {
 const x = classifySyntheticDbError({name:'PrismaClientUnknownRequestError',message:'PostgresError { code: "P0001", message: "Calculated mark chronology is invalid" }'});
 assert.deepEqual(x, {sqlstate:'P0001',reason:'CALCULATED_CHRONOLOGY'});
});
test('constraint and untrusted arbitrary payloads never printed', () => {
 const x=classifySyntheticDbError({message:'SECRET_PASSWORD=example url=postgresql://secret@host/db\\nviolates check constraint', code:'23514'});
 assert.deepEqual(x,{sqlstate:'23514',reason:'CHECK_CONSTRAINT'});
 assert.ok(!JSON.stringify(x).includes('SECRET'));
 assert.ok(!JSON.stringify(x).includes('postgresql://'));
});
test('unknown DB or service failure fails safely without leaking messages', () => {
 const x=classifySyntheticDbError({name:'MysteryError',message:'private student identifier and random details'});
 assert.deepEqual(x,{sqlstate:'UNCLASSIFIED',reason:'UNCLASSIFIED'});
});
test('fixture marks distinguish examiner save and finalize', () => {
 const fixture=fs.readFileSync(path.join(__dirname,'../prisma/fixtures/course-composition-summative-preterminal.ts'),'utf8');
 assert.match(fixture,/CRC_PRETERMINAL_STAGE=\$\{key\}:\$\{seat\}_EXAMINER_SAVE/);
 assert.match(fixture,/CRC_PRETERMINAL_STAGE=\$\{key\}:\$\{seat\}_EXAMINER_FINALIZE/);
 assert.doesNotMatch(fixture,/console\.log\(.*(?:candidate\.id|mark\}|awardedMark)/);
});
