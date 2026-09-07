import "reflect-metadata";

import assert from "node:assert/strict";
import test from "node:test";

import { ValidationPipe } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { UpdateCourseOutlineStructuredContentDto } from "./update-course-outline-structured-content.dto";

async function errors(input: unknown) {
  return validate(
    plainToInstance(UpdateCourseOutlineStructuredContentDto, input),
  );
}

test("DTO requires at least one supplied section but accepts supplied empty array", async () => {
  assert.notEqual((await errors({})).length, 0);
  assert.equal((await errors({ topicPlans: [] })).length, 0);
  assert.equal((await errors({ supplementalResources: [] })).length, 0);
  assert.equal((await errors({ assessmentSchedule: [] })).length, 0);
});

test("DTO rejects duplicate topic, CLO-within-topic, and assessment component IDs", async () => {
  for (const input of [
    {
      topicPlans: [
        { syllabusContentTopicId: "topic-a", courseLearningOutcomeIds: [] },
        { syllabusContentTopicId: "topic-a", courseLearningOutcomeIds: [] },
      ],
    },
    {
      topicPlans: [
        {
          syllabusContentTopicId: "topic-a",
          courseLearningOutcomeIds: ["clo-a", "clo-a"],
        },
      ],
    },
    {
      assessmentSchedule: [
        { assessmentTemplateComponentId: "component-a" },
        { assessmentTemplateComponentId: "component-a" },
      ],
    },
  ]) {
    assert.notEqual((await errors(input)).length, 0);
  }
});

test("DTO performs nested validation and rejects missing nested requirements", async () => {
  for (const input of [
    { topicPlans: [{}] },
    { supplementalResources: [{ resourceTypeCode: "BOOK" }] },
    { assessmentSchedule: [{}] },
  ]) {
    const result = await errors(input);
    assert.equal(result.length, 1);
    assert.ok(result[0]?.children?.length);
  }
});

test("DTO trims required strings and rejects whitespace-only values", async () => {
  for (const input of [
    {
      topicPlans: [
        { syllabusContentTopicId: "   ", courseLearningOutcomeIds: [] },
      ],
    },
    {
      topicPlans: [
        {
          syllabusContentTopicId: "topic-a",
          courseLearningOutcomeIds: ["   "],
        },
      ],
    },
    {
      supplementalResources: [
        { resourceTypeCode: "   ", citationText: "citation" },
      ],
    },
    {
      supplementalResources: [
        { resourceTypeCode: "BOOK", citationText: "   " },
      ],
    },
    {
      assessmentSchedule: [
        { assessmentTemplateComponentId: "   " },
      ],
    },
  ]) {
    assert.notEqual((await errors(input)).length, 0);
  }
});

test("DTO enforces positive SmallInt-compatible week and strict ISO date", async () => {
  for (const plannedWeekNumber of [0, -1, 32_768, 1.5]) {
    assert.notEqual(
      (
        await errors({
          assessmentSchedule: [
            {
              assessmentTemplateComponentId: "component-a",
              plannedWeekNumber,
            },
          ],
        })
      ).length,
      0,
    );
  }
  assert.notEqual(
    (
      await errors({
        assessmentSchedule: [
          {
            assessmentTemplateComponentId: "component-a",
            scheduledAt: "September 5, 2026",
          },
        ],
      })
    ).length,
    0,
  );
  assert.equal(
    (
      await errors({
        assessmentSchedule: [
          {
            assessmentTemplateComponentId: "component-a",
            plannedWeekNumber: 32_767,
            scheduledAt: "2026-09-05T12:00:00.000Z",
          },
        ],
      })
    ).length,
    0,
  );
});

test("DTO applies safe string and collection bounds", async () => {
  assert.notEqual(
    (
      await errors({
        supplementalResources: [
          {
            resourceTypeCode: "x".repeat(65),
            citationText: "x".repeat(1_001),
          },
        ],
      })
    ).length,
    0,
  );
  assert.notEqual(
    (
      await errors({
        topicPlans: [
          {
            syllabusContentTopicId: "x".repeat(192),
            courseLearningOutcomeIds: [],
          },
        ],
      })
    ).length,
    0,
  );
});

test("strict whitelist rejects client authority, scope, lifecycle, and version fields", async () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  for (const field of [
    "departmentId",
    "courseOfferingId",
    "courseOutlineVersionId",
    "actorUserId",
    "status",
    "versionNumber",
    "curriculumCourseId",
    "syllabusVersionId",
    "assessmentTemplateId",
  ]) {
    await assert.rejects(
      pipe.transform(
        { topicPlans: [], [field]: "attacker" },
        {
          type: "body",
          metatype: UpdateCourseOutlineStructuredContentDto,
        },
      ),
    );
  }
});

test("valid nested structured content is normalized and accepted", async () => {
  const dto = plainToInstance(UpdateCourseOutlineStructuredContentDto, {
    topicPlans: [
      {
        syllabusContentTopicId: " topic-a ",
        courseLearningOutcomeIds: ["clo-a"],
        assessmentTechnique: " exam ",
      },
    ],
    supplementalResources: [
      { resourceTypeCode: " BOOK ", citationText: " Citation " },
    ],
    assessmentSchedule: [
      {
        assessmentTemplateComponentId: " component-a ",
        plannedWeekNumber: 18,
        scheduledAt: "2026-09-05T12:00:00.000Z",
        notes: " note ",
      },
    ],
  });
  assert.equal((await validate(dto)).length, 0);
  assert.equal(dto.topicPlans?.[0]?.syllabusContentTopicId, "topic-a");
  assert.equal(dto.supplementalResources?.[0]?.citationText, "Citation");
  assert.equal(
    dto.assessmentSchedule?.[0]?.assessmentTemplateComponentId,
    "component-a",
  );
});
