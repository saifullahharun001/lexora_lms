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
import { SyllabusVersionsController } from "./syllabus-versions.controller";

test("syllabus routes use both guards and the exact dedicated policy", () => {
  assert.deepEqual(
    Reflect.getMetadata(GUARDS_METADATA, SyllabusVersionsController),
    [AuthGuard, PolicyGuard],
  );

  for (const method of ["create", "list", "getById"] as const) {
    assert.equal(
      Reflect.getMetadata(
        REQUIRE_POLICY_KEY,
        SyllabusVersionsController.prototype[method],
      ),
      ACADEMIC_POLICY_NAMES.SYLLABUS_VERSION_MANAGE,
    );
  }
});

test("HTTP surface contains only create, list, and immutable-id read", () => {
  const routes = [
    ["create", "/", RequestMethod.POST],
    ["list", "/", RequestMethod.GET],
    ["getById", ":id", RequestMethod.GET],
  ] as const;

  for (const [method, path, requestMethod] of routes) {
    assert.equal(
      Reflect.getMetadata(
        PATH_METADATA,
        SyllabusVersionsController.prototype[method],
      ),
      path,
    );
    assert.equal(
      Reflect.getMetadata(
        METHOD_METADATA,
        SyllabusVersionsController.prototype[method],
      ),
      requestMethod,
    );
  }

  assert.deepEqual(
    Object.getOwnPropertyNames(SyllabusVersionsController.prototype).filter(
      (name) => name !== "constructor",
    ),
    ["create", "list", "getById"],
  );
});

test("unauthenticated syllabus requests are rejected by AuthGuard", async () => {
  const guard = new AuthGuard({} as never, {} as never, {} as never);
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
  };

  await assert.rejects(
    guard.canActivate(context as never),
    UnauthorizedException,
  );
});

test("static policy allows Department Admin and denies Teacher and Student", () => {
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
      ACADEMIC_POLICY_NAMES.SYLLABUS_VERSION_MANAGE,
    ),
    true,
  );
  assert.equal(
    authorization.isAllowed(
      principal("teacher"),
      ACADEMIC_POLICY_NAMES.SYLLABUS_VERSION_MANAGE,
    ),
    false,
  );
  assert.equal(
    authorization.isAllowed(
      principal("student"),
      ACADEMIC_POLICY_NAMES.SYLLABUS_VERSION_MANAGE,
    ),
    false,
  );
});
