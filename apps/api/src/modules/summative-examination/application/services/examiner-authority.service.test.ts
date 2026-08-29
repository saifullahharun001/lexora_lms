import assert from "node:assert/strict";
import test from "node:test";

import type { PrincipalContext } from "@lexora/types";
import {
  DepartmentStatus,
  ExaminationCourseExaminerAssignmentStatus,
  ExaminationCourseExaminerSeat,
  UserStatus,
} from "@prisma/client";

import { ExaminerAuthorityService } from "./examiner-authority.service";

const teacherRoleAssignment = {
  userRoleId: "teacher-user-role-a",
  roleId: "teacher-role-a",
  departmentId: "department-a",
  role: "teacher" as const,
};

function principal(
  overrides: Partial<PrincipalContext> = {},
): PrincipalContext {
  return {
    actorId: "examiner-a",
    actorType: "user",
    isAuthenticated: true,
    activeDepartmentId: "department-a",
    roleAssignments: [teacherRoleAssignment],
    permissions: [],
    ...overrides,
  };
}

type AuthorityQuery = {
  where: {
    departmentId: string;
    examinationCourseId: string;
    assignedUserId: string;
    seat: ExaminationCourseExaminerSeat;
    status: ExaminationCourseExaminerAssignmentStatus;
    unassignedAt: null;
    archivedAt: null;
    OR: Array<Record<string, unknown>>;
    department: { is: { status: DepartmentStatus } };
    examinationCourse: {
      is: {
        archivedAt: null;
        examination: { is: { archivedAt: null } };
      };
    };
    assignedUser: {
      is: {
        status: UserStatus;
        archivedAt: null;
        deletedAt: null;
        userRoles: {
          some: {
            id: string;
            roleId: string;
            departmentId: string;
            revokedAt: null;
            OR: Array<Record<string, unknown>>;
            role: {
              id: string;
              departmentId: string;
              code: string;
              archivedAt: null;
            };
          };
        };
      };
    };
  };
};

function harness(
  result:
    | { id: string }
    | null
    | ((query: AuthorityQuery) => { id: string } | null),
  context: PrincipalContext = principal(),
) {
  const queries: AuthorityQuery[] = [];
  return {
    queries,
    service: new ExaminerAuthorityService(
      {
        examinationCourseExaminerAssignment: {
          findFirst: async (query: AuthorityQuery) => {
            queries.push(query);
            return typeof result === "function" ? result(query) : result;
          },
        },
      } as never,
      { get: () => ({ principal: context }) } as never,
    ),
  };
}

for (const [method, seat] of [
  ["hasFirstExaminerAuthority", ExaminationCourseExaminerSeat.FIRST_EXAMINER],
  ["hasSecondExaminerAuthority", ExaminationCourseExaminerSeat.SECOND_EXAMINER],
] as const) {
  test(`assignment plus current Teacher role grants exact ${seat} authority`, async () => {
    const h = harness({ id: "assignment-a" });
    assert.equal(await h.service[method]("exam-course-a"), true);
    const query = h.queries[0]!;
    assert.equal(query.where.departmentId, "department-a");
    assert.equal(query.where.examinationCourseId, "exam-course-a");
    assert.equal(query.where.assignedUserId, "examiner-a");
    assert.equal(query.where.seat, seat);
    assert.equal(
      query.where.status,
      ExaminationCourseExaminerAssignmentStatus.ACTIVE,
    );
    assert.equal(query.where.unassignedAt, null);
    assert.equal(query.where.archivedAt, null);
    assert.deepEqual(query.where.OR[0], { expiresAt: null });
    assert.equal(query.where.department.is.status, DepartmentStatus.ACTIVE);
    assert.equal(query.where.examinationCourse.is.archivedAt, null);
    assert.equal(
      query.where.examinationCourse.is.examination.is.archivedAt,
      null,
    );
    const assignedUser = query.where.assignedUser.is;
    assert.equal(assignedUser.status, UserStatus.ACTIVE);
    assert.equal(assignedUser.archivedAt, null);
    assert.equal(assignedUser.deletedAt, null);
    const teacherUserRole = assignedUser.userRoles.some;
    assert.equal(teacherUserRole.id, teacherRoleAssignment.userRoleId);
    assert.equal(teacherUserRole.roleId, teacherRoleAssignment.roleId);
    assert.equal(
      teacherUserRole.departmentId,
      teacherRoleAssignment.departmentId,
    );
    assert.equal(teacherUserRole.revokedAt, null);
    assert.deepEqual(teacherUserRole.OR[0], { expiresAt: null });
    assert.ok(teacherUserRole.OR[1]);
    assert.deepEqual(teacherUserRole.role, {
      id: teacherRoleAssignment.roleId,
      departmentId: teacherRoleAssignment.departmentId,
      code: "teacher",
      archivedAt: null,
    });
  });
}

