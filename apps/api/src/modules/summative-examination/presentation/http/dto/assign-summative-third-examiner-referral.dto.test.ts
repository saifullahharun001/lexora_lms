import assert from "node:assert/strict";
import test from "node:test";

import { type ArgumentMetadata, ValidationPipe } from "@nestjs/common";

import { AssignSummativeThirdExaminerReferralDto } from "./assign-summative-third-examiner-referral.dto";

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

function validate(value: unknown) {
  return pipe.transform(value, {
    type: "body",
    metatype: AssignSummativeThirdExaminerReferralDto,
  } as ArgumentMetadata);
}

const validRequest = {
  comparisonId: "cmtjkj11m007s2ishd7zuugou",
  thirdExaminerUserId: "teacher-third-a",
  deadline: "2099-01-01T00:00:00.000Z",
};

test("realistic CUID comparison ID is accepted and ISO deadline becomes Date", async () => {
  const dto = await validate(validRequest);

  assert.equal(dto.comparisonId, "cmtjkj11m007s2ishd7zuugou");
  assert.ok(dto.deadline instanceof Date);
  assert.equal(dto.deadline.toISOString(), validRequest.deadline);
});

test("valid custom Lexora comparison ID is accepted", async () => {
  const dto = await validate({
    ...validRequest,
    comparisonId: "comparison_2026-A",
  });

  assert.equal(dto.comparisonId, "comparison_2026-A");
});

test("comparison IDs containing spaces or path characters are rejected", async () => {
  for (const comparisonId of [
    "comparison with spaces",
    "comparison/path",
    "comparison\\path",
    "../comparison",
  ]) {
    await assert.rejects(validate({ ...validRequest, comparisonId }));
  }
});

test("invalid deadline input is rejected", async () => {
  await assert.rejects(
    validate({
      ...validRequest,
      deadline: "not-an-iso-date",
    }),
  );
});
