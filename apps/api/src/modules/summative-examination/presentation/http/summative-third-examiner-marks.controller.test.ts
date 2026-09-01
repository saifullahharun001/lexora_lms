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
import { SummativeThirdExaminerMarksController } from "./summative-third-examiner-marks.controller";

const routes = [
  ["getWorkspace", "/", RequestMethod.GET],
  ["getOwnSubmission", "candidates/:candidateId/submission", RequestMethod.GET],
  [
    "saveQuestionMark",
    "candidates/:candidateId/questions/:questionItemId/mark",
    RequestMethod.PATCH,
  ],
  ["finalizeSubmission", "candidates/:candidateId/submit", RequestMethod.POST],
] as const;

test("Third marking controller is guarded by exact Examiner marks policy", () => {
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, SummativeThirdExaminerMarksController),
    "summative/examination-courses/:examinationCourseId/third-marking-workspace",
  );
  assert.equal(
    Reflect.getMetadata(VERSION_METADATA, SummativeThirdExaminerMarksController),
    "1",
  );
  assert.deepEqual(
    Reflect.getMetadata(GUARDS_METADATA, SummativeThirdExaminerMarksController),
    [AuthGuard, PolicyGuard],
  );
  assert.equal(
    Reflect.getMetadata(REQUIRE_POLICY_KEY, SummativeThirdExaminerMarksController),
    SUMMATIVE_EXAMINATION_POLICY_NAMES.EXAMINER_MARKS_ENTER,
  );
});

test("Third marking controller forwards only nested candidate-scoped identities", async () => {
  const calls: unknown[] = [];
  const service = new Proxy(
    {},
    {
      get: (_target, property) => (...args: unknown[]) => {
        calls.push([property, ...args]);
        return args;
      },
    },
  );
  const controller = new SummativeThirdExaminerMarksController(service as never);
  const course = { examinationCourseId: "course-a" };
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
    ["getWorkspace", "course-a"],
    ["getOwnSubmission", "course-a", "candidate-a"],
    ["saveQuestionMark", "course-a", "candidate-a", "question-a", mark],
    ["finalizeSubmission", "course-a", "candidate-a"],
  ]);
});

test("Third controller exposes no calculation, comparison, approval or result route", () => {
  const prototype = SummativeThirdExaminerMarksController.prototype;
  const handlers = Object.getOwnPropertyNames(prototype).filter(
    (name) => name !== "constructor",
  );
  assert.deepEqual(handlers.sort(), routes.map(([name]) => name).sort());
  for (const [handlerName, path, method] of routes) {
    const handler = prototype[handlerName];
    const actualPath = Reflect.getMetadata(PATH_METADATA, handler);
    assert.ok(actualPath === path || (path === "/" && actualPath === undefined));
    assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), method);
    assert.doesNotMatch(
      `${handlerName}:${String(actualPath ?? "")}`,
      /comparison|calculation|distance|pair|derived|committee|chairman|approved|result/i,
    );
  }
});
