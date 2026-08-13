import assert from "node:assert/strict";
import test from "node:test";

import type { PermissionGrant, PrincipalContext } from "@lexora/types";

import { AuthorizationService } from "./authorization.service";

function principal(overrides: Partial<PrincipalContext> = {}): PrincipalContext {
  return {
    actorId: "user-a",
    actorType: "user",
    isAuthenticated: true,
    activeDepartmentId: "department-a",
    roleAssignments: [
      {
        userRoleId: "user-role-a",
        roleId: "role-a",
        departmentId: "department-a",
        role: "teacher"
      }
    ],
    permissions: [],
    ...overrides
  };
}

function grant(
  source: Partial<PermissionGrant["source"]> = {},
  overrides: Partial<PermissionGrant> = {}
): PermissionGrant {
  return {
    resource: "custom.record",
    action: "read",
    scope: "department",
    source: {
      departmentId: "department-a",
      userRoleId: "user-role-a",
      roleId: "role-a",
      ...source
    },
    ...overrides
  };
}

test("AuthorizationService derives static authority only from active-department assignments", () => {
  const service = new AuthorizationService();
  assert.equal(
    service.isAllowed(principal(), "course-management.offering.manage"),
    true
  );

  for (const roleAssignments of [
    [
      {
        userRoleId: "user-role-a",
        roleId: "role-a",
        departmentId: "department-b",
        role: "department_admin" as const
      }
    ],
    [
      {
        userRoleId: "",
        roleId: "role-a",
        departmentId: "department-a",
        role: "department_admin" as const
      }
    ]
  ]) {
    assert.equal(
      service.isAllowed(principal({ roleAssignments }), "identity-access.user.manage"),
      false
    );
  }
});

test("AuthorizationService requires exact loaded-role provenance for dynamic permission", () => {
  const service = new AuthorizationService();
  assert.equal(
    service.isAllowed(principal({ permissions: [grant()] }), "custom.record.read"),
    true
  );

  for (const invalidGrant of [
    grant({ departmentId: "department-b" }),
    grant({ userRoleId: "user-role-b" }),
    grant({ roleId: "role-b" })
  ]) {
    assert.equal(
      service.isAllowed(
        principal({ permissions: [invalidGrant] }),
        "custom.record.read"
      ),
      false
    );
  }

  assert.equal(
    service.isAllowed(
      principal({ roleAssignments: [], permissions: [grant()] }),
      "custom.record.read"
    ),
    false
  );
});

test("AuthorizationService cache identity includes permission provenance", () => {
  const service = new AuthorizationService();
  const allowed = principal({ permissions: [grant()] });
  const mismatched = principal({ permissions: [grant({ roleId: "role-b" })] });

  assert.equal(service.isAllowed(allowed, "custom.record.read"), true);
  assert.equal(service.isAllowed(mismatched, "custom.record.read"), false);
});

test("AuthorizationService cache identity includes role-assignment provenance", () => {
  const service = new AuthorizationService();
  const permission = grant();
  assert.equal(
    service.isAllowed(principal({ permissions: [permission] }), "custom.record.read"),
    true
  );
  assert.equal(
    service.isAllowed(
      principal({
        roleAssignments: [
          {
            userRoleId: "user-role-b",
            roleId: "role-b",
            departmentId: "department-a",
            role: "teacher"
          }
        ],
        permissions: [permission]
      }),
      "custom.record.read"
    ),
    false
  );
});

test("AuthorizationService preserves valid wildcard behavior", () => {
  const service = new AuthorizationService();
  assert.equal(
    service.isAllowed(
      principal({
        roleAssignments: [
          {
            userRoleId: "admin-assignment",
            roleId: "admin-role",
            departmentId: "department-a",
            role: "department_admin"
          }
        ]
      }),
      "course-management.curriculum-version.lifecycle.manage"
    ),
    true
  );
});

test("AuthorizationService accepts service principals with empty authority", () => {
  const service = new AuthorizationService();
  assert.deepEqual(
    Array.from(
      service.resolvePolicies({
        actorId: "service-a",
        actorType: "service",
        isAuthenticated: true,
        activeDepartmentId: null,
        roleAssignments: [],
        permissions: []
      })
    ),
    []
  );
});
