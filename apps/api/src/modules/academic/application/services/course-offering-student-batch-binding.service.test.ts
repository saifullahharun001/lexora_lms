import assert from "node:assert/strict";
import test from "node:test";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { PermissionScope } from "@prisma/client";

import type { BindCourseOfferingStudentBatchResult } from "../ports/academic.repository.port";
import { AcademicService } from "./academic.service";

type Role = "department_admin" | "teacher" | "student";

function exactGrant(role: Role = "department_admin") {
  return {
    resource: "course-management.student-batch-binding",
    action: "manage",
    scope: "department" as const,
    source: {
      departmentId: "department-a",
      userRoleId: `${role}-assignment-a`,
      roleId: `${role}-role-a`,
    },
  };
}

function harness(
  options: {
    role?: Role;
    permissions?: ReturnType<typeof exactGrant>[];
    databaseAuthorized?: boolean;
    result?: BindCourseOfferingStudentBatchResult;
  } = {},
) {
  const role = options.role ?? "department_admin";
  const permissions =
    options.permissions ??
    (role === "department_admin" ? [exactGrant(role)] : []);
  const result = options.result ?? {
    outcome: "BOUND" as const,
    offering: { id: "offering-a", studentBatchId: "batch-a" },
  };
  const authorizationQueries: unknown[] = [];
  const bindingCalls: Array<Record<string, unknown>> = [];
  const repository = {
    bindCourseOfferingStudentBatch: async (input: Record<string, unknown>) => {
      bindingCalls.push(input);
      return result;
    },
  };
  const prisma = {
    user: {
      findFirst: async (args: unknown) => {
        authorizationQueries.push(args);
        return options.databaseAuthorized === false
          ? null
          : { id: `${role}-user` };
      },
    },
  };
  const context = {
    requestId: "request-a",
    principal: {
      actorId: `${role}-user`,
      actorType: "user",
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
      permissions,
    },
    department: {
      kind: "department",
      departmentId: "department-forged",
      source: "header",
    },
    audit: { ipAddress: "127.0.0.1", userAgent: "test-agent" },
  };

  return {
    authorizationQueries,
    bindingCalls,
    service: new AcademicService(
      repository as never,
      prisma as never,
      { get: () => context } as never,
    ),
  };
}

test("exact active Department Admin authority uses principal department and request audit context", async () => {
  const h = harness();
  assert.deepEqual(
    await h.service.bindCourseOfferingStudentBatch("offering-a", "batch-a"),
    { id: "offering-a", studentBatchId: "batch-a" },
  );
  assert.deepEqual(h.bindingCalls, [
    {
      departmentId: "department-a",
      courseOfferingId: "offering-a",
      studentBatchId: "batch-a",
      actorUserId: "department_admin-user",
      requestId: "request-a",
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
    },
  ]);

  const query = h.authorizationQueries[0] as {
    where: {
      id: string;
      departmentId: string;
      userRoles: {
        some: {
          id: string;
          role: {
            id: string;
            code: string;
            rolePermissions: {
              some: { permission: { is: Record<string, unknown> } };
            };
          };
        };
      };
    };
  };
  assert.equal(query.where.id, "department_admin-user");
  assert.equal(query.where.departmentId, "department-a");
  assert.equal(query.where.userRoles.some.id, "department_admin-assignment-a");
  assert.equal(query.where.userRoles.some.role.id, "department_admin-role-a");
  assert.equal(query.where.userRoles.some.role.code, "department_admin");
  assert.deepEqual(
    query.where.userRoles.some.role.rolePermissions.some.permission.is,
    {
      code: "course-management.student-batch-binding.manage",
      resource: "course-management.student-batch-binding",
      action: "manage",
      scope: PermissionScope.DEPARTMENT,
    },
  );
});

test("missing, wrong, Teacher, and Student authority fail before repository access", async () => {
  const cases = [
    harness({ permissions: [] }),
    harness({
      permissions: [
        {
          ...exactGrant(),
          resource: "course-management.syllabus-binding",
        },
      ],
    }),
    harness({ role: "teacher", permissions: [exactGrant("teacher")] }),
    harness({ role: "student", permissions: [exactGrant("student")] }),
  ];

  for (const h of cases) {
    await assert.rejects(
      h.service.bindCourseOfferingStudentBatch("offering-a", "batch-a"),
      ForbiddenException,
    );
    assert.equal(h.authorizationQueries.length, 0);
    assert.equal(h.bindingCalls.length, 0);
  }
});

test("stale or wrong-department database authority fails closed", async () => {
  const h = harness({ databaseAuthorized: false });
  await assert.rejects(
    h.service.bindCourseOfferingStudentBatch("offering-a", "batch-a"),
    ForbiddenException,
  );
  assert.equal(h.authorizationQueries.length, 1);
  assert.equal(h.bindingCalls.length, 0);
});

test("repository outcomes map to deterministic safe HTTP errors", async () => {
  const cases: Array<
    [
      BindCourseOfferingStudentBatchResult,
      (
        | typeof BadRequestException
        | typeof ConflictException
        | typeof NotFoundException
      ),
    ]
  > = [
    [{ outcome: "OFFERING_NOT_FOUND" }, NotFoundException],
    [{ outcome: "OFFERING_CURRICULUM_NOT_BOUND" }, BadRequestException],
    [{ outcome: "STUDENT_BATCH_NOT_FOUND" }, NotFoundException],
    [{ outcome: "DEPENDENCY_SCOPE_MISMATCH" }, NotFoundException],
    [{ outcome: "PROGRAMME_MISMATCH" }, BadRequestException],
    [{ outcome: "EXAMINATION_COURSE_SCOPE_MISMATCH" }, BadRequestException],
    [{ outcome: "BINDING_CONFLICT" }, ConflictException],
  ];

  for (const [result, exception] of cases) {
    await assert.rejects(
      harness({ result }).service.bindCourseOfferingStudentBatch(
        "offering-a",
        "batch-a",
      ),
      exception,
    );
  }
});
