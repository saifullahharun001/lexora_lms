import assert from "node:assert/strict";
import test from "node:test";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { REQUIRE_POLICY_KEY } from "@/modules/authorization/domain/authorization.constants";
import { AttendanceController } from "./attendance.controller";
import { CreateAttendanceCorrectionDto } from "../dto/create-attendance-correction.dto";
import { AttendanceExaminationParamDto } from "../dto/generate-attendance-marks.dto";
import { BadRequestException } from "@nestjs/common";

test("generation route requires exact policy, validated Examination ID and rejects every client value", async () => {
  assert.equal(Reflect.getMetadata(REQUIRE_POLICY_KEY, AttendanceController.prototype.generate), "attendance.mark.generate");
  const calls: string[] = [];
  const controller = new AttendanceController({} as never, {} as never, { generate: (id: string) => calls.push(id) } as never);
  controller.generate({ examinationId: "exam" });
  assert.deepEqual(calls, ["exam"]);
  for (const name of ["mark", "marks", "percentage", "presentCount", "conductedCount", "courseIds", "enrollmentIds", "departmentId",
    "committeeId", "chairmanUserId", "actorUserId", "assignmentId", "ruleVersionCode", "sourceFingerprint", "generatedAt"]) {
    assert.throws(() => controller.generate({ examinationId: "exam" }, { [name]: "forged" }), BadRequestException);
  }
  for (const body of [null, [], "forged", 1]) assert.throws(() => controller.generate({ examinationId: "exam" }, body), BadRequestException);
  assert.ok((await validate(plainToInstance(AttendanceExaminationParamDto, { examinationId: "" }))).length);
  assert.equal((await validate(plainToInstance(AttendanceExaminationParamDto, { examinationId: "exam" }))).length, 0);
});

test("ordinary correction route retains AuthGuard, PolicyGuard and exact dedicated policy", () => {
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, AttendanceController), [AuthGuard, PolicyGuard]);
  assert.equal(Reflect.getMetadata(REQUIRE_POLICY_KEY, AttendanceController.prototype.correct), "attendance.record.correct");
});
test("ordinary correction DTO permits only academic identity, PRESENT/ABSENT and trimmed bounded reason", async () => {
  const input = { classSessionId: "session", enrollmentId: "enrollment", status: "PRESENT", reason: "  Evidence reviewed  " };
  const parse = (extra: object) => plainToInstance(CreateAttendanceCorrectionDto, { ...input, ...extra });
  assert.equal(parse({}).reason, "Evidence reviewed");
  assert.equal((await validate(parse({}))).length, 0);
  assert.equal((await validate(parse({ status: "ABSENT" }))).length, 0);
  for (const extra of [{ reason: " \t\n " }, { reason: "x".repeat(2001) }, { reason: null }, { reason: 7 },
    { status: "LATE" }, { status: "EXCUSED" }, { classSessionId: "" }, { enrollmentId: "" },
    ...["departmentId", "courseOfferingId", "studentUserId", "studentBatchId", "academicTermId", "actorUserId",
      "teacherCourseAssignmentId", "authorityKind", "authorityJson", "versionId", "revision", "occurredAt", "basisFingerprint", "freezeState"]
      .map((key) => ({ [key]: "forged" }))]) {
    assert.ok((await validate(parse(extra), { whitelist: true, forbidNonWhitelisted: true })).length, JSON.stringify(extra));
  }
});
test("controller forwards only the minimum correction input", () => {
  const input = { classSessionId: "s", enrollmentId: "e", status: "PRESENT", reason: "r", departmentId: "forged" };
  const controller = new AttendanceController({} as never, { correct: (data: unknown) => data } as never, {} as never);
  assert.deepEqual(controller.correct(input as any), { classSessionId: "s", enrollmentId: "e", status: "PRESENT", reason: "r" });
});
