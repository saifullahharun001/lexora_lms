import assert from "node:assert/strict";
import test from "node:test";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { BindCourseOfferingStudentBatchDto } from "./bind-course-offering-student-batch.dto";

async function validateValue(value: unknown, includeField = true) {
  const body = includeField ? { studentBatchId: value } : {};
  const dto = plainToInstance(BindCourseOfferingStudentBatchDto, body);
  return { dto, errors: await validate(dto) };
}

test("valid StudentBatch IDs are accepted and trimmed", async () => {
  const result = await validateValue("  batch-a \t");
  assert.equal(result.errors.length, 0);
  assert.equal(result.dto.studentBatchId, "batch-a");
});

test("DTO exposes only StudentBatch ID and rejects invalid targets without coercion", async () => {
  assert.deepEqual(
    Object.keys(
      plainToInstance(BindCourseOfferingStudentBatchDto, {
        studentBatchId: "batch-a",
      }),
    ),
    ["studentBatchId"],
  );

  for (const value of ["", "   ", 123, ["batch-a"], { id: "batch-a" }, null]) {
    const result = await validateValue(value);
    assert.ok(
      result.errors.length > 0,
      `expected rejection for ${String(value)}`,
    );
    if (typeof value !== "string")
      assert.deepEqual(result.dto.studentBatchId, value);
  }

  assert.ok((await validateValue(undefined, false)).errors.length > 0);

  const extra = plainToInstance(BindCourseOfferingStudentBatchDto, {
    studentBatchId: "batch-a",
    departmentId: "department-forged",
  });
  assert.ok(
    (
      await validate(extra, {
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    ).length > 0,
  );
});
