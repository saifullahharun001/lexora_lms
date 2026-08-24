import assert from "node:assert/strict";
import test from "node:test";

import { ValidationPipe } from "@nestjs/common";

import { CreateAcademicSessionDto } from "./create-academic-session.dto";
import { CreateStudentBatchDto } from "./create-student-batch.dto";
import { UpdateAcademicSessionDto } from "./update-academic-session.dto";
import { UpdateStudentBatchDto } from "./update-student-batch.dto";

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

function transform<T extends object>(metatype: new () => T, value: unknown) {
  return pipe.transform(value, { type: "body", metatype });
}

test("AcademicSession DTOs trim meaningful values and respect the 64-character code bound", async () => {
  assert.deepEqual(
    {
      ...(await transform(CreateAcademicSessionDto, {
        code: " 2026-2027 ",
        name: " Academic Session 2026 ",
      })),
    },
    { code: "2026-2027", name: "Academic Session 2026" },
  );
  await assert.rejects(
    transform(CreateAcademicSessionDto, { code: " ", name: "Valid" }),
  );
  await assert.rejects(
    transform(CreateAcademicSessionDto, {
      code: "X".repeat(65),
      name: "Valid",
    }),
  );
});

test("AcademicSession client-controlled identity and lifecycle metadata are rejected", async () => {
  for (const field of [
    "id",
    "departmentId",
    "archivedAt",
    "createdAt",
    "updatedAt",
    "status",
    "startDate",
    "endDate",
    "academicTermId",
  ]) {
    await assert.rejects(
      transform(CreateAcademicSessionDto, {
        code: "2026-2027",
        name: "Session",
        [field]: "forged",
      }),
    );
  }
});

test("StudentBatch create permits only immutable parents plus code/name", async () => {
  assert.deepEqual(
    {
      ...(await transform(CreateStudentBatchDto, {
        academicProgramId: " program-a ",
        academicSessionId: " session-a ",
        code: " LLB-26 ",
        name: " LL.B. 2026 ",
      })),
    },
    {
      academicProgramId: "program-a",
      academicSessionId: "session-a",
      code: "LLB-26",
      name: "LL.B. 2026",
    },
  );
  for (const field of [
    "departmentId",
    "archivedAt",
    "createdAt",
    "updatedAt",
    "studentBatchId",
  ]) {
    await assert.rejects(
      transform(CreateStudentBatchDto, {
        academicProgramId: "program-a",
        academicSessionId: "session-a",
        code: "LLB-26",
        name: "LL.B. 2026",
        [field]: "forged",
      }),
    );
  }
});

test("StudentBatch update cannot re-parent or control tenant/lifecycle identity", async () => {
  assert.deepEqual(
    {
      ...(await transform(UpdateStudentBatchDto, {
        code: " B-2 ",
        name: " Batch 2 ",
      })),
    },
    { code: "B-2", name: "Batch 2" },
  );
  for (const field of [
    "academicProgramId",
    "academicSessionId",
    "departmentId",
    "archivedAt",
    "createdAt",
    "updatedAt",
    "studentBatchId",
  ]) {
    await assert.rejects(
      transform(UpdateStudentBatchDto, { name: "Valid", [field]: "forged" }),
    );
  }
});

test("AcademicSession update cannot control server-owned fields", async () => {
  await assert.rejects(
    transform(UpdateAcademicSessionDto, {
      name: "Valid",
      departmentId: "forged",
    }),
  );
});