test("Student-only, Department-Admin-only, and wrong-department Teacher principals fail before assignment lookup", async () => {
  for (const roleAssignments of [
    [{ ...teacherRoleAssignment, role: "student" as const }],
    [{ ...teacherRoleAssignment, role: "department_admin" as const }],
    [{ ...teacherRoleAssignment, departmentId: "department-b" }],
  ]) {
    const h = harness({ id: "assignment-a" }, principal({ roleAssignments }));
    assert.equal(await h.service.hasFirstExaminerAuthority("exam-course-a"), false);
    assert.equal(h.queries.length, 0);
  }
});

test("another platform role plus a separate valid Teacher role remains eligible", async () => {
  const h = harness(
    { id: "assignment-a" },
    principal({
      roleAssignments: [
        {
          userRoleId: "admin-user-role-a",
          roleId: "admin-role-a",
          departmentId: "department-a",
          role: "department_admin",
        },
        teacherRoleAssignment,
      ],
    }),
  );
  assert.equal(await h.service.hasFirstExaminerAuthority("exam-course-a"), true);
});

for (const invalidCurrentState of [
  "revoked Teacher UserRole",
  "expired Teacher UserRole",
  "archived Teacher Role",
  "inactive/archived/deleted User",
  "expired/inactive/archived Examiner assignment",
]) {
  test(`assignment with ${invalidCurrentState} grants no authority`, async () => {
    const h = harness(null);
    assert.equal(await h.service.hasFirstExaminerAuthority("exam-course-a"), false);
    assert.equal(h.queries.length, 1);
  });
}

test("Course Teacher without an Examiner assignment receives no authority", async () => {
  const h = harness(null);
  assert.equal(await h.service.hasFirstExaminerAuthority("exam-course-a"), false);
  assert.equal(h.queries.length, 1);
});

test("Teacher Examiner for course A receives no authority for course B", async () => {
  const h = harness((query) =>
    query.where.examinationCourseId === "exam-course-a"
      ? { id: "assignment-a" }
      : null,
  );
  assert.equal(await h.service.hasFirstExaminerAuthority("exam-course-a"), true);
  assert.equal(await h.service.hasFirstExaminerAuthority("exam-course-b"), false);
  assert.equal(h.queries[1]!.where.examinationCourseId, "exam-course-b");
});

test("unauthenticated and department-less contexts fail closed without querying assignments", async () => {
  for (const context of [
    principal({ isAuthenticated: false }),
    principal({ activeDepartmentId: null }),
    principal({ actorType: "service" }),
  ]) {
    const h = harness({ id: "assignment-a" }, context);
    assert.equal(await h.service.hasFirstExaminerAuthority("exam-course-a"), false);
    assert.equal(h.queries.length, 0);
  }
});

test("unsupported Third Examiner seat cannot produce usable authority", async () => {
  const h = harness({ id: "assignment-a" });
  assert.equal(
    await h.service.hasAuthority(
      "exam-course-a",
      "THIRD_EXAMINER" as ExaminationCourseExaminerSeat,
    ),
    false,
  );
  assert.equal(h.queries.length, 0);
});
