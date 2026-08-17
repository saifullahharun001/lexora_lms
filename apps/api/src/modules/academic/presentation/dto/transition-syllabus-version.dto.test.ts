import assert from "node:assert/strict";
import test from "node:test";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { TransitionSyllabusVersionDto } from "./transition-syllabus-version.dto";

test("syllabus transition metadata accepts and trims a valid reason", async () => {
  const dto = plainToInstance(TransitionSyllabusVersionDto, {
    reason: "  Formal syllabus review completed  ",
  });

  assert.equal((await validate(dto)).length, 0);
  assert.equal(dto.reason, "Formal syllabus review completed");
});

test("syllabus transition metadata rejects missing, whitespace, and excessive reasons", async () => {
  for (const input of [{}, { reason: "   " }, { reason: "r".repeat(1001) }]) {
    const dto = plainToInstance(TransitionSyllabusVersionDto, input);
    assert.ok((await validate(dto)).length > 0);
  }
});

test("syllabus lifecycle timestamps, status, department, and approvalReference are non-whitelisted", async () => {
  for (const field of [
    "status",
    "approvedAt",
    "archivedAt",
    "transitionAt",
    "departmentId",
    "approvalReference",
  ]) {
    const dto = plainToInstance(TransitionSyllabusVersionDto, {
      reason: "Approved",
      [field]: "attacker-value",
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    assert.ok(errors.some((error) => error.property === field));
  }
});
