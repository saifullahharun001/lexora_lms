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

import { ACADEMIC_POLICY_NAMES } from "../../domain/academic.policy-names";
import { BatchCoordinatorAssignmentsController } from "./batch-coordinator-assignments.controller";

test("Batch Coordinator assignment routes all require authentication, PolicyGuard, and the dedicated policy", () => {
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, BatchCoordinatorAssignmentsController),
    "batch-coordinator-assignments",
  );
  assert.deepEqual(
    Reflect.getMetadata(GUARDS_METADATA, BatchCoordinatorAssignmentsController),
    [AuthGuard, PolicyGuard],
  );

  const prototype = BatchCoordinatorAssignmentsController.prototype;
  const routes = [
    ["create", "/", RequestMethod.POST],
    ["list", "/", RequestMethod.GET],
    ["getById", ":id", RequestMethod.GET],
    ["update", ":id", RequestMethod.PATCH],
    ["unassign", ":id/unassign", RequestMethod.POST],
    ["reactivate", ":id/reactivate", RequestMethod.POST],
    ["archive", ":id/archive", RequestMethod.POST],
  ] as const;
  for (const [method, path, requestMethod] of routes) {
    const handler = prototype[method];
    assert.equal(Reflect.getMetadata(PATH_METADATA, handler), path);
    assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), requestMethod);
    assert.equal(
      Reflect.getMetadata(REQUIRE_POLICY_KEY, handler),
      ACADEMIC_POLICY_NAMES.BATCH_COORDINATOR_ASSIGNMENT_MANAGE,
    );
  }
});

test("controller forwards only validated bodies, query filters, and route assignment identity", async () => {
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
  const controller = new BatchCoordinatorAssignmentsController(
    service as never,
  );
  const create = {
    studentBatchId: "batch-a",
    academicTermId: "term-a",
    coordinatorUserId: "user-a",
  };
  await controller.create(create);
  await controller.list({ studentBatchId: "batch-a" });
  await controller.getById({ id: "assignment-a" });
  await controller.update({ id: "assignment-a" }, { expiresAt: null });
  await controller.unassign({ id: "assignment-a" });
  await controller.reactivate({ id: "assignment-a" }, { expiresAt: null });
  await controller.archive({ id: "assignment-a" });

  assert.deepEqual(calls, [
    ["create", create],
    ["list", { studentBatchId: "batch-a" }],
    ["getById", "assignment-a"],
    ["update", "assignment-a", { expiresAt: null }],
    ["unassign", "assignment-a"],
    ["reactivate", "assignment-a", { expiresAt: null }],
    ["archive", "assignment-a"],
  ]);
});
