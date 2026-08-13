import assert from "node:assert/strict";
import test from "node:test";

import { RequestMethod, UnauthorizedException } from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";

import { REQUIRE_POLICY_KEY } from "@/modules/authorization/domain/authorization.constants";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { AuthorizationService } from "@/modules/authorization/services/authorization.service";

import { ACADEMIC_POLICY_NAMES } from "../../domain/academic.policy-names";
import { CurriculumVersionsController } from "./curriculum-versions.controller";

test("all lifecycle actions require AuthGuard, PolicyGuard, and the dedicated policy", () => {
  const guards = Reflect.getMetadata(
    GUARDS_METADATA,
    CurriculumVersionsController,
  ) as unknown[];
  assert.deepEqual(guards, [AuthGuard, PolicyGuard]);

  for (const method of ["approve", "activate", "retire", "archive"] as const) {
    assert.equal(
      Reflect.getMetadata(
        REQUIRE_POLICY_KEY,
        CurriculumVersionsController.prototype[method],
      ),
      ACADEMIC_POLICY_NAMES.CURRICULUM_VERSION_LIFECYCLE_MANAGE,
    );
  }
});

test("lifecycle HTTP surface exposes only explicit idempotent PUT actions", () => {
  const routes = [
    ["approve", ":id/approve"],
    ["activate", ":id/activate"],
    ["retire", ":id/retire"],
    ["archive", ":id/archive"],
  ] as const;

  for (const [method, path] of routes) {
    assert.equal(
      Reflect.getMetadata(
        PATH_METADATA,
        CurriculumVersionsController.prototype[method],
      ),
      path,
    );
    assert.equal(
      Reflect.getMetadata(
        METHOD_METADATA,
        CurriculumVersionsController.prototype[method],
      ),
      RequestMethod.PUT,
    );
  }
});

test("unauthenticated curriculum lifecycle requests are rejected by AuthGuard", async () => {
  const guard = new AuthGuard({} as never, {} as never, {} as never);
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
  };

  await assert.rejects(guard.canActivate(context as never), UnauthorizedException);
});

test("static policy permits Department Admin and denies Teacher and Student", () => {
  const authorization = new AuthorizationService();
  const principal = (role: "department_admin" | "teacher" | "student") =>
    ({
      actorId: role + "-a",
      isAuthenticated: true,
      activeDepartmentId: "department-a",
      roleAssignments: [{ departmentId: "department-a", role }],
      permissions: [],
    }) as never;

  assert.equal(
    authorization.isAllowed(
      principal("department_admin"),
      ACADEMIC_POLICY_NAMES.CURRICULUM_VERSION_LIFECYCLE_MANAGE,
    ),
    true,
  );
  assert.equal(
    authorization.isAllowed(
      principal("teacher"),
      ACADEMIC_POLICY_NAMES.CURRICULUM_VERSION_LIFECYCLE_MANAGE,
    ),
    false,
  );
  assert.equal(
    authorization.isAllowed(
      principal("student"),
      ACADEMIC_POLICY_NAMES.CURRICULUM_VERSION_LIFECYCLE_MANAGE,
    ),
    false,
  );
});
