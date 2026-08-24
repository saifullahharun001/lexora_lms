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
import { AcademicSessionsController } from "./academic-sessions.controller";
import { StudentBatchesController } from "./student-batches.controller";

function routeMetadata(
  controller: object,
  method: string,
): { path: string | undefined; requestMethod: RequestMethod | undefined } {
  const handler = (controller as Record<string, unknown>)[method];
  return {
    path: Reflect.getMetadata(PATH_METADATA, handler as object),
    requestMethod: Reflect.getMetadata(METHOD_METADATA, handler as object),
  };
}

test("AcademicSession controller exposes exact guarded CRUD routes and policies", () => {
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, AcademicSessionsController),
    "academic-sessions",
  );
  assert.deepEqual(
    Reflect.getMetadata(GUARDS_METADATA, AcademicSessionsController),
    [AuthGuard, PolicyGuard],
  );
  const prototype = AcademicSessionsController.prototype;
  const cases = [
    [
      "create",
      "/",
      RequestMethod.POST,
      ACADEMIC_POLICY_NAMES.ACADEMIC_SESSION_MANAGE,
    ],
    [
      "list",
      "/",
      RequestMethod.GET,
      ACADEMIC_POLICY_NAMES.ACADEMIC_SESSION_READ,
    ],
    [
      "getById",
      ":id",
      RequestMethod.GET,
      ACADEMIC_POLICY_NAMES.ACADEMIC_SESSION_READ,
    ],
    [
      "update",
      ":id",
      RequestMethod.PATCH,
      ACADEMIC_POLICY_NAMES.ACADEMIC_SESSION_MANAGE,
    ],
  ] as const;
  for (const [method, path, requestMethod, policy] of cases) {
    assert.deepEqual(routeMetadata(prototype, method), { path, requestMethod });
    assert.equal(
      Reflect.getMetadata(
        REQUIRE_POLICY_KEY,
        prototype[method as keyof AcademicSessionsController],
      ),
      policy,
    );
  }
});

test("StudentBatch controller exposes exact guarded CRUD routes and policies without binding-route collision", () => {
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, StudentBatchesController),
    "student-batches",
  );
  assert.deepEqual(
    Reflect.getMetadata(GUARDS_METADATA, StudentBatchesController),
    [AuthGuard, PolicyGuard],
  );
  const prototype = StudentBatchesController.prototype;
  const cases = [
    [
      "create",
      "/",
      RequestMethod.POST,
      ACADEMIC_POLICY_NAMES.STUDENT_BATCH_MANAGE,
    ],
    ["list", "/", RequestMethod.GET, ACADEMIC_POLICY_NAMES.STUDENT_BATCH_READ],
    [
      "getById",
      ":id",
      RequestMethod.GET,
      ACADEMIC_POLICY_NAMES.STUDENT_BATCH_READ,
    ],
    [
      "update",
      ":id",
      RequestMethod.PATCH,
      ACADEMIC_POLICY_NAMES.STUDENT_BATCH_MANAGE,
    ],
  ] as const;
  for (const [method, path, requestMethod, policy] of cases) {
    assert.deepEqual(routeMetadata(prototype, method), { path, requestMethod });
    assert.equal(
      Reflect.getMetadata(
        REQUIRE_POLICY_KEY,
        prototype[method as keyof StudentBatchesController],
      ),
      policy,
    );
  }
  assert.equal(
    cases.some(([, path]) => String(path) === ":id/student-batch-binding"),
    false,
  );
});

test("management controllers forward only DTO/query values and route identity", async () => {
  const calls: unknown[] = [];
  const service = new Proxy(
    {},
    {
      get:
        (_target, property) =>
        async (...args: unknown[]) => {
          calls.push([property, ...args]);
          return { property, args };
        },
    },
  );
  const sessions = new AcademicSessionsController(service as never);
  const batches = new StudentBatchesController(service as never);
  await sessions.create({ code: "S", name: "Session" });
  await sessions.list({ search: "S" });
  await sessions.getById({ id: "session-a" });
  await sessions.update({ id: "session-a" }, { name: "Updated" });
  await batches.create({
    academicProgramId: "program-a",
    academicSessionId: "session-a",
    code: "B",
    name: "Batch",
  });
  await batches.list({ academicProgramId: "program-a" });
  await batches.getById({ id: "batch-a" });
  await batches.update({ id: "batch-a" }, { code: "B2" });
  assert.deepEqual(calls, [
    ["createAcademicSession", { code: "S", name: "Session" }],
    ["listAcademicSessions", { search: "S" }],
    ["getAcademicSession", "session-a"],
    ["updateAcademicSession", "session-a", { name: "Updated" }],
    [
      "createStudentBatch",
      {
        academicProgramId: "program-a",
        academicSessionId: "session-a",
        code: "B",
        name: "Batch",
      },
    ],
    ["listStudentBatches", { academicProgramId: "program-a" }],
    ["getStudentBatch", "batch-a"],
    ["updateStudentBatch", "batch-a", { code: "B2" }],
  ]);
});
