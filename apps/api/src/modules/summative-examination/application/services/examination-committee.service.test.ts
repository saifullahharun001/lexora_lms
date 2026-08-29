import assert from "node:assert/strict";
import test from "node:test";

import { BadRequestException } from "@nestjs/common";
import {
  ExaminationCommitteeAssignmentStatus,
  ExaminationCommitteeSeat,
  Prisma,
  UserStatus,
} from "@prisma/client";

import { ExaminationCommitteeService } from "./examination-committee.service";

const authority = {
  departmentId: "department-a",
  actorUserId: "admin-a",
  userRoleId: "user-role-a",
  roleId: "role-a",
};

interface TestAssignedUser {
  id: string;
  departmentId: string;
  status: UserStatus;
  archivedAt: Date | null;
  deletedAt: Date | null;
}

interface TestAssignmentFixture {
  id: string;
  departmentId: string;
  examinationId: string;
  committeeId: string;
  assignedUserId: string | null;
  assignedByUserId: string;
  externalMemberName: string | null;
  externalMemberAffiliation: string | null;
  seat: ExaminationCommitteeSeat;
  status: ExaminationCommitteeAssignmentStatus;
  assignedAt: Date;
  expiresAt: Date | null;
  unassignedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  assignedUser?: TestAssignedUser | null;
}

