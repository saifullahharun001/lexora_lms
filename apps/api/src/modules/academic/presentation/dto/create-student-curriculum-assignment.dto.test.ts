import assert from "node:assert/strict";
import test from "node:test";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { CreateStudentCurriculumAssignmentDto } from "./create-student-curriculum-assignment.dto";
import { StudentCurriculumAssignmentParamDto } from "./student-curriculum-assignment-param.dto";

test("curriculumVersionId is trimmed and whitespace-only values are rejected", async () => {
  const valid = plainToInstance(CreateStudentCurriculumAssignmentDto, {
    curriculumVersionId: "  version-a  ",
  });
  assert.equal(valid.curriculumVersionId, "version-a");
  assert.equal((await validate(valid)).length, 0);

  const invalid = plainToInstance(CreateStudentCurriculumAssignmentDto, {
    curriculumVersionId: "   ",
  });
  assert.ok((await validate(invalid)).length > 0);
});

test("student and programme route identifiers are trimmed and validated", async () => {
  const valid = plainToInstance(StudentCurriculumAssignmentParamDto, {
    studentUserId: "  student-a ",
    academicProgramId: " program-a  ",
  });
  assert.equal(valid.studentUserId, "student-a");
  assert.equal(valid.academicProgramId, "program-a");
  assert.equal((await validate(valid)).length, 0);

  const invalid = plainToInstance(StudentCurriculumAssignmentParamDto, {
    studentUserId: " ",
    academicProgramId: "x",
  });
  assert.ok((await validate(invalid)).length > 0);
});
