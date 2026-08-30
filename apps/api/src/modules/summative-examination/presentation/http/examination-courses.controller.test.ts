import assert from "node:assert/strict";
import test from "node:test";

import {
  type ArgumentMetadata,
  RequestMethod,
  ValidationPipe,
} from "@nestjs/common";
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
import { RegisterSummativeCandidateDto } from "./dto/examiner-marks.dto";
import { ExaminerMarkingCourseIdParamDto } from "./dto/resource-id-param.dto";
import { ExaminationCoursesController } from "./examination-courses.controller";

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

function validate<T>(
  metatype: new () => T,
  value: unknown,
  type: ArgumentMetadata["type"],
) {
  return pipe.transform(value, { type, metatype } as ArgumentMetadata);
}

test("candidate registration is an authenticated v1 setup-management route", () => {
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, ExaminationCoursesController),
    "summative-examination-courses",
  );
  assert.equal(
    Reflect.getMetadata(VERSION_METADATA, ExaminationCoursesController),
    "1",
  );
  assert.deepEqual(
    Reflect.getMetadata(GUARDS_METADATA, ExaminationCoursesController),
    [AuthGuard, PolicyGuard],
  );

  const handler = ExaminationCoursesController.prototype.registerCandidate;
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, handler),
    ":examinationCourseId/candidates",
  );
  assert.equal(
    Reflect.getMetadata(METHOD_METADATA, handler),
    RequestMethod.POST,
  );
  assert.equal(
    Reflect.getMetadata(REQUIRE_POLICY_KEY, handler),
    SUMMATIVE_EXAMINATION_POLICY_NAMES.SETUP_MANAGE,
  );
});

test("candidate registration forwards only the validated route course and body Enrollment IDs", async () => {
  const calls: unknown[] = [];
  const candidateRosterService = {
    registerCandidate: async (...args: unknown[]) => {
      calls.push(args);
      return args;
    },
  };
  const controller = new ExaminationCoursesController(
    {} as never,
    candidateRosterService as never,
  );
  const params = await validate(
    ExaminerMarkingCourseIdParamDto,
    { examinationCourseId: "exam-course-a" },
    "param",
  );
  const body = await validate(
    RegisterSummativeCandidateDto,
    { enrollmentId: "enrollment-a" },
    "body",
  );

  await controller.registerCandidate(params, body);
  assert.deepEqual(calls, [["exam-course-a", "enrollment-a"]]);

  for (const forbiddenField of [
    "departmentId",
    "examinationId",
    "examinationCourseId",
    "studentUserId",
    "academicTermId",
    "academicProgramId",
    "curriculumVersionId",
    "curriculumCourseId",
    "studentCurriculumAssignmentId",
    "registeredByUserId",
    "registeredAt",
  ]) {
    await assert.rejects(
      validate(
        RegisterSummativeCandidateDto,
        {
          enrollmentId: "enrollment-a",
          [forbiddenField]: "attacker-controlled",
        },
        "body",
      ),
      forbiddenField,
    );
  }
});
