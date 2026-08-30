import assert from "node:assert/strict";
import test from "node:test";

import type { PermissionGrant, PrincipalContext } from "@lexora/types";
import { ForbiddenException } from "@nestjs/common";
import {
  ExaminationCourseExaminerAssignmentStatus,
  ExaminationCourseExaminerSeat,
  PermissionScope,
  UserStatus,
} from "@prisma/client";

import { ExaminerAuthorityService } from "./examiner-authority.service";

const teacherRole = {
  userRoleId: "teacher-user-role-a",
  roleId: "teacher-role-a",
  departmentId: "department-a",
  role: "teacher" as const,
};

function marksPermission(
  overrides: Partial<PermissionGrant> = {},
): PermissionGrant {
  return {
    resource: "summative-examination.examiner-marks",
    action: "enter",
    scope: "department",
    source: {
      departmentId: teacherRole.departmentId,
      userRoleId: teacherRole.userRoleId,
      roleId: teacherRole.roleId,
    },
    ...overrides,
  };
}

function principal(
  overrides: Partial<PrincipalContext> = {},
): PrincipalContext {
  return {
    actorId: "examiner-a",
    actorType: "user",
    isAuthenticated: true,
    activeDepartmentId: "department-a",
    roleAssignments: [teacherRole],
    permissions: [marksPermission()],
    ...overrides,
  };
}

function assignment(
  seat: ExaminationCourseExaminerSeat =
    ExaminationCourseExaminerSeat.FIRST_EXAMINER,
) {
  return {
    id: `assignment-${seat}`,
    examinationId: "examination-a",
    examinationCourseId: "exam-course-a",
    seat,
  };
}

interface AssignmentAuthorityFixture {
  record: ReturnType<typeof assignment>;
  departmentId: string;
  assignedUserId: string;
  status: ExaminationCourseExaminerAssignmentStatus;
  assignedAt: Date;
  expiresAt: Date | null;
  unassignedAt: Date | null;
  archivedAt: Date | null;
  user: {
    departmentId: string;
    status: UserStatus;
    archivedAt: Date | null;
    deletedAt: Date | null;
  };
  userRole: {
    revokedAt: Date | null;
    expiresAt: Date | null;
  };
  role: {
    code: string;
    archivedAt: Date | null;
  };
}

function authorityFixture(
  seat: ExaminationCourseExaminerSeat =
    ExaminationCourseExaminerSeat.FIRST_EXAMINER,
  overrides: Omit<
    Partial<AssignmentAuthorityFixture>,
    "record" | "user" | "userRole" | "role"
  > & {
    record?: Partial<AssignmentAuthorityFixture["record"]>;
    user?: Partial<AssignmentAuthorityFixture["user"]>;
    userRole?: Partial<AssignmentAuthorityFixture["userRole"]>;
    role?: Partial<AssignmentAuthorityFixture["role"]>;
  } = {},
): AssignmentAuthorityFixture {
  return {
    departmentId: "department-a",
    assignedUserId: "examiner-a",
    status: ExaminationCourseExaminerAssignmentStatus.ACTIVE,
    assignedAt: new Date("2026-08-01T00:00:00.000Z"),
    expiresAt: null,
    unassignedAt: null,
    archivedAt: null,
    ...overrides,
    record: { ...assignment(seat), ...overrides.record },
    user: {
      departmentId: "department-a",
      status: UserStatus.ACTIVE,
      archivedAt: null,
      deletedAt: null,
      ...overrides.user,
    },
    userRole: {
      revokedAt: null,
      expiresAt: null,
      ...overrides.userRole,
    },
    role: {
      code: "teacher",
      archivedAt: null,
      ...overrides.role,
    },
  };
}

function isCurrentAuthorityFixture(
  fixture: AssignmentAuthorityFixture | null,
) {
  const evaluatedAt = new Date();
  return Boolean(
    fixture &&
      fixture.departmentId === "department-a" &&
      fixture.assignedUserId === "examiner-a" &&
      fixture.record.examinationCourseId === "exam-course-a" &&
      fixture.status === ExaminationCourseExaminerAssignmentStatus.ACTIVE &&
      fixture.assignedAt <= evaluatedAt &&
      (!fixture.expiresAt || fixture.expiresAt > evaluatedAt) &&
      !fixture.unassignedAt &&
      !fixture.archivedAt &&
      fixture.user.departmentId === "department-a" &&
      fixture.user.status === UserStatus.ACTIVE &&
      !fixture.user.archivedAt &&
      !fixture.user.deletedAt &&
      !fixture.userRole.revokedAt &&
      (!fixture.userRole.expiresAt || fixture.userRole.expiresAt > evaluatedAt) &&
      fixture.role.code === "teacher" &&
      !fixture.role.archivedAt,
  );
}

