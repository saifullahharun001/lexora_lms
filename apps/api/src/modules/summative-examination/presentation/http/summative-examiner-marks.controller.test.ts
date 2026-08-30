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
import { SaveExaminerQuestionMarkDto } from "./dto/examiner-marks.dto";
import { SummativeExaminerMarksController } from "./summative-examiner-marks.controller";

const routes = [
  ["getWorkspace", "/", RequestMethod.GET],
  [
    "getOwnSubmission",
    "candidates/:candidateId/submission",
    RequestMethod.GET,
  ],
  [
    "saveQuestionMark",
    "candidates/:candidateId/questions/:questionItemId/mark",
    RequestMethod.PATCH,
  ],
  [
    "finalizeSubmission",
    "candidates/:candidateId/submit",
    RequestMethod.POST,
  ],
] as const;

test("Examiner marks controller is v1 and requires AuthGuard, PolicyGuard and the exact marks policy", () => {
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, SummativeExaminerMarksController),
    "summative/examination-courses/:examinationCourseId/marking-workspace",
  );
  assert.equal(
    Reflect.getMetadata(VERSION_METADATA, SummativeExaminerMarksController),
    "1",
  );
  assert.deepEqual(
    Reflect.getMetadata(GUARDS_METADATA, SummativeExaminerMarksController),
    [AuthGuard, PolicyGuard],
  );
  assert.equal(
    Reflect.getMetadata(REQUIRE_POLICY_KEY, SummativeExaminerMarksController),
    SUMMATIVE_EXAMINATION_POLICY_NAMES.EXAMINER_MARKS_ENTER,
  );
  const prototype = SummativeExaminerMarksController.prototype;
  for (const [handlerName, path, requestMethod] of routes) {
    const handler = prototype[handlerName];
    const actualPath = Reflect.getMetadata(PATH_METADATA, handler);
    assert.ok(actualPath === path || (path === "/" && actualPath === undefined));
    assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), requestMethod);
  }
});

test("nested route identities and only validated mark DTOs are forwarded", async () => {
  const calls: unknown[] = [];
  const service = new Proxy(
    {},
    {
      get:
        (_target, property) =>
        (...args: unknown[]) => {
          calls.push([property, ...args]);
          return args;
        },
    },
  );
  const controller = new SummativeExaminerMarksController(service as never);
  const course = { examinationCourseId: "exam-course-a" };
  const candidate = { ...course, candidateId: "candidate-a" };
  const question = { ...candidate, questionItemId: "question-a" };
  const mark = Object.assign(new SaveExaminerQuestionMarkDto(), {
    awardedMark: "0.00",
  });
  await controller.getWorkspace(course);
  await controller.getOwnSubmission(candidate);
  await controller.saveQuestionMark(question, mark);
  await controller.finalizeSubmission(candidate);

  assert.deepEqual(calls, [
    ["getWorkspace", "exam-course-a"],
    ["getOwnSubmission", "exam-course-a", "candidate-a"],
    [
      "saveQuestionMark",
      "exam-course-a",
      "candidate-a",
      "question-a",
      mark,
    ],
    ["finalizeSubmission", "exam-course-a", "candidate-a"],
  ]);
});

test("controller exposes no foreign-submission, comparison, unlock, delete, Third, committee or result route", () => {
  const prototype = SummativeExaminerMarksController.prototype;
  const handlers = Object.getOwnPropertyNames(prototype).filter(
    (name) => name !== "constructor",
  );
  assert.deepEqual(handlers.sort(), routes.map(([name]) => name).sort());
  for (const handlerName of handlers) {
    const handler = (prototype as unknown as Record<string, object>)[handlerName]!;
    assert.notEqual(
      Reflect.getMetadata(METHOD_METADATA, handler),
      RequestMethod.DELETE,
    );
    assert.doesNotMatch(
      `${handlerName}:${String(Reflect.getMetadata(PATH_METADATA, handler) ?? "")}`,
      /submissionId|assignmentId|other|compare|variance|third|unlock|reopen|committee|chairman|result|handoff/i,
    );
  }
});
