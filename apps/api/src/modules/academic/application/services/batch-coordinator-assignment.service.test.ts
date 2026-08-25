import assert from "node:assert/strict";
import test from "node:test";

import { BadRequestException } from "@nestjs/common";

import { BatchCoordinatorAssignmentService } from "./batch-coordinator-assignment.service";

function harness() {
  const calls: unknown[] = [];
  const assignment = {
    id: "assignment-a",
    departmentId: "department-a",
    studentBatchId: "batch-a",
    academicTermId: "term-a",
    coordinatorUserId: "coordinator-a",
    assignedByUserId: "admin-a",
    status: "ACTIVE",
    assignedAt: new Date(),
    expiresAt: null,
    unassignedAt: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const repository = {
    create: async (input: unknown) => {
      calls.push(input);
      return { outcome: "CREATED", assignment };
    },
    updateExpiry: async () => ({ outcome: "UPDATED", assignment }),
    reactivate: async (input: unknown) => {
      calls.push(input);
      return { outcome: "REACTIVATED", assignment };
    },
  };
  const authorizer = {
    authorize: async () => ({
      departmentId: "department-a",
      actorUserId: "admin-a",
      userRoleId: "user-role-a",
      roleId: "role-a",
    }),
  };
  const requestContext = {
    get: () => ({
      requestId: "request-a",
      audit: { ipAddress: "127.0.0.1", userAgent: "test-agent" },
    }),
  };
  return {
    service: new BatchCoordinatorAssignmentService(
      repository as never,
      authorizer as never,
      requestContext as never,
    ),
    calls,
  };
}

test("management write scope and assigner always come from authenticated authority", async () => {
  const h = harness();
  await h.service.create({
    studentBatchId: "batch-a",
    academicTermId: "term-a",
    coordinatorUserId: "coordinator-a",
    departmentId: "forged-department",
    assignedByUserId: "forged-admin",
  } as never);
  const input = h.calls[0] as {
    departmentId: string;
    actorUserId: string;
    assignedByUserId?: string;
  };
  assert.equal(input.departmentId, "department-a");
  assert.equal(input.actorUserId, "admin-a");
  assert.equal(input.assignedByUserId, undefined);
});

test("empty PATCH and non-future create expiry are rejected before mutation", async () => {
  const h = harness();
  await assert.rejects(
    h.service.update("assignment-a", {}),
    BadRequestException,
  );
  await assert.rejects(
    h.service.create({
      studentBatchId: "batch-a",
      academicTermId: "term-a",
      coordinatorUserId: "coordinator-a",
      expiresAt: new Date("2000-01-01T00:00:00.000Z"),
    }),
    BadRequestException,
  );
  assert.equal(h.calls.length, 0);
});

test("reactivation requires explicit null or a future expiry before mutation", async () => {
  const missing = harness();
  await assert.rejects(
    missing.service.reactivate("assignment-a", {} as never),
    BadRequestException,
  );
  await assert.rejects(
    missing.service.reactivate("assignment-a", {
      expiresAt: undefined,
    } as never),
    BadRequestException,
  );
  await assert.rejects(
    missing.service.reactivate("assignment-a", {
      expiresAt: new Date("2000-01-01T00:00:00.000Z"),
    }),
    BadRequestException,
  );
  assert.equal(missing.calls.length, 0);

  const indefinite = harness();
  await indefinite.service.reactivate("assignment-a", { expiresAt: null });
  assert.equal(
    (indefinite.calls[0] as { expiresAt: Date | null }).expiresAt,
    null,
  );

  const finite = harness();
  const expiresAt = new Date("2099-01-01T00:00:00.000Z");
  await finite.service.reactivate("assignment-a", { expiresAt });
  assert.equal(
    (finite.calls[0] as { expiresAt: Date | null }).expiresAt,
    expiresAt,
  );
});
