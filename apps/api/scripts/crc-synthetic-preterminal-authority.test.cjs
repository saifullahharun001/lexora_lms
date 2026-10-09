"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const foundation = read("scripts/crc-synthetic-foundation.cjs");
const manager = read("src/modules/summative-examination/application/services/summative-management-authorizer.service.ts");
const examiner = read("src/modules/summative-examination/application/services/examiner-authority.service.ts");
const fixture = read("prisma/fixtures/course-composition-summative-preterminal.ts");
test("synthetic operator has exact department-admin management grants, no wildcard", () => {
  assert.match(foundation, /code: 'department_admin'/);
  assert.match(foundation, /crc_fixture_admin_operator_binding/);
  for (const r of ["summative-examination.setup", "summative-examination.committee", "summative-examination.examiner-assignment"])
    assert.ok(foundation.includes(`'${r}'`));
  assert.match(foundation, /code: `\$\{resource\}\.manage_department`/);
  assert.match(manager, /assignment\.role === "department_admin"/);
  assert.match(manager, /isPermissionGrantFromLoadedRole\(principal, permission\)/);
  assert.match(manager, /r\."code" = 'department_admin'/);
  assert.doesNotMatch(foundation, /resource: '\*'|action: '\*'/);
});
test("synthetic Teacher has exact marking permission with matching resource, action and scope", () => {
  assert.match(foundation, /code: 'summative-examination\.examiner-marks\.enter_department'/);
  assert.match(foundation, /resource: 'summative-examination\.examiner-marks', action: 'enter', scope: 'DEPARTMENT'/);
  assert.match(foundation, /id: 'crc_fixture_teacher_marks_grant'/);
  assert.match(foundation, /roleId: fixed\.teacherRole, permissionId: 'crc_fixture_examiner_marks_permission'/);
  assert.match(examiner, /assignment\.userRoleId === grant\?\.source\.userRoleId/);
  assert.match(examiner, /EXAMINER_MARKS_ENTER_DEPARTMENT/);
  assert.match(examiner, /if \(!grant \|\| !teacherRoleAssignment\)/);
  assert.match(examiner, /ExaminationCourseExaminerAssignmentStatus\.ACTIVE/);
});
test("real-service stage logs contain only case keys and fixed stage names", () => {
  const matches = [...fixture.matchAll(/console\.log\(`CRC_PRETERMINAL_STAGE=\$\{key\}:([A-Z_]+)`\)/g)];
  assert.deepEqual([...new Set(matches.map(m=>m[1]))].sort(), [
    'COMMITTEE_APPOINTMENTS', 'EXAMINER_ASSIGNMENTS', 'CANDIDATE_REGISTRATION',
    'QUESTION_CONFIGURATION', 'EXAMINER_MARKING', 'CALCULATED_EVIDENCE'
  ].sort());
  assert.match(fixture, /new PrincipalLoaderService\(db as never\)\.loadPrincipal\(actorId\)/);
  assert.match(fixture, /ctx\.run\(/);
});
