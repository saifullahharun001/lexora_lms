import assert from "node:assert/strict";
import test from "node:test";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { REQUIRE_POLICY_KEY } from "@/modules/authorization/domain/authorization.constants";
import { AuthorizationService } from "@/modules/authorization/services/authorization.service";
import type { PrincipalContext } from "@lexora/types";
import { FormativeAssessmentController } from "./formative-assessment.controller";
import { FORMATIVE_POLICIES } from "../../domain/formative.policy-names";
import { FormativeMarkDto } from "../dto/formative.dto";

test("every Formative route requires AuthGuard, PolicyGuard and its narrow policy", () => {
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, FormativeAssessmentController), [AuthGuard, PolicyGuard]);
  for (const [name, policy] of Object.entries({ list: FORMATIVE_POLICIES.READ, create: FORMATIVE_POLICIES.MANAGE,
    update: FORMATIVE_POLICIES.MANAGE, startMarking: FORMATIVE_POLICIES.MANAGE, mark: FORMATIVE_POLICIES.MANAGE,
    adjust: FORMATIVE_POLICIES.ADJUST, read: FORMATIVE_POLICIES.READ, submit: FORMATIVE_POLICIES.SUBMIT })) {
    assert.equal(Reflect.getMetadata(REQUIRE_POLICY_KEY, (FormativeAssessmentController.prototype as any)[name]), policy);
  }
  assert.equal("finalise" in FormativeAssessmentController.prototype, false);
});

test("DTO rejects client weighted totals and validates explicit missing state", async () => {
  const valid = { rawMark: null, feedbackCompleted: false, integrityStatus: "PENDING_REVIEW" };
  assert.equal((await validate(plainToInstance(FormativeMarkDto, valid))).length, 0);
  for (const extra of [{ weightedMark: "30" }, { departmentId: "other" }, { total: "30" }, { rawMark: 15 }]) {
    assert.ok((await validate(plainToInstance(FormativeMarkDto, { ...valid, ...extra }), { whitelist: true, forbidNonWhitelisted: true })).length);
  }
  assert.ok((await validate(plainToInstance(FormativeMarkDto, { feedbackCompleted: false, integrityStatus: "CLEAR" }))).length);
});

test("Teacher submission is admitted but adjustments require exact loaded Teacher permission; wildcards cannot adjust", () => {
  const service = new AuthorizationService();
  const principal: PrincipalContext = { actorId: "teacher", actorType: "user", isAuthenticated: true, activeDepartmentId: "law",
    roleAssignments: [{ departmentId: "law", role: "teacher", userRoleId: "ur", roleId: "role" }], permissions: [] };
  assert.equal(service.isAllowed(principal, FORMATIVE_POLICIES.SUBMIT), true);
  assert.equal(service.isAllowed(principal, FORMATIVE_POLICIES.ADJUST), false);
  const source = { departmentId: "law", userRoleId: "ur", roleId: "role" };
  principal.permissions = [{ resource: "*", action: "*", scope: "department", source }];
  assert.equal(service.isAllowed(principal, FORMATIVE_POLICIES.ADJUST), false);
  principal.permissions = [{ resource: "formative.mark", action: "adjust", scope: "department", source }];
  assert.equal(service.isAllowed(principal, FORMATIVE_POLICIES.ADJUST), true);
  principal.roleAssignments[0]!.role = "department_admin";
  assert.equal(service.isAllowed(principal, FORMATIVE_POLICIES.ADJUST), false);
});
