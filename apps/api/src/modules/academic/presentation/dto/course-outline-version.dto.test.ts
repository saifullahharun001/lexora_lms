import "reflect-metadata";

import assert from "node:assert/strict";
import test from "node:test";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { CreateCourseOutlineVersionDto } from "./create-course-outline-version.dto";
import { UpdateCourseOutlineVersionDto } from "./update-course-outline-version.dto";

const fields = [
  "courseSummary",
  "deliveryPlan",
  "teachingStrategies",
  "assessmentStrategy",
  "evaluationPolicy",
  "makeUpProcedure",
] as const;

test("all six Teacher-owned narratives trim and whitespace-only values normalize to null", async () => {
  const dto = plainToInstance(CreateCourseOutlineVersionDto, {
    courseSummary: "  Summary  ",
    deliveryPlan: "\tDelivery\n",
    teachingStrategies: "   ",
    assessmentStrategy: " Assessment ",
    evaluationPolicy: "\n",
    makeUpProcedure: " Make-up ",
  });

  assert.deepEqual(
    fields.map((field) => dto[field]),
    ["Summary", "Delivery", null, "Assessment", null, "Make-up"],
  );
  assert.equal((await validate(dto)).length, 0);
});

test("Course Outline narratives are optional strings bounded to 10000 characters", async () => {
  assert.equal(
    (await validate(plainToInstance(CreateCourseOutlineVersionDto, {}))).length,
    0,
  );
  assert.equal(
    (
      await validate(
        plainToInstance(UpdateCourseOutlineVersionDto, {
          courseSummary: "x".repeat(10_000),
        }),
      )
    ).length,
    0,
  );
  for (const value of [123, {}, [], "x".repeat(10_001)]) {
    assert.ok(
      (
        await validate(
          plainToInstance(UpdateCourseOutlineVersionDto, {
            courseSummary: value,
          }),
        )
      ).length > 0,
    );
  }
});

test("server identity, lifecycle, canonical syllabus, CLO/PLO, and generic content inputs are forbidden", async () => {
  const forbiddenFields = [
    "departmentId",
    "courseOfferingId",
    "curriculumCourseId",
    "syllabusVersionId",
    "versionNumber",
    "status",
    "submittedAt",
    "approvedAt",
    "activatedAt",
    "archivedAt",
    "createdAt",
    "updatedAt",
    "teacherUserId",
    "cloId",
    "ploId",
    "cloText",
    "ploText",
    "weeklyPlan",
    "lessonPlan",
    "content",
    "objectives",
    "prerequisite",
    "textbooks",
    "references",
    "metadata",
  ];

  for (const Dto of [
    CreateCourseOutlineVersionDto,
    UpdateCourseOutlineVersionDto,
  ]) {
    const dto = plainToInstance(Dto, {
      courseSummary: "Allowed",
      ...Object.fromEntries(forbiddenFields.map((field) => [field, "forged"])),
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    assert.deepEqual(
      errors
        .filter((error) => forbiddenFields.includes(error.property))
        .map((error) => error.property)
        .sort(),
      [...forbiddenFields].sort(),
    );
  }
});