function harness(
  context: PrincipalContext,
  currentAuthority: AssignmentAuthorityFixture | null,
  rawRows: Array<{ id: string }> = [{ id: "assignment-FIRST_EXAMINER" }],
) {
  const findQueries: unknown[] = [];
  const rawQueries: unknown[] = [];
  const prisma = {
    examinationCourseExaminerAssignment: {
      findFirst: async (query: unknown) => {
        findQueries.push(query);
        return isCurrentAuthorityFixture(currentAuthority)
          ? currentAuthority!.record
          : null;
      },
    },
    $queryRaw: async (query: unknown) => {
      rawQueries.push(query);
      return rawRows;
    },
  };
  return {
    findQueries,
    rawQueries,
    service: new ExaminerAuthorityService(
      prisma as never,
      { get: () => ({ principal: context }) } as never,
    ),
  };
}

for (const seat of [
  ExaminationCourseExaminerSeat.FIRST_EXAMINER,
  ExaminationCourseExaminerSeat.SECOND_EXAMINER,
]) {
  test(`${seat} receives only the server-resolved own assignment identity`, async () => {
    const h = harness(principal(), authorityFixture(seat));
    const authority = await h.service.authorizeMarking("exam-course-a");
    assert.deepEqual(authority, {
      departmentId: "department-a",
      actorUserId: "examiner-a",
      userRoleId: "teacher-user-role-a",
      roleId: "teacher-role-a",
      examinerAssignmentId: `assignment-${seat}`,
      examinationId: "examination-a",
      examinationCourseId: "exam-course-a",
      seat,
    });
    const query = h.findQueries[0] as {
      where: Record<string, unknown> & {
        assignedUserId: string;
        examinationCourseId: string;
        status: ExaminationCourseExaminerAssignmentStatus;
        seat: { in: ExaminationCourseExaminerSeat[] };
      };
    };
    assert.equal(query.where.assignedUserId, "examiner-a");
    assert.equal(query.where.examinationCourseId, "exam-course-a");
    assert.equal(
      query.where.status,
      ExaminationCourseExaminerAssignmentStatus.ACTIVE,
    );
    assert.deepEqual(query.where.seat.in, [
      ExaminationCourseExaminerSeat.FIRST_EXAMINER,
      ExaminationCourseExaminerSeat.SECOND_EXAMINER,
    ]);
    const assignedUser = query.where.assignedUser as {
      is: {
        status: UserStatus;
        archivedAt: null;
        deletedAt: null;
        userRoles: { some: Record<string, unknown> };
      };
    };
    assert.equal(assignedUser.is.status, UserStatus.ACTIVE);
    assert.equal(assignedUser.is.archivedAt, null);
    assert.equal(assignedUser.is.deletedAt, null);
    assert.equal(assignedUser.is.userRoles.some.revokedAt, null);
    const assignedAt = query.where.assignedAt as { lte: Date };
    assert.deepEqual(assignedUser.is.userRoles.some.OR, [
      { expiresAt: null },
      { expiresAt: { gt: assignedAt.lte } },
    ]);
    const role = assignedUser.is.userRoles.some.role as {
      code: string;
      archivedAt: null;
    };
    assert.equal(role.code, "teacher");
    assert.equal(role.archivedAt, null);
  });
}

test("unauthenticated, department-less, Student and Department-Admin-only principals fail before lookup", async () => {
  const cases = [
    principal({ isAuthenticated: false }),
    principal({ activeDepartmentId: null }),
    principal({ actorType: "service" }),
    principal({
      roleAssignments: [{ ...teacherRole, role: "student" }],
    }),
    principal({
      roleAssignments: [{ ...teacherRole, role: "department_admin" }],
    }),
  ];
  for (const context of cases) {
    const h = harness(context, authorityFixture());
    await assert.rejects(
      h.service.authorizeMarking("exam-course-a"),
      ForbiddenException,
    );
    assert.equal(h.findQueries.length, 0);
  }
});

test("Teacher permission without an exact Examiner assignment fails closed", async () => {
  const h = harness(principal(), null);
  await assert.rejects(
    h.service.authorizeMarking("exam-course-a"),
    ForbiddenException,
  );
  assert.equal(h.findQueries.length, 1);
});

