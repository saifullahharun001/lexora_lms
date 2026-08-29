import assert from "node:assert/strict";
import test from "node:test";

import { ArgumentMetadata, ValidationPipe } from "@nestjs/common";

import {
  AppointExternalCommitteeMemberDto,
  AssignInternalCommitteeMemberDto,
} from "./committee-assignments.dto";

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

test("internal assignment accepts only authenticated internal seats", async () => {
  const valid = await validate(AssignInternalCommitteeMemberDto, {
    assignedUserId: "user-a",
    seat: "CHAIRMAN",
  });
  assert.equal(valid.assignedUserId, "user-a");
  assert.equal(valid.seat, "CHAIRMAN");
  assert.equal(valid.expiresAt, undefined);
  const expiring = await validate(AssignInternalCommitteeMemberDto, {
    assignedUserId: "user-a",
    seat: "MEMBER_1",
    expiresAt: "2026-12-01T00:00:00.000Z",
  });
  assert.equal(expiring.expiresAt, "2026-12-01T00:00:00.000Z");
  await assert.rejects(
    validate(AssignInternalCommitteeMemberDto, {
      assignedUserId: "user-a",
      seat: "EXTERNAL_MEMBER",
    }),
  );
});

test("external appointment rejects assignedUserId and authoritative scope fields", async () => {
  const valid = {
    externalMemberName: "Professor External",
    externalMemberAffiliation: "Another Public University",
  };
  const appointment = await validate(AppointExternalCommitteeMemberDto, valid);
  assert.equal(appointment.externalMemberName, valid.externalMemberName);
  assert.equal(
    appointment.externalMemberAffiliation,
    valid.externalMemberAffiliation,
  );
  assert.equal(appointment.expiresAt, undefined);
  const expiring = await validate(AppointExternalCommitteeMemberDto, {
    ...valid,
    expiresAt: "2026-12-01T00:00:00.000Z",
  });
  assert.equal(expiring.expiresAt, "2026-12-01T00:00:00.000Z");
  for (const forbidden of [
    { assignedUserId: "user-a" },
    { departmentId: "department-a" },
    { assignedByUserId: "admin-a" },
    { seat: "EXTERNAL_MEMBER" },
    { examinationId: "exam-a" },
  ]) {
    await assert.rejects(
      validate(AppointExternalCommitteeMemberDto, {
        ...valid,
        ...forbidden,
      }),
    );
  }
});

test("external appointment requires nonblank schema-bounded identity data", async () => {
  for (const invalid of [
    {
      externalMemberName: "   ",
      externalMemberAffiliation: "Another Public University",
    },
    {
      externalMemberName: "Professor External",
      externalMemberAffiliation: "   ",
    },
    {
      externalMemberName: "x".repeat(129),
      externalMemberAffiliation: "Another Public University",
    },
    {
      externalMemberName: "Professor External",
      externalMemberAffiliation: "x".repeat(256),
    },
  ]) {
    await assert.rejects(validate(AppointExternalCommitteeMemberDto, invalid));
  }
});
