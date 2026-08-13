import assert from "node:assert/strict";
import test from "node:test";

import { UnauthorizedException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";

import { REQUIRE_POLICY_KEY } from "@/modules/authorization/domain/authorization.constants";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { AuthorizationService } from "@/modules/authorization/services/authorization.service";

import { ACADEMIC_POLICY_NAMES } from "../../domain/academic.policy-names";
import { CourseOfferingsController } from "./course-offerings.controller";

test("curriculum binding endpoint requires AuthGuard, PolicyGuard, and dedicated policy", () => {
  const guards = Reflect.getMetadata(
    GUARDS_METADATA,
    CourseOfferingsController,
  ) as unknown[];
  assert.deepEqual(guards, [AuthGuard, PolicyGuard]);
  assert.equal(
    Reflect.getMetadata(
      REQUIRE_POLICY_KEY,
      CourseOfferingsController.prototype.bindCurriculum,
    ),
    ACADEMIC_POLICY_NAMES.CURRICULUM_BINDING_MANAGE,
  );
});

test("unauthenticated requests are rejected by AuthGuard", async () => {
  const guard = new AuthGuard({} as never, {} as never, {} as never);
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
  };
  await assert.rejects(guard.canActivate(context as never), UnauthorizedException);
});

test("Department Admin wildcard permits binding but Teacher offering.manage does not", () => {
  const authorization = new AuthorizationService();
  const principal = (role: "department_admin" | "teacher" | "student") =>
    ({
      actorId: `${role}-a`,
      isAuthenticated: true,
      activeDepartmentId: "department-a",
      roleAssignments: [
        {
          userRoleId: `${role}-assignment-a`,
          roleId: `${role}-role-a`,
          departmentId: "department-a",
          role,
        },
      ],
      permissions: [],
    }) as never;

  assert.equal(
    authorization.isAllowed(
      principal("department_admin"),
      ACADEMIC_POLICY_NAMES.CURRICULUM_BINDING_MANAGE,
    ),
    true,
  );
  assert.equal(
    authorization.isAllowed(
      principal("teacher"),
      ACADEMIC_POLICY_NAMES.OFFERING_MANAGE,
    ),
    true,
  );
  assert.equal(
    authorization.isAllowed(
      principal("teacher"),
      ACADEMIC_POLICY_NAMES.CURRICULUM_BINDING_MANAGE,
    ),
    false,
  );
  assert.equal(
    authorization.isAllowed(
      principal("student"),
      ACADEMIC_POLICY_NAMES.CURRICULUM_BINDING_MANAGE,
    ),
    false,
  );
});
