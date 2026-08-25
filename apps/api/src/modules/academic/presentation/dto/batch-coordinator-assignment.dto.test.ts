import assert from "node:assert/strict";
import test from "node:test";

import { ArgumentMetadata, ValidationPipe } from "@nestjs/common";

import { CreateBatchCoordinatorAssignmentDto } from "./create-batch-coordinator-assignment.dto";
import {
  ReactivateBatchCoordinatorAssignmentDto,
  UpdateBatchCoordinatorAssignmentDto,
} from "./update-batch-coordinator-assignment.dto";

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

function validate<T>(metatype: new () => T, value: unknown) {
  return pipe.transform(value, {
    type: "body",
    metatype,
  } as ArgumentMetadata);
}

test("create accepts only exact client-controlled identities and a valid expiry", async () => {
  const expiresAt = "2027-01-01T00:00:00.000Z";
  const value = await validate(CreateBatchCoordinatorAssignmentDto, {
    studentBatchId: "batch-a",
    academicTermId: "term-a",
    coordinatorUserId: "user-a",
    expiresAt,
  });
  assert.equal(value.expiresAt?.toISOString(), expiresAt);

  for (const serverField of [
    "departmentId",
    "assignedByUserId",
    "assignedAt",
    "unassignedAt",
    "archivedAt",
    "status",
  ]) {
    await assert.rejects(
      validate(CreateBatchCoordinatorAssignmentDto, {
        studentBatchId: "batch-a",
        academicTermId: "term-a",
        coordinatorUserId: "user-a",
        [serverField]: "forged",
      }),
    );
  }
});

test("PATCH DTO whitelists only nullable expiresAt and rejects identity fields", async () => {
  assert.equal(
    (await validate(UpdateBatchCoordinatorAssignmentDto, { expiresAt: null }))
      .expiresAt,
    null,
  );
  for (const identityField of [
    "departmentId",
    "studentBatchId",
    "academicTermId",
    "coordinatorUserId",
  ]) {
    await assert.rejects(
      validate(UpdateBatchCoordinatorAssignmentDto, {
        [identityField]: "forged",
      }),
    );
  }
});

test("reactivation DTO requires explicit null or a valid Date expiry", async () => {
  await assert.rejects(validate(ReactivateBatchCoordinatorAssignmentDto, {}));
  assert.equal(
    (
      await validate(ReactivateBatchCoordinatorAssignmentDto, {
        expiresAt: null,
      })
    ).expiresAt,
    null,
  );
  const expiresAt = "2027-01-01T00:00:00.000Z";
  assert.equal(
    (
      await validate(ReactivateBatchCoordinatorAssignmentDto, {
        expiresAt,
      })
    ).expiresAt.toISOString(),
    expiresAt,
  );
  await assert.rejects(
    validate(ReactivateBatchCoordinatorAssignmentDto, {
      expiresAt: "not-a-date",
    }),
  );
});
