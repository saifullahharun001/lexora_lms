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

test("syllabus binding is excluded from broad role authority and requires an exact Department Admin grant", () => {
  const service = new AuthorizationService();
  const policy = "course-management.syllabus-binding.manage";
  const adminAssignment = {
    userRoleId: "admin-assignment",
    roleId: "admin-role",
    departmentId: "department-a",
    role: "department_admin" as const
  };
  const exactGrant = grant(
    {
      userRoleId: adminAssignment.userRoleId,
      roleId: adminAssignment.roleId
    },
    {
      resource: "course-management.syllabus-binding",
      action: "manage",
      scope: "department"
    }
  );

  assert.equal(
    service.isAllowed(
      principal({ roleAssignments: [adminAssignment], permissions: [] }),
      policy
    ),
    false
  );
  assert.equal(
    service.isAllowed(
      principal({
        roleAssignments: [adminAssignment],
        permissions: [exactGrant]
      }),
      policy
    ),
    true
  );
  assert.equal(
    service.isAllowed(
      principal({
        roleAssignments: [adminAssignment],
        permissions: [
          { ...exactGrant, scope: "self" },
          { ...exactGrant, resource: "course-management.syllabus-version" }
        ]
      }),
      policy
    ),
    false
  );
  assert.equal(
    service.isAllowed(principal({ permissions: [exactGrant] }), policy),
    false
  );
});

test("StudentBatch binding is excluded from broad role authority and requires an exact Department Admin grant", () => {
  const service = new AuthorizationService();
  const policy = "course-management.student-batch-binding.manage";
  const adminAssignment = {
    userRoleId: "admin-assignment",
    roleId: "admin-role",
    departmentId: "department-a",
    role: "department_admin" as const
  };
  const exactGrant = grant(
    {
      userRoleId: adminAssignment.userRoleId,
      roleId: adminAssignment.roleId
    },
    {
      resource: "course-management.student-batch-binding",
      action: "manage",
      scope: "department"
    }
  );

  assert.equal(
    service.isAllowed(
      principal({ roleAssignments: [adminAssignment], permissions: [] }),
      policy
    ),
    false
  );
  assert.equal(
    service.isAllowed(
      principal({
        roleAssignments: [adminAssignment],
        permissions: [exactGrant]
      }),
      policy
    ),
    true
  );
  for (const role of ["teacher", "student"] as const) {
    assert.equal(
      service.isAllowed(
        principal({
          roleAssignments: [
            {
              ...adminAssignment,
              role
            }
          ],
          permissions: [exactGrant]
        }),
        policy
      ),
      false
    );
  }
});

test("Batch Coordinator assignment management excludes wildcard authority and requires exact Department Admin provenance", () => {
  const service = new AuthorizationService();
  const policy = "course-management.batch-coordinator-assignment.manage";
  const adminAssignment = {
    userRoleId: "admin-assignment",
    roleId: "admin-role",
    departmentId: "department-a",
    role: "department_admin" as const
  };
  const exactGrant = grant(
    {
      userRoleId: adminAssignment.userRoleId,
      roleId: adminAssignment.roleId
    },
    {
      resource: "course-management.batch-coordinator-assignment",
      action: "manage",
      scope: "department"
    }
  );

  assert.equal(
    service.isAllowed(
      principal({ roleAssignments: [adminAssignment], permissions: [] }),
      policy
    ),
    false
  );
  assert.equal(
    service.isAllowed(
      principal({
        roleAssignments: [adminAssignment],
        permissions: [exactGrant]
      }),
      policy
    ),
    true
  );

  for (const invalid of [
    { ...exactGrant, resource: "course-management.student-batch-binding" },
    { ...exactGrant, action: "read" },
    { ...exactGrant, scope: "self" as const },
    {
      ...exactGrant,
      source: { ...exactGrant.source, userRoleId: "fabricated" }
    },
    { ...exactGrant, source: { ...exactGrant.source, roleId: "other-role" } },
    {
      ...exactGrant,
      source: { ...exactGrant.source, departmentId: "department-b" }
    }
  ]) {
    assert.equal(
      service.isAllowed(
        principal({
          roleAssignments: [adminAssignment],
          permissions: [invalid]
        }),
        policy
      ),
      false
    );
  }

  for (const role of ["teacher", "student"] as const) {
    assert.equal(
      service.isAllowed(
        principal({
          roleAssignments: [{ ...adminAssignment, role }],
          permissions: [exactGrant]
        }),
        policy
      ),
      false
    );
  }
});

