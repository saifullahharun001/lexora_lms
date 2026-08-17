import assert from "node:assert/strict";
import test from "node:test";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { BindCourseOfferingSyllabusDto } from "./bind-course-offering-syllabus.dto";

async function validateValue(value: unknown, includeField = true) {
  const body = includeField ? { syllabusVersionId: value } : {};
  const dto = plainToInstance(BindCourseOfferingSyllabusDto, body);
  return { dto, errors: await validate(dto) };
}

test("valid syllabus version IDs are accepted and trimmed", async () => {
  const plain = await validateValue("syllabus-a");
  assert.equal(plain.errors.length, 0);
  assert.equal(plain.dto.syllabusVersionId, "syllabus-a");

  const trimmed = await validateValue("  syllabus-a \t");
  assert.equal(trimmed.errors.length, 0);
  assert.equal(trimmed.dto.syllabusVersionId, "syllabus-a");
});

test("empty, whitespace-only, non-string, null, and missing IDs are rejected without coercion", async () => {
  for (const value of ["", "   ", 123, ["syllabus-a"], { id: "a" }, null]) {
    const result = await validateValue(value);
    assert.ok(
      result.errors.length > 0,
      `expected rejection for ${String(value)}`,
    );
    if (typeof value !== "string") {
      assert.deepEqual(result.dto.syllabusVersionId, value);
    }
  }

  const missing = await validateValue(undefined, false);
  assert.ok(missing.errors.length > 0);
});
