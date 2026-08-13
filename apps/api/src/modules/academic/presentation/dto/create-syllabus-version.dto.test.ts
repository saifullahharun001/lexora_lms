import assert from "node:assert/strict";
import test from "node:test";

import "reflect-metadata";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { CreateSyllabusVersionDto } from "./create-syllabus-version.dto";

test("valid syllabus creation fields are transformed and accepted", async () => {
  const dto = plainToInstance(CreateSyllabusVersionDto, {
    curriculumCourseId: "  curriculum-course-a  ",
    code: "  SYL-1  ",
    versionNumber: "32767",
    effectiveFrom: "2026-09-01T00:00:00.000Z",
    effectiveTo: "2027-06-30T00:00:00.000Z",
  });

  assert.equal(dto.curriculumCourseId, "curriculum-course-a");
  assert.equal(dto.code, "SYL-1");
  assert.equal(dto.versionNumber, 32767);
  assert.ok(dto.effectiveFrom instanceof Date);
  assert.ok(dto.effectiveTo instanceof Date);
  assert.equal((await validate(dto)).length, 0);
});

test("invalid identifiers, code, version number, and dates are rejected", async () => {
  for (const input of [
    { curriculumCourseId: " ", code: "SYL-1", versionNumber: 1 },
    { curriculumCourseId: "course-a", code: " ", versionNumber: 1 },
    { curriculumCourseId: "course-a", code: "SYL-1", versionNumber: 0 },
    { curriculumCourseId: "course-a", code: "SYL-1", versionNumber: 1.5 },
    { curriculumCourseId: "course-a", code: "SYL-1", versionNumber: 32768 },
    {
      curriculumCourseId: "course-a",
      code: "SYL-1",
      versionNumber: 1_000_000_000,
    },
    {
      curriculumCourseId: "course-a",
      code: "SYL-1",
      versionNumber: 1,
      effectiveFrom: "not-a-date",
    },
  ]) {
    const dto = plainToInstance(CreateSyllabusVersionDto, input);
    assert.ok((await validate(dto)).length > 0);
  }
});

test("server-controlled lifecycle and department fields are non-whitelisted", async () => {
  for (const field of ["status", "approvedAt", "archivedAt", "departmentId"]) {
    const dto = plainToInstance(CreateSyllabusVersionDto, {
      curriculumCourseId: "course-a",
      code: "SYL-1",
      versionNumber: 1,
      [field]: field === "status" ? "ACTIVE" : "attacker-value",
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    assert.ok(errors.some((error) => error.property === field));
  }
});