test("Course Outline approval excludes every role wildcard and requires exact loaded DEPARTMENT permission provenance", () => {
  const service = new AuthorizationService();
  const policy = "course-management.course-outline.approve";
  const assignment = {
    userRoleId: "approver-assignment",
    roleId: "approver-role",
    departmentId: "department-a",
    role: "support" as const
  };
  const exactGrant = grant(
    {
      userRoleId: assignment.userRoleId,
      roleId: assignment.roleId
    },
    {
      resource: "course-management.course-outline",
      action: "approve",
      scope: "department"
    }
  );

  for (const role of ["department_admin", "teacher", "student", "auditor", "support"] as const) {
    assert.equal(
      service.isAllowed(
        principal({
          roleAssignments: [{ ...assignment, role }],
          permissions: []
        }),
        policy
      ),
      false
    );
  }
  assert.equal(
    service.isAllowed(
      principal({ roleAssignments: [assignment], permissions: [exactGrant] }),
      policy
    ),
    true
  );

  for (const invalidGrant of [
    { ...exactGrant, resource: "course-management" },
    { ...exactGrant, action: "manage" },
    { ...exactGrant, scope: "self" as const },
    {
      ...exactGrant,
      source: { ...exactGrant.source, departmentId: "department-b" }
    },
    {
      ...exactGrant,
      source: { ...exactGrant.source, userRoleId: "other-assignment" }
    },
    { ...exactGrant, source: { ...exactGrant.source, roleId: "other-role" } }
  ]) {
    assert.equal(
      service.isAllowed(
        principal({
          roleAssignments: [assignment],
          permissions: [invalidGrant]
        }),
        policy
      ),
      false
    );
  }

  const wildcardGrant = {
    ...exactGrant,
    resource: "course-management",
    action: "*"
  };
  assert.equal(
    service.resolvePolicies(
      principal({ roleAssignments: [assignment], permissions: [wildcardGrant] })
    ).has("course-management.*"),
    true
  );
  assert.equal(
    service.isAllowed(
      principal({ roleAssignments: [assignment], permissions: [wildcardGrant] }),
      policy
    ),
    false
  );
});

test("Course Outline activation excludes every role wildcard and requires exact loaded DEPARTMENT permission provenance", () => {
  const service = new AuthorizationService();
  const policy = "course-management.course-outline.activate";
  const assignment = {
    userRoleId: "activator-assignment",
    roleId: "activator-role",
    departmentId: "department-a",
    role: "support" as const
  };
  const exactGrant = grant(
    {
      userRoleId: assignment.userRoleId,
      roleId: assignment.roleId
    },
    {
      resource: "course-management.course-outline",
      action: "activate",
      scope: "department"
    }
  );

  for (const role of ["department_admin", "teacher", "student", "auditor", "support"] as const) {
    assert.equal(
      service.isAllowed(
        principal({
          roleAssignments: [{ ...assignment, role }],
          permissions: []
        }),
        policy
      ),
      false
    );
  }
  assert.equal(
    service.isAllowed(
      principal({ roleAssignments: [assignment], permissions: [exactGrant] }),
      policy
    ),
    true
  );

  for (const invalidGrant of [
    { ...exactGrant, resource: "course-management" },
    { ...exactGrant, action: "manage" },
    { ...exactGrant, scope: "self" as const },
    {
      ...exactGrant,
      source: { ...exactGrant.source, departmentId: "department-b" }
    },
    {
      ...exactGrant,
      source: { ...exactGrant.source, userRoleId: "other-assignment" }
    },
    { ...exactGrant, source: { ...exactGrant.source, roleId: "other-role" } }
  ]) {
    assert.equal(
      service.isAllowed(
        principal({
          roleAssignments: [assignment],
          permissions: [invalidGrant]
        }),
        policy
      ),
      false
    );
  }

  const wildcardGrant = {
    ...exactGrant,
    resource: "course-management",
    action: "*"
  };
  assert.equal(
    service
      .resolvePolicies(
        principal({
          roleAssignments: [assignment],
          permissions: [wildcardGrant]
        })
      )
      .has("course-management.*"),
    true
  );
  assert.equal(
    service.isAllowed(
      principal({
        roleAssignments: [assignment],
        permissions: [wildcardGrant]
      }),
      policy
    ),
    false
  );
});

