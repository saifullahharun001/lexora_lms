import assert from "node:assert/strict";
import test from "node:test";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { BindCourseOfferingCurriculumDto } from "./bind-course-offering-curriculum.dto";

async function validateValue(value: unknown, includeField = true) {
  const body = includeField ? { curriculumCourseId: value } : {};
  const dto = plainToInstance(BindCourseOfferingCurriculumDto, body);
  return { dto, errors: await validate(dto) };
}

test("valid curriculum course IDs are accepted and surrounding whitespace is trimmed", async () => {
  const plain = await validateValue("curriculum-a");
  assert.equal(plain.errors.length, 0);
  assert.equal(plain.dto.curriculumCourseId, "curriculum-a");

  const trimmed = await validateValue("  curriculum-a \t");
  assert.equal(trimmed.errors.length, 0);
  assert.equal(trimmed.dto.curriculumCourseId, "curriculum-a");
});

test("empty, whitespace-only, non-string, null, and missing IDs are rejected without coercion", async () => {
  for (const value of ["", "   ", 123, ["curriculum-a"], { id: "a" }, null]) {
    const result = await validateValue(value);
    assert.ok(result.errors.length > 0, `expected rejection for ${String(value)}`);
    if (typeof value !== "string") {
      assert.deepEqual(result.dto.curriculumCourseId, value);
    }
  }

  const missing = await validateValue(undefined, false);
  assert.ok(missing.errors.length > 0);
});
