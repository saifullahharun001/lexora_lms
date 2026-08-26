import assert from "node:assert/strict";
import test from "node:test";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { ReturnCourseOutlineForCorrectionDto } from "./return-course-outline-for-correction.dto";

test("return-for-correction dto accepts and trims a valid correction reason", async () => {
  const dto = plainToInstance(ReturnCourseOutlineForCorrectionDto, {
    reason: "  Missing assessment strategy details.  ",
  });

  assert.equal((await validate(dto)).length, 0);
  assert.equal(dto.reason, "Missing assessment strategy details.");
});

test("return-for-correction dto rejects missing, non-string, whitespace, and excessive reasons", async () => {
  for (const input of [
    {},
    { reason: 123 },
    { reason: ["array"] },
    { reason: { obj: "ect" } },
    { reason: "   " },
    { reason: "r".repeat(1001) }
  ]) {
    const dto = plainToInstance(ReturnCourseOutlineForCorrectionDto, input);
    assert.ok((await validate(dto)).length > 0);
  }
});
