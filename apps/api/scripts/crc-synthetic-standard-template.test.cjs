'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const source=fs.readFileSync(path.resolve(process.cwd(),'apps/api/scripts/crc-synthetic-foundation.cjs'),'utf8');
const formative=fs.readFileSync(path.resolve(process.cwd(),'apps/api/src/modules/assessment/application/services/formative-assessment.service.ts'),'utf8');
const attendance=fs.readFileSync(path.resolve(process.cwd(),'apps/api/src/modules/attendance/application/services/attendance-mark-generation.service.ts'),'utf8');
const componentBlock=source.match(/for \(const \[componentId, code, marks, order\] of \[([\s\S]*?)\]\) await tx\.assessmentTemplateComponent\.create/);
function entries(){
 assert.ok(componentBlock,'Foundation component seed loop exists');
 const matches=[...componentBlock[1].matchAll(/\[fixed\.(component\w+),'([A-Z_]+)','(\d+)',(\d+)\]/g)];
 return matches.map(m=>({fixture:m[1],code:m[2],marks:Number(m[3]),order:Number(m[4])}));
}
test('synthetic assessment template has exactly four authoritative components totaling 100',()=>{
 const actual=entries();
 assert.deepEqual(actual.map(v=>[v.code,v.marks,v.order]),[
  ['FORMATIVE_ACTIVITIES',30,1],['ATTENDANCE',5,2],['COMPREHENSIVE_EXAMINATION',5,3],['SUMMATIVE_EXAMINATION',60,4]
 ]);
 assert.equal(actual.reduce((sum,v)=>sum+v.marks,0),100);
 assert.equal(new Set(actual.map(v=>v.fixture)).size,4);
 assert.equal(new Set(actual.map(v=>v.code)).size,4);
 assert.doesNotMatch(source,/\['FORMATIVE_ASSESSMENT',\s*'40'/);
});
test('source-defined Formative standard template contract remains aligned',()=>{
 for (const [name,marks] of entries().map(x=>[x.code,x.marks])){
  assert.match(formative,new RegExp(`${name}: "${marks}"`));
 }
 assert.match(attendance,/A bound standard 30\/5\/5\/60 assessment template is required/);
});
test('Summative component exact identity and /60 are preserved',()=>{
 assert.match(source,/componentSummative: 'crc_fixture_component_summative'/);
 assert.match(source,/summativeAssessmentComponentId: fixed\.componentSummative/);
 assert.match(source,/summativeFullMark: '60'/);
});
test('fixture remains disposable-only and does not fabricate final academic evidence',()=>{
 assert.match(source,/disposableTarget\(raw, expected, marker\)/);
 assert.match(source,/await verifyIdentity\(db, name\)/);
 assert.doesNotMatch(source,/tx\.(formativeFinalResult|summativeCalculatedMark|comprehensiveFinalResult|courseResultComposition|summativeChairmanApproval)\.create\(/);
});
