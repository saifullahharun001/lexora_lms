import assert from "node:assert/strict";
import test from "node:test";

import { BadRequestException } from "@nestjs/common";

import { BatchCoordinatorAuthorityService } from "./batch-coordinator-authority.service";

test("current-actor authority derives exact user and department from the authenticated principal", async () => {
  const calls: unknown[] = [];
  const repository = {
    hasActiveAuthority: async (query: unknown) => {
      calls.push(query);
      return true;
    },
  };
  const context = {
    get: () => ({
      principal: {
        isAuthenticated: true,
        actorType: "user",
        actorId: "coordinator-a",
        activeDepartmentId: "department-a",
      },
    }),
  };
  const service = new BatchCoordinatorAuthorityService(
    repository as never,
    context as never,
  );
  const before = Date.now();
  assert.equal(
    await service.hasExactAuthority({
      studentBatchId: "batch-a",
      academicTermId: "term-a",
    }),
    true,
  );
  const after = Date.now();
  assert.equal(calls.length, 1);
  const query = calls[0] as {
    departmentId: string;
    coordinatorUserId: string;
    studentBatchId: string;
    academicTermId: string;
    evaluatedAt: Date;
  };
  assert.deepEqual(
    {
      departmentId: query.departmentId,
      coordinatorUserId: query.coordinatorUserId,
      studentBatchId: query.studentBatchId,
      academicTermId: query.academicTermId,
    },
    {
      departmentId: "department-a",
      coordinatorUserId: "coordinator-a",
      studentBatchId: "batch-a",
      academicTermId: "term-a",
    },
  );
  assert.ok(query.evaluatedAt instanceof Date);
  assert.ok(query.evaluatedAt.getTime() >= before);
  assert.ok(query.evaluatedAt.getTime() <= after);
  assert.equal("hasExactAuthorityFor" in service, false);
});

test("invalid authenticated contexts fail before repository authority lookup", () => {
  const invalidPrincipals = [
    null,
    {
      isAuthenticated: false,
      actorType: "user",
      actorId: "coordinator-a",
      activeDepartmentId: "department-a",
    },
    {
      isAuthenticated: true,
      actorType: "service",
      actorId: "service-a",
      activeDepartmentId: "department-a",
    },
    {
      isAuthenticated: true,
      actorType: "user",
      actorId: "",
      activeDepartmentId: "department-a",
    },
    {
      isAuthenticated: true,
      actorType: "user",
      actorId: "coordinator-a",
      activeDepartmentId: null,
    },
  ];

  for (const principal of invalidPrincipals) {
    let calls = 0;
    const service = new BatchCoordinatorAuthorityService(
      {
        hasActiveAuthority: async () => {
          calls += 1;
          return true;
        },
      } as never,
      { get: () => ({ principal }) } as never,
    );
    assert.throws(
      () =>
        service.hasExactAuthority({
          studentBatchId: "batch-a",
          academicTermId: "term-a",
        }),
      BadRequestException,
    );
    assert.equal(calls, 0);
  }
});
