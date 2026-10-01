import assert from "node:assert/strict";
import test from "node:test";
import { GUARDS_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { BadRequestException, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { DepartmentContextResolver } from "@/common/department-context/department-context.resolver";
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
    adjust: FORMATIVE_POLICIES.ADJUST, read: FORMATIVE_POLICIES.READ, submissions: FORMATIVE_POLICIES.READ, submit: FORMATIVE_POLICIES.SUBMIT })) {
    assert.equal(Reflect.getMetadata(REQUIRE_POLICY_KEY, (FormativeAssessmentController.prototype as any)[name]), policy);
  }
  assert.equal("finalise" in FormativeAssessmentController.prototype, false);
});

test("activity submit replaces legacy write route and rejects all supplied authority/source fields", () => {
  const calls: unknown[] = [];
  const controller = new FormativeAssessmentController({ submitActivity: (...args: unknown[]) => calls.push(args) } as any);
  assert.equal(Reflect.getMetadata(PATH_METADATA, controller.submit), "activities/:activityId/submit");
  for (const name of Object.getOwnPropertyNames(FormativeAssessmentController.prototype)) {
    assert.notEqual(Reflect.getMetadata(PATH_METADATA, (controller as any)[name]), "enrollments/:enrollmentId/submit");
  }
  for (const field of ["departmentId", "teacherId", "teacherAssignmentId", "weightedMark", "total", "enrollmentIds", "submittedAt", "sourceFingerprint"]) {
    assert.throws(() => controller.submit("offering", "activity", { [field]: "forged" }), BadRequestException);
  }
  controller.submit("offering", "activity", {});
  assert.deepEqual(calls, [["offering", "activity"]]);
});

test("actual route guards deny missing authentication, Student and Department Admin; principal defeats forged header", async () => {
  const request: any = { headers: { "x-department-id": "other" } };
  const execution: any = { getHandler: () => FormativeAssessmentController.prototype.submit,
    getClass: () => FormativeAssessmentController, switchToHttp: () => ({ getRequest: () => request }) };
  await assert.rejects(new AuthGuard({} as any, {} as any, {} as any).canActivate(execution), UnauthorizedException);
  const departments: unknown[] = [];
  const guard = new PolicyGuard(new Reflector(), new AuthorizationService(), new DepartmentContextResolver(),
    { setDepartment: (department: unknown) => departments.push(department), get: () => ({}) } as any,
    { write: async () => undefined } as any);
  for (const role of ["student", "department_admin"]) {
    request.principal = { actorId: "actor", actorType: "user", isAuthenticated: true, activeDepartmentId: "law",
      roleAssignments: [{ departmentId: "law", role, roleId: "r", userRoleId: "ur" }], permissions: [] };
    await assert.rejects(guard.canActivate(execution), ForbiddenException);
  }
  request.principal.roleAssignments[0].role = "teacher";
  assert.equal(await guard.canActivate(execution), true);
  assert.equal((departments.at(-1) as any).departmentId, "law");
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
