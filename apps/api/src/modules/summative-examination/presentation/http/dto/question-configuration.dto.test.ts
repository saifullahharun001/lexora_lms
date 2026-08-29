import assert from "node:assert/strict";
import test from "node:test";

import { ArgumentMetadata, ValidationPipe } from "@nestjs/common";

import {
  AddQuestionConfigurationItemDto,
  UpdateQuestionConfigurationItemDto,
} from "./question-configuration.dto";
import {
  QuestionConfigurationCourseIdParamDto,
  QuestionConfigurationIdParamDto,
  QuestionConfigurationItemIdParamDto,
} from "./resource-id-param.dto";

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

function validate<T>(
  metatype: new () => T,
  value: unknown,
  type: ArgumentMetadata["type"] = "body",
) {
  return pipe.transform(value, { type, metatype } as ArgumentMetadata);
}

function validItem(overrides: Record<string, unknown> = {}) {
  return {
    questionLabel: "Q1",
    displayOrder: 1,
    fullMark: "10",
    isRequired: true,
    isActive: true,
    ...overrides,
  };
}

test("item DTO accepts exact decimal strings and normalizes persisted labels", async () => {
  for (const fullMark of ["10", "10.5", "10.50", "0.25", "9999.99"]) {
    const value = await validate(
      AddQuestionConfigurationItemDto,
      validItem({
        questionLabel: "  Q1  ",
        subQuestionLabel: "  (a) ",
        fullMark,
        cloId: "  clo-a  ",
        bloomLevel: "ANALYZING",
      }),
    );
    assert.equal(value.questionLabel, "Q1");
    assert.equal(value.subQuestionLabel, "(a)");
    assert.equal(value.fullMark, fullMark);
    assert.equal(value.cloId, "clo-a");
    assert.equal(value.bloomLevel, "ANALYZING");
  }

  assert.equal(
    (
      await validate(
        AddQuestionConfigurationItemDto,
        validItem({ subQuestionLabel: "   " }),
      )
    ).subQuestionLabel,
    null,
  );
  assert.equal(
    (
      await validate(
        UpdateQuestionConfigurationItemDto,
        { subQuestionLabel: "" },
      )
    ).subQuestionLabel,
    null,
  );
  assert.equal(
    (await validate(UpdateQuestionConfigurationItemDto, { cloId: null }))
      .cloId,
    null,
  );
});

test("item DTO rejects whitespace labels and invalid SMALLINT display orders", async () => {
  for (const questionLabel of ["", "   ", "x".repeat(17), null]) {
    await assert.rejects(
      validate(
        AddQuestionConfigurationItemDto,
        validItem({ questionLabel }),
      ),
    );
  }
  for (const displayOrder of [0, -1, 1.5, 32768, Number.NaN, Infinity]) {
    await assert.rejects(
      validate(
        AddQuestionConfigurationItemDto,
        validItem({ displayOrder }),
      ),
    );
  }
  await assert.rejects(
    validate(
      AddQuestionConfigurationItemDto,
      validItem({ displayOrder: "1" }),
    ),
  );
});

test("item DTO rejects non-exact, non-positive, malformed, and overflowing marks", async () => {
  for (const fullMark of [
    10,
    "",
    "   ",
    "0",
    "0.0",
    "0.00",
    "-1",
    "10.001",
    "10000",
    "9999.999",
    "1e2",
    "NaN",
    "Infinity",
    "-Infinity",
    ".25",
    "10.",
    "ten",
  ]) {
    await assert.rejects(
      validate(AddQuestionConfigurationItemDto, validItem({ fullMark })),
    );
  }
});

test("item DTO rejects malformed CLO/Bloom and authoritative or content injection", async () => {
  for (const cloId of ["x", "   ", "../clo", "clo id", "x".repeat(129)]) {
    await assert.rejects(
      validate(AddQuestionConfigurationItemDto, validItem({ cloId })),
    );
  }
  await assert.rejects(
    validate(
      AddQuestionConfigurationItemDto,
      validItem({ bloomLevel: "SYNTHESIZING" }),
    ),
  );
  await assert.rejects(
    validate(UpdateQuestionConfigurationItemDto, { cloId: "" }),
  );

  for (const field of [
    "departmentId",
    "examinationId",
    "examinationCourseId",
    "configurationId",
    "itemId",
    "curriculumVersionId",
    "curriculumCourseId",
    "versionNumber",
    "status",
    "summativeFullMark",
    "createdByUserId",
    "lockedAt",
    "archivedAt",
    "createdAt",
    "updatedAt",
    "questionText",
    "questionBody",
    "prompt",
    "questionPaper",
    "questionPaperFile",
    "paperFile",
    "setterDraft",
    "moderationContent",
    "answerScript",
    "candidateMark",
    "examinerMark",
    "firstExaminerMark",
    "secondExaminerMark",
    "thirdExaminerMark",
  ]) {
    await assert.rejects(
      validate(AddQuestionConfigurationItemDto, {
        ...validItem(),
        [field]: "injected",
      }),
      `expected ${field} to be rejected on create`,
    );
    await assert.rejects(
      validate(UpdateQuestionConfigurationItemDto, { [field]: "injected" }),
      `expected ${field} to be rejected on update`,
    );
  }
});

test("nested route DTOs reject malformed IDs and accept established string identifiers", async () => {
  assert.equal(
    (
      await validate(
        QuestionConfigurationCourseIdParamDto,
        { examinationCourseId: "exam-course-a" },
        "param",
      )
    ).examinationCourseId,
    "exam-course-a",
  );
  assert.deepEqual(
    await validate(
      QuestionConfigurationItemIdParamDto,
      {
        examinationCourseId: "exam-course-a",
        configurationId: "config-a",
        itemId: "item-a",
      },
      "param",
    ),
    Object.assign(new QuestionConfigurationItemIdParamDto(), {
      examinationCourseId: "exam-course-a",
      configurationId: "config-a",
      itemId: "item-a",
    }),
  );

  for (const [metatype, params] of [
    [QuestionConfigurationCourseIdParamDto, { examinationCourseId: "x" }],
    [
      QuestionConfigurationIdParamDto,
      { examinationCourseId: "exam-course-a", configurationId: "x" },
    ],
    [
      QuestionConfigurationItemIdParamDto,
      {
        examinationCourseId: "exam-course-a",
        configurationId: "config-a",
        itemId: "x",
      },
    ],
  ] as const) {
    await assert.rejects(validate(metatype, params, "param"));
  }

  for (const examinationCourseId of [
    "   ",
    "../foreign",
    "course id",
    "!invalid!",
    "x".repeat(129),
  ]) {
    await assert.rejects(
      validate(
        QuestionConfigurationCourseIdParamDto,
        { examinationCourseId },
        "param",
      ),
    );
  }
});
