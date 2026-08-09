import assert from "node:assert/strict";
import test from "node:test";

import { RequestMethod } from "@nestjs/common";
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";

import { REQUIRE_POLICY_KEY } from "@/modules/authorization/domain/authorization.constants";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { AuthorizationService } from "@/modules/authorization/services/authorization.service";

import { ACADEMIC_POLICY_NAMES } from "../../domain/academic.policy-names";
import { StudentCurriculumAssignmentsController } from "./student-curriculum-assignments.controller";

test("initial assignment route uses PUT, both guards, and its dedicated policy", () => {
  assert.deepEqual(
    Reflect.getMetadata(GUARDS_METADATA, StudentCurriculumAssignmentsController),
    [AuthGuard, PolicyGuard],
  );
  assert.equal(
    Reflect.getMetadata(
      PATH_METADATA,
      StudentCurriculumAssignmentsController.prototype.createInitialAssignment,
    ),
    ":studentUserId/curriculum-assignments/:academicProgramId",
  );
  assert.equal(
    Reflect.getMetadata(
      METHOD_METADATA,
      StudentCurriculumAssignmentsController.prototype.createInitialAssignment,
    ),
    RequestMethod.PUT,
  );
  assert.equal(
    Reflect.getMetadata(
      REQUIRE_POLICY_KEY,
      StudentCurriculumAssignmentsController.prototype.createInitialAssignment,
    ),
    ACADEMIC_POLICY_NAMES.STUDENT_CURRICULUM_ASSIGNMENT_MANAGE,
  );
});

test("only Department Admin receives the assignment policy", () => {
  const authorization = new AuthorizationService();
  const principal = (role: "department_admin" | "teacher" | "student") =>
    ({
      actorId: `${role}-a`,
      isAuthenticated: true,
      activeDepartmentId: "department-a",
      roleAssignments: [{ departmentId: "department-a", role }],
      permissions: [],
    }) as never;

  assert.equal(
    authorization.isAllowed(
      principal("department_admin"),
      ACADEMIC_POLICY_NAMES.STUDENT_CURRICULUM_ASSIGNMENT_MANAGE,
    ),
    true,
  );
  assert.equal(
    authorization.isAllowed(
      principal("teacher"),
      ACADEMIC_POLICY_NAMES.STUDENT_CURRICULUM_ASSIGNMENT_MANAGE,
    ),
    false,
  );
  assert.equal(
    authorization.isAllowed(
      principal("student"),
      ACADEMIC_POLICY_NAMES.STUDENT_CURRICULUM_ASSIGNMENT_MANAGE,
    ),
    false,
  );
});
