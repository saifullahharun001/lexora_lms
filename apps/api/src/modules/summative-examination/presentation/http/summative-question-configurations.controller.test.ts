import assert from "node:assert/strict";
import test from "node:test";

import { RequestMethod } from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  VERSION_METADATA,
} from "@nestjs/common/constants";

import { REQUIRE_POLICY_KEY } from "@/modules/authorization/domain/authorization.constants";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";

import { SUMMATIVE_EXAMINATION_POLICY_NAMES } from "../../domain/summative-examination.policy-names";
import {
  AddQuestionConfigurationItemDto,
  UpdateQuestionConfigurationItemDto,
} from "./dto/question-configuration.dto";
import { SummativeQuestionConfigurationsController } from "./summative-question-configurations.controller";

const routes = [
  ["createDraftConfiguration", "/", RequestMethod.POST],
  ["getConfigurations", "/", RequestMethod.GET],
  ["getConfiguration", ":configurationId", RequestMethod.GET],
  ["addItem", ":configurationId/items", RequestMethod.POST],
  [
    "updateItem",
    ":configurationId/items/:itemId",
    RequestMethod.PATCH,
  ],
  ["lockConfiguration", ":configurationId/lock", RequestMethod.POST],
  ["archiveConfiguration", ":configurationId/archive", RequestMethod.POST],
] as const;

test("Question Configuration controller is versioned and guarded by exact setup policy", () => {
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, SummativeQuestionConfigurationsController),
    "summative/examination-courses/:examinationCourseId/question-configurations",
  );
  assert.equal(
    Reflect.getMetadata(
      VERSION_METADATA,
      SummativeQuestionConfigurationsController,
    ),
    "1",
  );
  assert.deepEqual(
    Reflect.getMetadata(
      GUARDS_METADATA,
      SummativeQuestionConfigurationsController,
    ),
    [AuthGuard, PolicyGuard],
  );
  assert.equal(
    Reflect.getMetadata(
      REQUIRE_POLICY_KEY,
      SummativeQuestionConfigurationsController,
    ),
    SUMMATIVE_EXAMINATION_POLICY_NAMES.SETUP_MANAGE,
  );

  const prototype = SummativeQuestionConfigurationsController.prototype;
  for (const [method, path, requestMethod] of routes) {
    const handler = prototype[method];
    const actualPath = Reflect.getMetadata(PATH_METADATA, handler);
    assert.ok(
      actualPath === path || (path === "/" && actualPath === undefined),
    );
    assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), requestMethod);
  }
});

test("nested route IDs and validated item DTOs are forwarded exactly", async () => {
  const calls: unknown[] = [];
  const service = new Proxy(
    {},
    {
      get:
        (_target, property) =>
        async (...args: unknown[]) => {
          calls.push([property, ...args]);
          return args;
        },
    },
  );
  const controller = new SummativeQuestionConfigurationsController(
    service as never,
  );
  const course = { examinationCourseId: "exam-course-a" };
  const config = { ...course, configurationId: "config-a" };
  const item = { ...config, itemId: "item-a" };
  const addDto = Object.assign(new AddQuestionConfigurationItemDto(), {
    questionLabel: "Q1",
    displayOrder: 1,
    fullMark: "10",
    isRequired: true,
    isActive: true,
  });
  const updateDto = Object.assign(new UpdateQuestionConfigurationItemDto(), {
    questionLabel: "Q1 revised",
  });

  const callerControlledItemFields = [
    "bloomLevel",
    "cloId",
    "displayOrder",
    "fullMark",
    "isActive",
    "isRequired",
    "questionLabel",
    "subQuestionLabel",
  ];
  assert.deepEqual(Object.keys(addDto).sort(), callerControlledItemFields);
  assert.deepEqual(Object.keys(updateDto).sort(), callerControlledItemFields);

  const forbiddenAuthoritativeFields = [
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
    "questionText",
    "questionPaper",
    "examinerMark",
    "candidateMark",
  ];
  for (const body of [addDto, updateDto]) {
    for (const field of forbiddenAuthoritativeFields) {
      assert.equal(Object.hasOwn(body, field), false, field);
    }
  }

  await controller.createDraftConfiguration(course);
  await controller.getConfigurations(course);
  await controller.getConfiguration(config);
  await controller.addItem(config, addDto);
  await controller.updateItem(item, updateDto);
  await controller.lockConfiguration(config);
  await controller.archiveConfiguration(config);

  assert.deepEqual(calls, [
    ["createDraftConfiguration", "exam-course-a"],
    ["getConfigurations", "exam-course-a"],
    ["getConfiguration", "exam-course-a", "config-a"],
    ["addItem", "exam-course-a", "config-a", addDto],
    ["updateItem", "exam-course-a", "config-a", "item-a", updateDto],
    ["lockConfiguration", "exam-course-a", "config-a"],
    ["archiveConfiguration", "exam-course-a", "config-a"],
  ]);
});

test("Question Configuration exposes no delete, unlock, or question-content API", () => {
  const prototype = SummativeQuestionConfigurationsController.prototype;
  const handlers = Object.getOwnPropertyNames(prototype).filter(
    (name) => name !== "constructor",
  );
  assert.deepEqual(handlers.sort(), routes.map(([name]) => name).sort());
  for (const handlerName of handlers) {
    const handler = (prototype as unknown as Record<string, object>)[
      handlerName
    ]!;
    assert.notEqual(
      Reflect.getMetadata(METHOD_METADATA, handler),
      RequestMethod.DELETE,
    );
    assert.doesNotMatch(
      String(Reflect.getMetadata(PATH_METADATA, handler) ?? ""),
      /unlock|question-text|question-paper|prompt/i,
    );
  }
});
