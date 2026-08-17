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

test("syllabus binding is a guarded PUT route with its exact dedicated policy", () => {
  const guards = Reflect.getMetadata(
    GUARDS_METADATA,
    CourseOfferingsController,
  ) as unknown[];
  assert.deepEqual(guards, [AuthGuard, PolicyGuard]);
  assert.equal(
    Reflect.getMetadata(
      PATH_METADATA,
      CourseOfferingsController.prototype.bindSyllabus,
    ),
    ":id/syllabus-binding",
  );
  assert.equal(
    Reflect.getMetadata(
      METHOD_METADATA,
      CourseOfferingsController.prototype.bindSyllabus,
    ),
    RequestMethod.PUT,
  );
  assert.equal(
    Reflect.getMetadata(
      REQUIRE_POLICY_KEY,
      CourseOfferingsController.prototype.bindSyllabus,
    ),
    ACADEMIC_POLICY_NAMES.SYLLABUS_BINDING_MANAGE,
  );
  assert.equal(
    Reflect.getMetadata(
      REQUIRE_POLICY_KEY,
      CourseOfferingsController.prototype.bindCurriculum,
    ),
    ACADEMIC_POLICY_NAMES.CURRICULUM_BINDING_MANAGE,
  );
});

test("syllabus binding route forwards only the dedicated DTO target", async () => {
  const calls: unknown[] = [];
  const controller = new CourseOfferingsController({
    bindCourseOfferingSyllabus: async (...args: unknown[]) => {
      calls.push(args);
      return { id: "offering-a", syllabusVersionId: "syllabus-a" };
    },
  } as never);

  assert.deepEqual(
    await controller.bindSyllabus(
      { id: "offering-a" },
      { syllabusVersionId: "syllabus-a" },
    ),
    { id: "offering-a", syllabusVersionId: "syllabus-a" },
  );
  assert.deepEqual(calls, [["offering-a", "syllabus-a"]]);
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

test("syllabus binding requires exact Department Admin permission provenance", () => {
  const authorization = new AuthorizationService();
  const principal = (
    role: "department_admin" | "teacher" | "student",
    withPermission: boolean,
  ) => {
    const userRoleId = `${role}-assignment-a`;
    const roleId = `${role}-role-a`;
    return {
      actorId: `${role}-a`,
      isAuthenticated: true,
      activeDepartmentId: "department-a",
      roleAssignments: [
        {
          userRoleId,
          roleId,
          departmentId: "department-a",
          role,
        },
      ],
      permissions: withPermission
        ? [
            {
              resource: "course-management.syllabus-binding",
              action: "manage",
              scope: "department",
              source: {
                departmentId: "department-a",
                userRoleId,
                roleId,
              },
            },
          ]
        : [],
    } as never;
  };

  assert.equal(
    authorization.isAllowed(
      principal("department_admin", true),
      ACADEMIC_POLICY_NAMES.SYLLABUS_BINDING_MANAGE,
    ),
    true,
  );
  assert.equal(
    authorization.isAllowed(
      principal("department_admin", false),
      ACADEMIC_POLICY_NAMES.SYLLABUS_BINDING_MANAGE,
    ),
    false,
  );
  for (const role of ["teacher", "student"] as const) {
    assert.equal(
      authorization.isAllowed(
        principal(role, true),
        ACADEMIC_POLICY_NAMES.SYLLABUS_BINDING_MANAGE,
      ),
      false,
    );
  }
});
