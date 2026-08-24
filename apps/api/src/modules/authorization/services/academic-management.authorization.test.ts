import assert from "node:assert/strict";
import test from "node:test";

import type { PrincipalContext } from "@lexora/types";

import { AuthorizationService } from "./authorization.service";

function principal(
  role: "department_admin" | "teacher" | "student",
  withBindingGrant = false,
): PrincipalContext {
  const userRoleId = `${role}-assignment`;
  const roleId = `${role}-role`;
  return {
    actorId: `${role}-user`,
    actorType: "user",
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
    permissions: withBindingGrant
      ? [
          {
            resource: "course-management.student-batch-binding",
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
  };
}

test("ordinary AcademicSession and StudentBatch policies are Department Admin-only static authority", () => {
  const service = new AuthorizationService();
  const policies = [
    "course-management.academic-session.read",
    "course-management.academic-session.manage",
    "course-management.student-batch.read",
    "course-management.student-batch.manage",
  ];

  for (const role of ["department_admin", "teacher", "student"] as const) {
    for (const policy of policies) {
      assert.equal(
        service.isAllowed(principal(role), policy),
        role === "department_admin",
      );
    }
  }
});

test("StudentBatch binding remains excluded from broad authority and requires exact valid Department Admin provenance", () => {
  const service = new AuthorizationService();
  const policy = "course-management.student-batch-binding.manage";

  assert.equal(service.isAllowed(principal("department_admin"), policy), false);
  assert.equal(
    service.isAllowed(principal("department_admin", true), policy),
    true,
  );
  assert.equal(service.isAllowed(principal("teacher", true), policy), false);
  assert.equal(service.isAllowed(principal("student", true), policy), false);

  const malformed = principal("department_admin", true);
  malformed.permissions[0]!.source = {
    ...malformed.permissions[0]!.source,
    roleId: "unloaded-role",
  };
  assert.equal(service.isAllowed(malformed, policy), false);
});
