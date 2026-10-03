import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { GUARDS_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { AuthorizationService } from "@/modules/authorization/services/authorization.service";
import { DepartmentContextResolver } from "@/common/department-context/department-context.resolver";
import { REQUIRE_POLICY_KEY } from "@/modules/authorization/domain/authorization.constants";
import { FormativeActivitiesFinalisationController as Controller } from "./formative-activities-finalisation.controller";

test("only offering-batch workspace and finalise routes exist, both behind required guards and exact policy", () => {
  assert.equal(Reflect.getMetadata(PATH_METADATA, Controller), "formative/examination-courses/:examinationCourseId/activities");
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, Controller), [AuthGuard, PolicyGuard]);
  assert.deepEqual(Object.getOwnPropertyNames(Controller.prototype), ["constructor", "workspace", "finalise"]);
  for (const method of ["workspace", "finalise"] as const) {
    assert.equal(Reflect.getMetadata(REQUIRE_POLICY_KEY, Controller.prototype[method]), "formative.activities.finalise");
    assert.doesNotMatch(Reflect.getMetadata(PATH_METADATA, Controller.prototype[method]), /enrollment/);
  }
});
test("empty bodies accepted; every source/mark/authority field and non-object body rejected", () => {
  const calls: string[] = [];
  const controller = new Controller({ finalise: (id: string) => calls.push(id) } as never);
  controller.finalise("ec"); controller.finalise("ec", {});
  for (const key of ["mark", "marks", "total", "activityIds", "submissionIds", "enrollmentId", "enrollmentIds",
    "chairmanUserId", "committeeId", "assignmentId", "sourceFingerprint", "ruleVersionCode", "departmentId"])
    assert.throws(() => controller.finalise("ec", { [key]: "forged" }), BadRequestException);
  for (const body of [null, [], "", 1]) assert.throws(() => controller.finalise("ec", body), BadRequestException);
  assert.deepEqual(calls, ["ec", "ec"]);
});
test("actual guards deny unauthenticated/role-only/wrong-role; authenticated department defeats forged header", async () => {
  const request: any = { headers: { "x-department-id": "foreign" } };
  const execution: any = { getHandler: () => Controller.prototype.finalise, getClass: () => Controller,
    switchToHttp: () => ({ getRequest: () => request }) };
  await assert.rejects(new AuthGuard({} as never, {} as never, {} as never).canActivate(execution), UnauthorizedException);
  const departments: any[] = [];
  const guard = new PolicyGuard(new Reflector(), new AuthorizationService(), new DepartmentContextResolver(),
    { setDepartment: (d: unknown) => departments.push(d), get: () => ({}) } as never, { write: async () => undefined } as never);
  request.principal = { isAuthenticated: true, actorType: "user", actorId: "chair", activeDepartmentId: "law",
    roleAssignments: [{ departmentId: "law", role: "teacher", roleId: "r", userRoleId: "ur" }], permissions: [] };
  await assert.rejects(guard.canActivate(execution), ForbiddenException);
  request.principal.permissions = [{ id: "p", rolePermissionId: "rp", code: "formative.activities.finalise_department",
    resource: "formative.activities", action: "finalise", scope: "department", source: { departmentId: "law", roleId: "r", userRoleId: "ur" } }];
  for (const role of ["student", "department_admin", "department_chairman"]) {
    request.principal.roleAssignments[0].role = role;
    await assert.rejects(guard.canActivate(execution), ForbiddenException);
  }
  request.principal.roleAssignments[0].role = "teacher";
  assert.equal(await guard.canActivate(execution), true);
  assert.equal(departments.at(-1).departmentId, "law");
});
