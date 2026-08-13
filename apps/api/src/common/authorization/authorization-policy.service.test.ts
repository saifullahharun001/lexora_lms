import assert from "node:assert/strict";
import test from "node:test";

import type { PermissionGrant, PrincipalContext } from "@lexora/types";

import { AuthorizationPolicyService } from "./authorization-policy.service";

function grant(
  scope: PermissionGrant["scope"] = "department",
  source: Partial<PermissionGrant["source"]> = {}
): PermissionGrant {
  return {
    resource: "record",
    action: "read",
    scope,
    source: {
      departmentId: "department-a",
      userRoleId: "user-role-a",
      roleId: "role-a",
      ...source
    }
  };
}

function principal(permission: PermissionGrant): PrincipalContext {
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
    permissions: [permission]
  };
}

const department = {
  kind: "department" as const,
  departmentId: "department-a",
  source: "principal" as const
};

test("AuthorizationPolicyService accepts only provenance-valid grants", () => {
  const service = new AuthorizationPolicyService();
  assert.equal(
    service.evaluate({
      principal: principal(grant()),
      department,
      requiredPermissions: ["record:read"]
    }),
    true
  );

  for (const invalid of [
    grant("department", { departmentId: "department-b" }),
    grant("department", { userRoleId: "user-role-b" }),
    grant("department", { roleId: "role-b" })
  ]) {
    assert.equal(
      service.evaluate({
        principal: principal(invalid),
        department,
        requiredPermissions: ["record:read"]
      }),
      false
    );
  }
});

test("AuthorizationPolicyService preserves department mismatch denial", () => {
  assert.equal(
    new AuthorizationPolicyService().evaluate({
      principal: principal(grant()),
      department: {
        kind: "department",
        departmentId: "department-b",
        source: "route"
      },
      requiredPermissions: ["record:read"]
    }),
    false
  );
});

test("public verification remains provenance-validated", () => {
  const service = new AuthorizationPolicyService();
  const publicDepartment = {
    kind: "public_verification" as const,
    departmentId: null,
    source: "public" as const
  };
  assert.equal(
    service.evaluate({
      principal: principal(grant("public_verification")),
      department: publicDepartment,
      requiredPermissions: ["record:read"]
    }),
    true
  );
  assert.equal(
    service.evaluate({
      principal: principal(
        grant("public_verification", { userRoleId: "unloaded-assignment" })
      ),
      department: publicDepartment,
      requiredPermissions: ["record:read"]
    }),
    false
  );
  assert.equal(
    service.evaluate({
      principal: null,
      department: publicDepartment,
      requiredPermissions: ["record:read"]
    }),
    false
  );
});