test("Course Outline archival excludes every role wildcard and requires exact loaded DEPARTMENT permission provenance", () => {
  const service = new AuthorizationService();
  const policy = "course-management.course-outline.archive";
  const assignment = {
    userRoleId: "archiver-assignment",
    roleId: "archiver-role",
    departmentId: "department-a",
    role: "support" as const,
  };
  const exactGrant = grant(
    {
      userRoleId: assignment.userRoleId,
      roleId: assignment.roleId,
    },
    {
      resource: "course-management.course-outline",
      action: "archive",
      scope: "department",
    },
  );

  for (const role of [
    "department_admin",
    "teacher",
    "student",
    "auditor",
    "support",
  ] as const) {
    assert.equal(
      service.isAllowed(
        principal({
          roleAssignments: [{ ...assignment, role }],
          permissions: [],
        }),
        policy,
      ),
      false,
    );
  }
  assert.equal(
    service.isAllowed(
      principal({ roleAssignments: [assignment], permissions: [exactGrant] }),
      policy,
    ),
    true,
  );

  for (const invalidGrant of [
    { ...exactGrant, resource: "course-management" },
    { ...exactGrant, action: "manage" },
    { ...exactGrant, scope: "self" as const },
    {
      ...exactGrant,
      source: { ...exactGrant.source, departmentId: "department-b" },
    },
    {
      ...exactGrant,
      source: { ...exactGrant.source, userRoleId: "other-assignment" },
    },
    { ...exactGrant, source: { ...exactGrant.source, roleId: "other-role" } },
  ]) {
    assert.equal(
      service.isAllowed(
        principal({
          roleAssignments: [assignment],
          permissions: [invalidGrant],
        }),
        policy,
      ),
      false,
    );
  }

  const wildcardGrant = {
    ...exactGrant,
    resource: "course-management",
    action: "*",
  };
  assert.equal(
    service.isAllowed(
      principal({
        roleAssignments: [assignment],
        permissions: [wildcardGrant],
      }),
      policy,
    ),
    false,
  );
});

for (const [policy, resource] of [
  ["summative-examination.setup.manage", "summative-examination.setup"],
  [
    "summative-examination.committee.manage",
    "summative-examination.committee",
  ],
  [
    "summative-examination.examiner-assignment.manage",
    "summative-examination.examiner-assignment",
  ],
] as const) {
  test(`${policy} excludes wildcard authority and requires exact Department Admin provenance`, () => {
    const service = new AuthorizationService();
    const assignment = {
      userRoleId: "admin-assignment",
      roleId: "admin-role",
      departmentId: "department-a",
      role: "department_admin" as const,
    };
    const exactGrant = grant(
      { userRoleId: assignment.userRoleId, roleId: assignment.roleId },
      { resource, action: "manage", scope: "department" },
    );
    assert.equal(
      service.isAllowed(
        principal({ roleAssignments: [assignment], permissions: [] }),
        policy,
      ),
      false,
    );
    assert.equal(
      service.isAllowed(
        principal({
          roleAssignments: [assignment],
          permissions: [exactGrant],
        }),
        policy,
      ),
      true,
    );
    for (const invalid of [
      { ...exactGrant, resource: "summative-examination.*" },
      { ...exactGrant, action: "read" },
      { ...exactGrant, scope: "self" as const },
      {
        ...exactGrant,
        source: { ...exactGrant.source, userRoleId: "fabricated" },
      },
      { ...exactGrant, source: { ...exactGrant.source, roleId: "other-role" } },
      {
        ...exactGrant,
        source: { ...exactGrant.source, departmentId: "department-b" },
      },
    ]) {
      assert.equal(
        service.isAllowed(
          principal({
            roleAssignments: [assignment],
            permissions: [invalid],
          }),
          policy,
        ),
        false,
      );
    }
    assert.equal(
      service.isAllowed(
        principal({
          roleAssignments: [{ ...assignment, role: "teacher" }],
          permissions: [exactGrant],
        }),
        policy,
      ),
      false,
    );
    assert.equal(
      service.isAllowed(
        principal({
          roleAssignments: [{ ...assignment, role: "student" }],
          permissions: [exactGrant],
        }),
        policy,
      ),
      false,
    );
  });
}

test("Course Outline Coordinator review admits only active-department Teacher and Department Admin roles", () => {
  const service = new AuthorizationService();
  const policy = "course-management.course-outline.coordinator-review";

  for (const role of ["department_admin", "teacher", "student", "auditor", "support"] as const) {
    assert.equal(
      service.isAllowed(
        principal({
          roleAssignments: [
            {
              userRoleId: `${role}-assignment`,
              roleId: `${role}-role`,
              departmentId: "department-a",
              role
            }
          ]
        }),
        policy
      ),
      role === "department_admin" || role === "teacher"
    );
  }

  assert.equal(
    service.isAllowed(
      principal({
        roleAssignments: [
          {
            userRoleId: "admin-assignment",
            roleId: "admin-role",
            departmentId: "department-b",
            role: "department_admin"
          }
        ]
      }),
      policy
    ),
    false
  );
});

test("Course Outline Coordinator review cannot be admitted by a wildcard permission alone", () => {
  const service = new AuthorizationService();
  const supportAssignment = {
    userRoleId: "support-assignment",
    roleId: "support-role",
    departmentId: "department-a",
    role: "support" as const
  };
  const wildcard = grant(
    {
      userRoleId: supportAssignment.userRoleId,
      roleId: supportAssignment.roleId
    },
    { resource: "course-management", action: "*" }
  );
  const supportPrincipal = principal({
    roleAssignments: [supportAssignment],
    permissions: [wildcard]
  });

  assert.equal(service.resolvePolicies(supportPrincipal).has("course-management.*"), true);
  assert.equal(
    service.isAllowed(supportPrincipal, "course-management.course-outline.coordinator-review"),
    false
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
