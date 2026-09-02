import assert from "node:assert/strict";
import test from "node:test";
import { RequestMethod } from "@nestjs/common";
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { REQUIRE_POLICY_KEY } from "@/modules/authorization/domain/authorization.constants";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { SUMMATIVE_EXAMINATION_POLICY_NAMES } from "../../domain/summative-examination.policy-names";
import { AssignSummativeThirdExaminerReferralDto } from "./dto/assign-summative-third-examiner-referral.dto";
import { SummativeThirdExaminationReferralsController } from "./summative-third-examination-referrals.controller";

test("SummativeThirdExaminationReferralsController", async (t) => {
  await t.test("metadata", async (t) => {
    await t.test("has correct prefix", () => {
      assert.equal(
        Reflect.getMetadata(PATH_METADATA, SummativeThirdExaminationReferralsController),
        "summative-examination/third-referrals",
      );
    });

    await t.test("uses auth guards", () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, SummativeThirdExaminationReferralsController);
      assert.ok(guards.includes(AuthGuard));
      assert.ok(guards.includes(PolicyGuard));
    });
  });

  await t.test("assignThirdExaminer route", async (t) => {
    await t.test("has POST method", () => {
      assert.equal(
        Reflect.getMetadata(METHOD_METADATA, SummativeThirdExaminationReferralsController.prototype.assignThirdExaminer),
        RequestMethod.POST,
      );
    });

    await t.test("requires EXAMINER_ASSIGNMENT_MANAGE policy", () => {
      assert.equal(
        Reflect.getMetadata(REQUIRE_POLICY_KEY, SummativeThirdExaminationReferralsController.prototype.assignThirdExaminer),
        SUMMATIVE_EXAMINATION_POLICY_NAMES.EXAMINER_ASSIGNMENT_MANAGE,
      );
    });

    await t.test("binds request body to the Third referral DTO", () => {
      const parameterTypes = Reflect.getMetadata(
        "design:paramtypes",
        SummativeThirdExaminationReferralsController.prototype,
        "assignThirdExaminer",
      );
      assert.equal(parameterTypes[0], AssignSummativeThirdExaminerReferralDto);
    });
  });
});
