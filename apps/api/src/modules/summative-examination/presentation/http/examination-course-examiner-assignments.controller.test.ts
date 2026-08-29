import assert from "node:assert/strict";
import test from "node:test";

import { RequestMethod } from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";

import { REQUIRE_POLICY_KEY } from "@/modules/authorization/domain/authorization.constants";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";

import { SUMMATIVE_EXAMINATION_POLICY_NAMES } from "../../domain/summative-examination.policy-names";
import { ExaminationCourseExaminerAssignmentsController } from "./examination-course-examiner-assignments.controller";

test("Examiner assignment routes require exact authentication and management policy", () => {
  assert.equal(
    Reflect.getMetadata(
      PATH_METADATA,
      ExaminationCourseExaminerAssignmentsController,
    ),
    "summative-examination-examiner-assignments",
  );
  assert.deepEqual(
    Reflect.getMetadata(
      GUARDS_METADATA,
      ExaminationCourseExaminerAssignmentsController,
    ),
    [AuthGuard, PolicyGuard],
  );
  const prototype = ExaminationCourseExaminerAssignmentsController.prototype;
  for (const [method, path, requestMethod] of [
    ["assign", "examination-course/:examinationCourseId", RequestMethod.POST],
    ["listHistory", "examination-course/:examinationCourseId", RequestMethod.GET],
    ["getById", ":assignmentId", RequestMethod.GET],
    ["unassign", ":assignmentId/unassign", RequestMethod.POST],
    ["reactivate", ":assignmentId/reactivate", RequestMethod.POST],
    ["updateExpiry", ":assignmentId/expiry", RequestMethod.PATCH],
    ["archive", ":assignmentId/archive", RequestMethod.POST],
  ] as const) {
    const handler = prototype[method];
    assert.equal(Reflect.getMetadata(PATH_METADATA, handler), path);
    assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), requestMethod);
    assert.equal(
      Reflect.getMetadata(REQUIRE_POLICY_KEY, handler),
      SUMMATIVE_EXAMINATION_POLICY_NAMES.EXAMINER_ASSIGNMENT_MANAGE,
    );
  }
});

test("routes forward only direct object identifiers and validated assignment input", async () => {
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
  const controller = new ExaminationCourseExaminerAssignmentsController(
    service as never,
  );
  await controller.assign(
    { examinationCourseId: "exam-course-a" },
    { assignedUserId: "user-a", seat: "FIRST_EXAMINER" },
  );
  await controller.updateExpiry(
    { assignmentId: "assignment-a" },
    { expiresAt: "2027-01-01T00:00:00.000Z" },
  );
  assert.deepEqual(calls, [
    [
      "assign",
      "exam-course-a",
      { assignedUserId: "user-a", seat: "FIRST_EXAMINER" },
    ],
    ["updateExpiry", "assignment-a", "2027-01-01T00:00:00.000Z"],
  ]);
});
