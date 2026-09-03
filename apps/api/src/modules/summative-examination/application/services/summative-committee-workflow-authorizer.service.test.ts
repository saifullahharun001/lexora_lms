import assert from "node:assert/strict";
import test from "node:test";

import type { PermissionGrant, PrincipalContext } from "@lexora/types";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ExaminationCommitteeSeat } from "@prisma/client";

import { SummativeCommitteeWorkflowAuthorizerService } from "./summative-committee-workflow-authorizer.service";

const assignedAt = new Date("2026-09-01T00:00:00.000Z");
const teacherRole = {
  userRoleId: "teacher-user-role-a",
  roleId: "teacher-role-a",
  departmentId: "department-a",
  role: "teacher" as const,
};

function permission(
  duty: "member" | "chairman",
  overrides: Partial<PermissionGrant> = {},
): PermissionGrant {
  return {
    resource:
      duty === "member"
        ? "summative-examination.member-review"
        : "summative-examination.chairman-approval",
    action: duty === "member" ? "review" : "approve",
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
  duty: "member" | "chairman",
  overrides: Partial<PrincipalContext> = {},
): PrincipalContext {
  return {
    actorId: "committee-user-a",
    actorType: "user",
    isAuthenticated: true,
    activeDepartmentId: "department-a",
    roleAssignments: [teacherRole],
    permissions: [permission(duty)],
    ...overrides,
  };
}

function calculatedResult(seat: ExaminationCommitteeSeat) {
  return {
    id: "calculated-a",
    examinationId: "examination-a",
    examinationCourseId: "course-a",
    candidateId: "candidate-a",
    examination: {
      committees: [
        {
          id: "committee-a",
          assignments: [
            { id: "assignment-a", seat, assignedAt },
          ],
        },
      ],
    },
  };
}

function harness(
  context: PrincipalContext,
  result: ReturnType<typeof calculatedResult> | null,
) {
  const queries: unknown[] = [];
  const service = new SummativeCommitteeWorkflowAuthorizerService(
    {
      summativeCalculatedMark: {
        findFirst: async (query: unknown) => {
          queries.push(query);
          return result;
        },
      },
    } as never,
    { get: () => ({ principal: context }) } as never,
  );
  return { service, queries };
}

for (const seat of [
  ExaminationCommitteeSeat.MEMBER_1,
  ExaminationCommitteeSeat.MEMBER_2,
]) {
  test(`${seat} is server-resolved for Member review`, async () => {
    const h = harness(principal("member"), calculatedResult(seat));
    const authority = await h.service.authorizeMemberReview("calculated-a");
    assert.deepEqual(authority, {
      departmentId: "department-a",
      actorUserId: "committee-user-a",
      userRoleId: teacherRole.userRoleId,
      roleId: teacherRole.roleId,
      duty: "MEMBER_REVIEW",
      calculatedMarkId: "calculated-a",
      examinationId: "examination-a",
      examinationCourseId: "course-a",
      candidateId: "candidate-a",
      committeeId: "committee-a",
      committeeAssignmentId: "assignment-a",
      seat,
      assignmentAssignedAt: assignedAt,
    });
    const query = h.queries[0] as {
      where: {
        departmentId: string;
        department: Record<string, unknown>;
        examination: Record<string, unknown>;
      };
      select: {
        examination: {
          select: {
            committees: {
              select: { assignments: { where: Record<string, unknown> } };
            };
          };
        };
      };
    };
    assert.equal(query.where.departmentId, "department-a");
    assert.deepEqual(query.where.department, {
      is: {
        status: "ACTIVE",
        archivedAt: null,
        deletedAt: null,
      },
    });
    const assignmentWhere =
      query.select.examination.select.committees.select.assignments.where;
    assert.equal(assignmentWhere.assignedUserId, "committee-user-a");
    assert.deepEqual(assignmentWhere.seat, {
      in: [ExaminationCommitteeSeat.MEMBER_1, ExaminationCommitteeSeat.MEMBER_2],
    });
    assert.equal(assignmentWhere.unassignedAt, null);
    assert.equal(assignmentWhere.archivedAt, null);
  });
}

test("only the exact Chairman seat is server-resolved for final approval", async () => {
  const authority = await harness(
    principal("chairman"),
    calculatedResult(ExaminationCommitteeSeat.CHAIRMAN),
  ).service.authorizeChairmanApproval("calculated-a");
  assert.equal(authority.seat, ExaminationCommitteeSeat.CHAIRMAN);
  assert.equal(authority.duty, "CHAIRMAN_APPROVAL");
});

test("unauthenticated, Admin-only, ordinary Teacher and fabricated provenance fail before object lookup", async () => {
  const cases = [
    principal("member", { isAuthenticated: false }),
    principal("member", {
      roleAssignments: [{ ...teacherRole, role: "department_admin" }],
    }),
    principal("member", { permissions: [] }),
    principal("member", {
      permissions: [
        permission("member", {
          source: {
            departmentId: "department-a",
            userRoleId: "forged-user-role",
            roleId: teacherRole.roleId,
          },
        }),
      ],
    }),
    principal("member", {
      permissions: [
        {
          resource: "summative-examination.examiner-marks",
          action: "enter",
          scope: "department",
          source: permission("member").source,
        },
      ],
    }),
  ];
  for (const context of cases) {
    const h = harness(
      context,
      calculatedResult(ExaminationCommitteeSeat.MEMBER_1),
    );
    await assert.rejects(
      h.service.authorizeMemberReview("calculated-a"),
      ForbiddenException,
    );
    assert.equal(h.queries.length, 0);
  }
});

test("Chairman, External Member and wrong Member object cannot acquire Member review authority", async () => {
  for (const seat of [
    ExaminationCommitteeSeat.CHAIRMAN,
    ExaminationCommitteeSeat.EXTERNAL_MEMBER,
  ]) {
    const h = harness(principal("member"), calculatedResult(seat));
    await assert.rejects(
      h.service.authorizeMemberReview("calculated-a"),
      ForbiddenException,
    );
  }
  const absent = harness(principal("member"), null);
  await assert.rejects(
    absent.service.authorizeMemberReview("foreign-calculated"),
    NotFoundException,
  );
});

test("transactional authority revalidation is exact and fails closed on live revocation", async () => {
  const authority = await harness(
    principal("member"),
    calculatedResult(ExaminationCommitteeSeat.MEMBER_1),
  ).service.authorizeMemberReview("calculated-a");
  const rawQueries: unknown[] = [];
  const service = harness(
    principal("member"),
    calculatedResult(ExaminationCommitteeSeat.MEMBER_1),
  ).service;
  await service.assertCurrentAuthority(
    {
      $queryRaw: async (query: unknown) => {
        rawQueries.push(query);
        return [{ id: "assignment-a" }];
      },
    } as never,
    authority,
    new Date("2026-09-02T00:00:00.000Z"),
  );
  const rawQuery = rawQueries[0] as { sql?: string; values?: unknown[] };
  const sql = String(rawQuery.sql ?? rawQuery);
  for (const evidence of [
    /summative_calculated_marks/,
    /examination_committee_assignments/,
    /assigned_at/,
    /user_roles/,
    /role_permissions/,
    /FOR UPDATE OF ur, a FOR SHARE/,
  ]) {
    assert.match(sql, evidence);
  }
  assert.ok(
    rawQuery.values?.includes(
      "summative-examination.member-review.review_department",
    ),
  );
  await assert.rejects(
    service.assertCurrentAuthority(
      { $queryRaw: async () => [] } as never,
      authority,
      new Date(),
    ),
    ForbiddenException,
  );
});