test("wrong-department or fabricated permission provenance fails before assignment lookup", async () => {
  for (const context of [
    principal({
      roleAssignments: [{ ...teacherRole, departmentId: "department-b" }],
    }),
    principal({
      permissions: [
        marksPermission({
          source: {
            departmentId: "department-a",
            userRoleId: "fabricated-user-role",
            roleId: teacherRole.roleId,
          },
        }),
      ],
    }),
    principal({ permissions: [] }),
  ]) {
    const h = harness(context, authorityFixture());
    await assert.rejects(
      h.service.authorizeMarking("exam-course-a"),
      ForbiddenException,
    );
    assert.equal(h.findQueries.length, 0);
  }
});

test("distinct stale assignment and Teacher authority states fail closed", async () => {
  const expiredAt = new Date("2026-01-01T00:00:00.000Z");
  const changedAt = new Date("2026-08-20T00:00:00.000Z");
  const cases: Array<[string, AssignmentAuthorityFixture]> = [
    [
      "expired assignment",
      authorityFixture(undefined, { expiresAt: expiredAt }),
    ],
    [
      "inactive assignment",
      authorityFixture(undefined, {
        status: ExaminationCourseExaminerAssignmentStatus.INACTIVE,
        unassignedAt: changedAt,
      }),
    ],
    [
      "archived assignment",
      authorityFixture(undefined, {
        status: ExaminationCourseExaminerAssignmentStatus.ARCHIVED,
        archivedAt: changedAt,
      }),
    ],
    [
      "foreign-department assignment",
      authorityFixture(undefined, { departmentId: "department-b" }),
    ],
    [
      "revoked Teacher UserRole",
      authorityFixture(undefined, { userRole: { revokedAt: changedAt } }),
    ],
    [
      "expired Teacher UserRole",
      authorityFixture(undefined, { userRole: { expiresAt: expiredAt } }),
    ],
    [
      "archived Teacher role",
      authorityFixture(undefined, { role: { archivedAt: changedAt } }),
    ],
    [
      "inactive User",
      authorityFixture(undefined, { user: { status: UserStatus.SUSPENDED } }),
    ],
    [
      "archived User",
      authorityFixture(undefined, { user: { archivedAt: changedAt } }),
    ],
    [
      "deleted User",
      authorityFixture(undefined, { user: { deletedAt: changedAt } }),
    ],
  ];
  for (const [label, fixture] of cases) {
    const h = harness(principal(), fixture);
    await assert.rejects(
      h.service.authorizeMarking("exam-course-a"),
      ForbiddenException,
      label,
    );
  }
});

test("transactional assertion binds live UserRole, permission, assignment, seat, actor, department and course", async () => {
  const h = harness(principal(), authorityFixture());
  const authority = await h.service.authorizeMarking("exam-course-a");
  const rawHarness = harness(principal(), authorityFixture());
  await rawHarness.service.assertCurrentMarkingAuthority(
    {
      $queryRaw: async (query: unknown) => {
        rawHarness.rawQueries.push(query);
        return [{ id: authority.examinerAssignmentId }];
      },
    } as never,
    authority,
    new Date("2026-08-30T00:00:00.000Z"),
  );
  const query = rawHarness.rawQueries[0] as { sql?: string; text?: string };
  const sql = query.sql ?? query.text ?? String(query);
  for (const evidence of [
    /assigned_user_id/,
    /examination_course_id/,
    /FIRST_EXAMINER.*SECOND_EXAMINER/s,
    /user_roles/,
    /role_permissions/,
    /permissions/,
    /revoked_at/,
    /expires_at/,
    /archived_at/,
    /deleted_at/,
    /FOR UPDATE OF ur, a FOR SHARE OF u, d, r, rp, p/,
  ]) {
    assert.match(sql, evidence);
  }
  assert.equal(PermissionScope.DEPARTMENT, "DEPARTMENT");
});

test("transactional authority loss is denied inside the write transaction", async () => {
  const authority = await harness(
    principal(),
    authorityFixture(),
  ).service.authorizeMarking("exam-course-a");
  const service = harness(principal(), authorityFixture(), []).service;
  await assert.rejects(
    service.assertCurrentMarkingAuthority(
      { $queryRaw: async () => [] } as never,
      authority,
      new Date(),
    ),
    ForbiddenException,
  );
});
