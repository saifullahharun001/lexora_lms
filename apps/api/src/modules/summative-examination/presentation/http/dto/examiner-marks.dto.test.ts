import assert from "node:assert/strict";
import test from "node:test";

import { type ArgumentMetadata, ValidationPipe } from "@nestjs/common";

import {
  RegisterSummativeCandidateDto,
  SaveExaminerQuestionMarkDto,
} from "./examiner-marks.dto";
import {
  ExaminerMarkingCandidateIdParamDto,
  ExaminerMarkingCourseIdParamDto,
  ExaminerQuestionMarkIdParamDto,
} from "./resource-id-param.dto";

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

function validate<T>(
  metatype: new () => T,
  value: unknown,
  type: ArgumentMetadata["type"] = "body",
) {
  return pipe.transform(value, { type, metatype } as ArgumentMetadata);
}

test("awarded marks accept exact decimal strings including zero and full precision", async () => {
  for (const awardedMark of [
    "0",
    "0.00",
    "7",
    "7.5",
    "7.50",
    "10.25",
    "9999.99",
  ]) {
    const result = await validate(SaveExaminerQuestionMarkDto, { awardedMark });
    assert.equal(result.awardedMark, awardedMark);
  }
});

test("explicit null clears while omission remains an unchanged operation", async () => {
  assert.equal(
    (await validate(SaveExaminerQuestionMarkDto, { awardedMark: null }))
      .awardedMark,
    null,
  );
  assert.equal(
    (await validate(SaveExaminerQuestionMarkDto, {})).awardedMark,
    undefined,
  );
});

test("numeric, negative, malformed, exponent, special and excessive-scale marks are rejected", async () => {
  for (const awardedMark of [
    0,
    7.5,
    -1,
    "-1",
    "1.001",
    "1e2",
    "NaN",
    "Infinity",
    "-Infinity",
    "",
    " 7 ",
    "00",
    "01",
    "10000",
    {},
    [],
  ]) {
    await assert.rejects(
      validate(SaveExaminerQuestionMarkDto, { awardedMark }),
      String(awardedMark),
    );
  }
});

test("strict ValidationPipe rejects all authoritative, total and question-content injection", async () => {
  for (const forbiddenField of [
    "total",
    "totalMark",
    "calculatedTotal",
    "summativeTotal",
    "examinerUserId",
    "examinerAssignmentId",
    "examinerSeat",
    "departmentId",
    "questionConfigurationId",
    "questionText",
    "questionPaper",
    "marks",
  ]) {
    await assert.rejects(
      validate(SaveExaminerQuestionMarkDto, {
        awardedMark: "0",
        [forbiddenField]: "attacker-controlled",
      }),
      forbiddenField,
    );
  }
});

test("candidate registration accepts only one bounded Enrollment identity", async () => {
  const result = await validate(RegisterSummativeCandidateDto, {
    enrollmentId: "  enrollment-a  ",
  });
  assert.equal(result.enrollmentId, "enrollment-a");
  for (const enrollmentId of ["", "ab", "bad id", "../bad", "x".repeat(129)]) {
    await assert.rejects(
      validate(RegisterSummativeCandidateDto, { enrollmentId }),
    );
  }
  for (const forbiddenField of [
    "departmentId",
    "examinationId",
    "examinationCourseId",
    "studentUserId",
    "academicTermId",
    "academicProgramId",
    "curriculumVersionId",
    "curriculumCourseId",
    "studentCurriculumAssignmentId",
    "registeredByUserId",
    "registeredAt",
  ]) {
    await assert.rejects(
      validate(RegisterSummativeCandidateDto, {
        enrollmentId: "enrollment-a",
        [forbiddenField]: "attacker-controlled",
      }),
      forbiddenField,
    );
  }
});

test("marking route IDs support repository human-readable IDs and reject unsafe shapes", async () => {
  const course = await validate(
    ExaminerMarkingCourseIdParamDto,
    { examinationCourseId: "exam-course_a" },
    "param",
  );
  assert.equal(course.examinationCourseId, "exam-course_a");
  const candidate = await validate(
    ExaminerMarkingCandidateIdParamDto,
    {
      examinationCourseId: "exam-course_a",
      candidateId: "candidate-script_001",
    },
    "param",
  );
  assert.equal(candidate.candidateId, "candidate-script_001");
  const question = await validate(
    ExaminerQuestionMarkIdParamDto,
    {
      examinationCourseId: "exam-course_a",
      candidateId: "candidate-script_001",
      questionItemId: "question-item_01",
    },
    "param",
  );
  assert.equal(question.questionItemId, "question-item_01");
  for (const badId of ["ab", "bad id", "../bad", "x".repeat(129)]) {
    await assert.rejects(
      validate(
        ExaminerQuestionMarkIdParamDto,
        {
          examinationCourseId: "exam-course_a",
          candidateId: "candidate-script_001",
          questionItemId: badId,
        },
        "param",
      ),
    );
  }
});
