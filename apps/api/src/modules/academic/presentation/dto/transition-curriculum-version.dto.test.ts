import assert from "node:assert/strict";
import test from "node:test";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { TransitionCurriculumVersionDto } from "./transition-curriculum-version.dto";

test("transition metadata accepts and trims a valid reason", async () => {
  const dto = plainToInstance(TransitionCurriculumVersionDto, {
    reason: "  Formal curriculum review completed  ",
  });

  assert.equal((await validate(dto)).length, 0);
  assert.equal(dto.reason, "Formal curriculum review completed");
});

test("transition metadata rejects a whitespace-only reason", async () => {
  const dto = plainToInstance(TransitionCurriculumVersionDto, { reason: "   " });

  assert.ok((await validate(dto)).length > 0);
});

test("optional approvalReference is trimmed and whitespace-only input is rejected", async () => {
  const valid = plainToInstance(TransitionCurriculumVersionDto, {
    reason: "Approved by authority",
    approvalReference: "  Ordinance-2026-17  ",
  });
  assert.equal((await validate(valid)).length, 0);
  assert.equal(valid.approvalReference, "Ordinance-2026-17");

  const invalid = plainToInstance(TransitionCurriculumVersionDto, {
    reason: "Approved by authority",
    approvalReference: "   ",
  });
  assert.ok((await validate(invalid)).length > 0);
});

test("transition metadata rejects excessive lengths", async () => {
  const excessiveReason = plainToInstance(TransitionCurriculumVersionDto, {
    reason: "r".repeat(1001),
  });
  assert.ok((await validate(excessiveReason)).length > 0);

  const excessiveReference = plainToInstance(TransitionCurriculumVersionDto, {
    reason: "Approved by authority",
    approvalReference: "a".repeat(256),
  });
  assert.ok((await validate(excessiveReference)).length > 0);
});