function assignment(
  overrides: Partial<TestAssignmentFixture> = {},
): TestAssignmentFixture {
  return {
    id: "assignment-old",
    departmentId: "department-a",
    examinationId: "exam-a",
    committeeId: "committee-a",
    assignedUserId: "user-old",
    assignedByUserId: "admin-a",
    externalMemberName: null,
    externalMemberAffiliation: null,
    seat: ExaminationCommitteeSeat.CHAIRMAN,
    status: ExaminationCommitteeAssignmentStatus.ACTIVE,
    assignedAt: new Date("2026-08-01T00:00:00.000Z"),
    expiresAt: new Date("2026-08-02T00:00:00.000Z"),
    unassignedAt: null,
    archivedAt: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

function sqlText(query: unknown) {
  const value = query as { sql?: string; text?: string };
  return value.sql ?? value.text ?? String(query);
}

function writeHarness(conflicts = [assignment()]) {
  const records = structuredClone(conflicts);
  const audits: Array<{ data: Record<string, unknown> }> = [];
  const lockOrder: string[] = [];
  const transactionOptions: unknown[] = [];
  let createdData: Record<string, unknown> | undefined;
  let userLocks = 0;
  const tx = {
    $queryRaw: async (query: unknown) => {
      const sql = sqlText(query);
      if (sql.includes('FROM "examinations"')) {
        lockOrder.push("examination");
        return [{ id: "exam-a" }];
      }
      if (sql.includes('FROM "examination_committees"')) {
        lockOrder.push("committee");
        return [{ id: "committee-a" }];
      }
      if (sql.includes('FROM "users"')) {
        lockOrder.push("internal-user");
        userLocks += 1;
        return [{ id: "user-new" }];
      }
      if (sql.includes('FROM "examination_committee_assignments"')) {
        lockOrder.push("assignment-conflicts");
        return records.map((record) => ({ id: record.id }));
      }
      return [];
    },
    examinationCommittee: {
      findFirst: async () => ({ id: "committee-a", examinationId: "exam-a" }),
    },
    examinationCommitteeAssignment: {
      findMany: async () => records,
      updateMany: async (args: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const record = records.find((item) => item.id === args.where.id);
        if (!record) return { count: 0 };
        Object.assign(record, args.data);
        return { count: 1 };
      },
      findFirst: async (args: { where: { id: string } }) =>
        records.find((record) => record.id === args.where.id) ?? null,
      create: async (args: { data: Record<string, unknown> }) => {
        createdData = args.data;
        const created = assignment({
          ...args.data,
          id: "assignment-new",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        records.push(created);
        return created;
      },
    },
    auditLog: {
      create: async (entry: { data: Record<string, unknown> }) => {
        audits.push(entry);
        return entry;
      },
    },
  };
  const prisma = {
    $transaction: async (
      callback: (client: unknown) => Promise<unknown>,
      options: unknown,
    ) => {
      transactionOptions.push(options);
      return callback(tx);
    },
  };
  const service = new ExaminationCommitteeService(
    prisma as never,
    {
      get: () => ({
        requestId: "request-a",
        audit: { ipAddress: "127.0.0.1", userAgent: "test" },
      }),
    } as never,
    {
      authorize: async () => authority,
      assertCurrentAuthority: async () => undefined,
    } as never,
  );
  return {
    audits,
    createdData: () => createdData,
    lockOrder,
    records,
    service,
    transactionOptions,
    userLocks: () => userLocks,
  };
}

test("internal assignment path rejects EXTERNAL_MEMBER before authorization", async () => {
  const service = new ExaminationCommitteeService(
    {} as never,
    {} as never,
    { authorize: async () => assert.fail("must not authorize") } as never,
  );
  await assert.rejects(
    service.assignInternalMember({
      committeeId: "committee-a",
      assignedUserId: "user-a",
      seat: "EXTERNAL_MEMBER" as never,
    }),
    BadRequestException,
  );
});

test("expired ACTIVE occupant is locked, audited, retired, and replaced in one Serializable transaction", async () => {
  const h = writeHarness();
  const created = await h.service.assignInternalMember({
    committeeId: "committee-a",
    assignedUserId: "user-new",
    seat: "CHAIRMAN",
  });
  assert.equal(created.id, "assignment-new");
  assert.equal(h.records[0]!.status, ExaminationCommitteeAssignmentStatus.INACTIVE);
  assert.ok(h.records[0]!.unassignedAt instanceof Date);
  assert.deepEqual(h.lockOrder.slice(0, 4), [
    "examination",
    "committee",
    "internal-user",
    "assignment-conflicts",
  ]);
  assert.equal(
    (h.transactionOptions[0] as { isolationLevel: unknown }).isolationLevel,
    Prisma.TransactionIsolationLevel.Serializable,
  );
  assert.deepEqual(
    h.audits.map((audit) => audit.data.action),
    [
      "summative-examination.committee-assignment.expired-auto-retired",
      "summative-examination.internal-committee-assignment.created",
    ],
  );
});

test("external appointment server-fixes seat and null user without an internal-user lookup", async () => {
  const h = writeHarness([]);
  const created = await h.service.appointExternalMember({
    committeeId: "committee-a",
    externalMemberName: "  Professor External  ",
    externalMemberAffiliation: "  Another Public University  ",
  });
  assert.equal(created.seat, ExaminationCommitteeSeat.EXTERNAL_MEMBER);
  assert.equal(created.assignedUserId, null);
  assert.equal(h.userLocks(), 0);
  assert.deepEqual(
    {
      seat: h.createdData()!.seat,
      assignedUserId: h.createdData()!.assignedUserId,
      externalMemberName: h.createdData()!.externalMemberName,
      externalMemberAffiliation:
        h.createdData()!.externalMemberAffiliation,
      departmentId: h.createdData()!.departmentId,
      assignedByUserId: h.createdData()!.assignedByUserId,
    },
    {
      seat: ExaminationCommitteeSeat.EXTERNAL_MEMBER,
      assignedUserId: null,
      externalMemberName: "Professor External",
      externalMemberAffiliation: "Another Public University",
      departmentId: "department-a",
      assignedByUserId: "admin-a",
    },
  );
  assert.equal(
    h.audits[0]!.data.action,
    "summative-examination.external-committee-member.appointed",
  );
});

test("GET-by-Examination query is department- and Examination-scoped", async () => {
  let query: unknown;
  const service = new ExaminationCommitteeService(
    {
      examinationCommittee: {
        findFirst: async (args: unknown) => {
          query = args;
          return { id: "committee-a", archivedAt: null, assignments: [] };
        },
      },
    } as never,
    {} as never,
    { authorize: async () => authority } as never,
  );
  await service.getCommitteeByExamination("exam-a");
  assert.deepEqual(
    (query as { where: Record<string, unknown> }).where,
    {
      examinationId: "exam-a",
      departmentId: "department-a",
      archivedAt: null,
      examination: {
        id: "exam-a",
        departmentId: "department-a",
        archivedAt: null,
      },
    },
  );
});

test("completeness requires the exact four usable formal appointment shapes", async () => {
  const internalUser = {
    id: "user-a",
    departmentId: "department-a",
    status: UserStatus.ACTIVE,
    archivedAt: null,
    deletedAt: null,
  };
  const records = [
    assignment({
      seat: ExaminationCommitteeSeat.CHAIRMAN,
      assignedUserId: "user-a",
      assignedUser: internalUser,
    }),
    assignment({
      id: "assignment-2",
      seat: ExaminationCommitteeSeat.MEMBER_1,
      assignedUserId: "user-b",
      assignedUser: { ...internalUser, id: "user-b" },
    }),
    assignment({
      id: "assignment-3",
      seat: ExaminationCommitteeSeat.MEMBER_2,
      assignedUserId: "user-c",
      assignedUser: { ...internalUser, id: "user-c" },
    }),
    assignment({
      id: "assignment-4",
      seat: ExaminationCommitteeSeat.EXTERNAL_MEMBER,
      assignedUserId: null,
      externalMemberName: "Professor External",
      externalMemberAffiliation: "Another Public University",
      assignedUser: null,
    }),
  ];
  const prisma = {
    examinationCommitteeAssignment: { findMany: async () => records },
  };
  const context = {
    get: () => ({
      principal: {
        actorId: "admin-a",
        isAuthenticated: true,
        activeDepartmentId: "department-a",
      },
    }),
  };
  const service = new ExaminationCommitteeService(
    prisma as never,
    context as never,
    {} as never,
  );
  assert.equal(await service.isCommitteeComplete("committee-a"), true);
  records[3]!.externalMemberAffiliation = "   ";
  assert.equal(await service.isCommitteeComplete("committee-a"), false);
});

test("digital authority query is RequestContext-bound and excludes External Member", async () => {
  let query: unknown;
  const service = new ExaminationCommitteeService(
    {
      examinationCommitteeAssignment: {
        findFirst: async (args: unknown) => {
          query = args;
          return null;
        },
      },
    } as never,
    {
      get: () => ({
        principal: {
          actorId: "internal-user-a",
          isAuthenticated: true,
          activeDepartmentId: "department-a",
        },
      }),
    } as never,
    {} as never,
  );
  assert.equal(await service.hasCommitteeAuthority("committee-a"), false);
  const where = (query as { where: Record<string, unknown> }).where as {
    assignedUserId: string;
    seat: { in: ExaminationCommitteeSeat[] };
    externalMemberName: null;
    externalMemberAffiliation: null;
  };
  assert.equal(where.assignedUserId, "internal-user-a");
  const authoritySeats: readonly ExaminationCommitteeSeat[] = where.seat.in;
  assert.equal(
    authoritySeats.includes(ExaminationCommitteeSeat.EXTERNAL_MEMBER),
    false,
  );
  assert.deepEqual(where.seat.in, [
    ExaminationCommitteeSeat.CHAIRMAN,
    ExaminationCommitteeSeat.MEMBER_1,
    ExaminationCommitteeSeat.MEMBER_2,
  ]);
  assert.equal(where.externalMemberName, null);
  assert.equal(where.externalMemberAffiliation, null);
});
