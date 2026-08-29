import assert from "node:assert/strict";
import test from "node:test";

import { ArgumentMetadata, ValidationPipe } from "@nestjs/common";

import {
  AssignExaminationCourseExaminerDto,
  ReactivateExaminerAssignmentDto,
  UpdateExaminerAssignmentExpiryDto,
} from "./examiner-assignments.dto";

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

test("assignment DTO accepts only independent First and Second Examiner seats", async () => {
  for (const seat of ["FIRST_EXAMINER", "SECOND_EXAMINER"] as const) {
    const value = await validate(AssignExaminationCourseExaminerDto, {
      assignedUserId: "user-a",
      seat,
    });
    assert.equal(value.assignedUserId, "user-a");
    assert.equal(value.seat, seat);
    assert.equal(value.expiresAt, undefined);
  }
  for (const seat of ["THIRD_EXAMINER", "COURSE_TEACHER", "FIRST_AND_SECOND"]) {
    await assert.rejects(
      validate(AssignExaminationCourseExaminerDto, {
        assignedUserId: "user-a",
        seat,
      }),
    );
  }
});

test("assignment DTO rejects caller-controlled authoritative scope", async () => {
  for (const forbidden of [
    { departmentId: "department-a" },
    { examinationId: "exam-a" },
    { examinationCourseId: "exam-course-a" },
    { assignedByUserId: "admin-a" },
    { academicProgramId: "program-a" },
    { studentBatchId: "batch-a" },
  ]) {
    await assert.rejects(
      validate(AssignExaminationCourseExaminerDto, {
        assignedUserId: "user-a",
        seat: "FIRST_EXAMINER",
        ...forbidden,
      }),
    );
  }
});

test("expiry DTOs accept ISO dates while service retains future-time authority", async () => {
  const iso = "2027-01-01T00:00:00.000Z";
  assert.equal(
    (await validate(AssignExaminationCourseExaminerDto, {
      assignedUserId: "user-a",
      seat: "SECOND_EXAMINER",
      expiresAt: iso,
    })).expiresAt,
    iso,
  );
  assert.equal(
    (await validate(ReactivateExaminerAssignmentDto, { expiresAt: iso }))
      .expiresAt,
    iso,
  );
  assert.equal(
    (await validate(UpdateExaminerAssignmentExpiryDto, { expiresAt: iso }))
      .expiresAt,
    iso,
  );
  await assert.rejects(
    validate(UpdateExaminerAssignmentExpiryDto, { expiresAt: "not-a-date" }),
  );
});
