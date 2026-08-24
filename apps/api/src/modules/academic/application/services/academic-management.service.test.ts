import assert from "node:assert/strict";
import test from "node:test";

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { AcademicService } from "./academic.service";

const now = new Date("2026-08-24T00:00:00.000Z");

function academicSession(id = "session-a", departmentId = "department-a") {
  return {
    id,
    departmentId,
    code: "2026-2027",
    name: "2026-2027",
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function studentBatch(
  id = "batch-a",
  departmentId = "department-a",
  academicSessionId = "session-a",
) {
  return {
    id,
    departmentId,
    academicProgramId: "program-a",
    academicSessionId,
    code: "LLB-26",
    name: "LL.B. 2026",
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    academicProgram: { id: "program-a", code: "LLB", name: "LL.B." },
    academicSession: {
      id: academicSessionId,
      code: academicSessionId === "session-b" ? "2027-2028" : "2026-2027",
      name: academicSessionId === "session-b" ? "2027-2028" : "2026-2027",
    },
  };
}

function duplicateError() {
  return new PrismaClientKnownRequestError("duplicate", {
    code: "P2002",
    clientVersion: "6.6.0",
    meta: { target: ["department_id", "code"] },
  });
}

function harness(
  repositoryOverrides: Record<string, unknown> = {},
  departmentId = "department-a",
) {
  const calls: Array<{ kind: string; value: unknown }> = [];
  const repository = {
    findProgramById: async (scope: string, id: string) => {
      calls.push({ kind: "program", value: [scope, id] });
      return id === "program-a" && scope === departmentId
        ? { id, departmentId: scope, archivedAt: null }
        : null;
    },
    findAcademicSessions: async (filters: unknown) => {
      calls.push({ kind: "session-list", value: filters });
      return [];
    },
    findAcademicSessionById: async (scope: string, id: string) => {
      calls.push({ kind: "session-detail", value: [scope, id] });
      return id === "session-a" || id === "session-b"
        ? academicSession(id, scope)
        : null;
    },
    createAcademicSession: async (input: Record<string, unknown>) => {
      calls.push({ kind: "session-create", value: input });
      return academicSession("session-created", input.departmentId as string);
    },
    updateAcademicSession: async (input: Record<string, unknown>) => {
      calls.push({ kind: "session-update", value: input });
      return input.academicSessionId === "session-foreign"
        ? null
        : academicSession(
            input.academicSessionId as string,
            input.departmentId as string,
          );
    },
    findStudentBatches: async (filters: unknown) => {
      calls.push({ kind: "batch-list", value: filters });
      return [];
    },
    findStudentBatchById: async (scope: string, id: string) => {
      calls.push({ kind: "batch-detail", value: [scope, id] });
      return id === "batch-foreign" ? null : studentBatch(id, scope);
    },
    createStudentBatch: async (input: Record<string, unknown>) => {
      calls.push({ kind: "batch-create", value: input });
      return studentBatch(
        "batch-created",
        input.departmentId as string,
        input.academicSessionId as string,
      );
    },
    updateStudentBatch: async (input: Record<string, unknown>) => {
      calls.push({ kind: "batch-update", value: input });
      return input.studentBatchId === "batch-foreign"
        ? null
        : studentBatch(
            input.studentBatchId as string,
            input.departmentId as string,
          );
    },
    ...repositoryOverrides,
  };
  const prisma = {
    auditLog: {
      create: async (input: unknown) => {
        calls.push({ kind: "audit", value: input });
        return input;
      },
    },
  };
  const context = {
    requestId: "request-a",
    principal: {
      actorId: "admin-a",
      activeDepartmentId: departmentId,
      roleAssignments: [
        {
          userRoleId: "admin-assignment-a",
          roleId: "admin-role-a",
          departmentId,
          role: "department_admin",
        },
      ],
      permissions: [],
    },
    department: {
      kind: "department",
      departmentId: "department-forged",
      source: "header",
    },
    audit: { ipAddress: "127.0.0.1", userAgent: "test" },
  };

  return {
    calls,
    service: new AcademicService(
      repository as never,
      prisma as never,
      { get: () => context } as never,
    ),
  };
}

test("AcademicSession operations use principal scope and pass authoritative transactional audit context", async () => {
  const h = harness();
  await h.service.createAcademicSession({ code: "2026-2027", name: "2026" });
  await h.service.listAcademicSessions({ search: "2026" });
  await h.service.getAcademicSession("session-a");
  await h.service.updateAcademicSession("session-a", { name: "Session 2026" });

  assert.deepEqual(
    h.calls.find((call) => call.kind === "session-create")?.value,
    {
      departmentId: "department-a",
      actorUserId: "admin-a",
      requestId: "request-a",
      ipAddress: "127.0.0.1",
      userAgent: "test",
      code: "2026-2027",
      name: "2026",
    },
  );
  assert.deepEqual(
    h.calls.find((call) => call.kind === "session-list")?.value,
    { departmentId: "department-a", search: "2026" },
  );
  assert.deepEqual(
    h.calls.find((call) => call.kind === "session-detail")?.value,
    ["department-a", "session-a"],
  );
  assert.deepEqual(
    h.calls.find((call) => call.kind === "session-update")?.value,
    {
      departmentId: "department-a",
      actorUserId: "admin-a",
      requestId: "request-a",
      ipAddress: "127.0.0.1",
      userAgent: "test",
      academicSessionId: "session-a",
      changes: { name: "Session 2026" },
    },
  );
  assert.equal(h.calls.filter((call) => call.kind === "audit").length, 0);
});

test("AcademicSession foreign IDs are safe not-found and empty PATCH is rejected", async () => {
  const h = harness({
    findAcademicSessionById: async () => null,
  });
  await assert.rejects(
    h.service.getAcademicSession("foreign"),
    NotFoundException,
  );
  await assert.rejects(
    h.service.updateAcademicSession("session-a", {}),
    BadRequestException,
  );
  await assert.rejects(
    h.service.updateAcademicSession("session-foreign", { code: "X" }),
    NotFoundException,
  );
  assert.equal(h.calls.filter((call) => call.kind === "audit").length, 0);
});

test("AcademicSession duplicate scope is a controlled conflict and writes no success audit", async () => {
  const h = harness({
    createAcademicSession: async () => Promise.reject(duplicateError()),
  });
  await assert.rejects(
    h.service.createAcademicSession({ code: "2026-2027", name: "Duplicate" }),
    ConflictException,
  );
  assert.equal(h.calls.filter((call) => call.kind === "audit").length, 0);
});

test("the same AcademicSession code remains independently creatable in another department", async () => {
  const first = harness({}, "department-a");
  const second = harness({}, "department-b");
  await first.service.createAcademicSession({ code: "2026-2027", name: "A" });
  await second.service.createAcademicSession({ code: "2026-2027", name: "B" });
  assert.equal(
    (
      first.calls.find((call) => call.kind === "session-create")?.value as {
        departmentId: string;
      }
    ).departmentId,
    "department-a",
  );
  assert.equal(
    (
      second.calls.find((call) => call.kind === "session-create")?.value as {
        departmentId: string;
      }
    ).departmentId,
    "department-b",
  );
});

test("StudentBatch valid create validates parents and passes principal audit context to its transaction", async () => {
  const h = harness();
  await h.service.createStudentBatch({
    academicProgramId: "program-a",
    academicSessionId: "session-a",
    code: "LLB-26",
    name: "LL.B. 2026",
  });
  assert.deepEqual(h.calls.find((call) => call.kind === "program")?.value, [
    "department-a",
    "program-a",
  ]);
  assert.deepEqual(
    h.calls.find((call) => call.kind === "session-detail")?.value,
    ["department-a", "session-a"],
  );
  assert.deepEqual(
    h.calls.find((call) => call.kind === "batch-create")?.value,
    {
      departmentId: "department-a",
      actorUserId: "admin-a",
      requestId: "request-a",
      ipAddress: "127.0.0.1",
      userAgent: "test",
      academicProgramId: "program-a",
      academicSessionId: "session-a",
      code: "LLB-26",
      name: "LL.B. 2026",
    },
  );
  assert.equal(h.calls.filter((call) => call.kind === "audit").length, 0);
});

test("StudentBatch rejects foreign or archived parents before persistence and audit", async () => {
  for (const repositoryOverrides of [
    { findProgramById: async () => null },
    { findAcademicSessionById: async () => null },
  ]) {
    const h = harness(repositoryOverrides);
    await assert.rejects(
      h.service.createStudentBatch({
        academicProgramId: "program-a",
        academicSessionId: "session-a",
        code: "LLB-26",
        name: "LL.B. 2026",
      }),
      BadRequestException,
    );
    assert.equal(
      h.calls.some((call) => call.kind === "batch-create"),
      false,
    );
    assert.equal(
      h.calls.some((call) => call.kind === "audit"),
      false,
    );
  }
});

test("StudentBatch lists, parent filters, details, and updates stay department-scoped", async () => {
  const h = harness();
  await h.service.listStudentBatches({
    academicProgramId: "program-a",
    academicSessionId: "session-a",
    search: "LLB",
  });
  await h.service.getStudentBatch("batch-a");
  await h.service.updateStudentBatch("batch-a", {
    code: "LLB-2026",
    name: "LL.B. 2026-2027",
  });
  assert.deepEqual(h.calls.find((call) => call.kind === "batch-list")?.value, {
    departmentId: "department-a",
    academicProgramId: "program-a",
    academicSessionId: "session-a",
    search: "LLB",
  });
  assert.deepEqual(
    h.calls.find((call) => call.kind === "batch-detail")?.value,
    ["department-a", "batch-a"],
  );
  assert.deepEqual(
    h.calls.find((call) => call.kind === "batch-update")?.value,
    {
      departmentId: "department-a",
      actorUserId: "admin-a",
      requestId: "request-a",
      ipAddress: "127.0.0.1",
      userAgent: "test",
      studentBatchId: "batch-a",
      changes: { code: "LLB-2026", name: "LL.B. 2026-2027" },
    },
  );
  assert.equal(h.calls.filter((call) => call.kind === "audit").length, 0);
});

test("StudentBatch foreign IDs and empty PATCH are safe failures", async () => {
  const h = harness();
  await assert.rejects(
    h.service.getStudentBatch("batch-foreign"),
    NotFoundException,
  );
  await assert.rejects(
    h.service.updateStudentBatch("batch-foreign", { name: "Foreign" }),
    NotFoundException,
  );
  await assert.rejects(
    h.service.updateStudentBatch("batch-a", {}),
    BadRequestException,
  );
  assert.equal(h.calls.filter((call) => call.kind === "audit").length, 0);
});

test("StudentBatch exact duplicate is conflict while another session or department remains legal", async () => {
  const duplicate = harness({
    createStudentBatch: async () => Promise.reject(duplicateError()),
  });
  await assert.rejects(
    duplicate.service.createStudentBatch({
      academicProgramId: "program-a",
      academicSessionId: "session-a",
      code: "LLB-26",
      name: "Duplicate",
    }),
    ConflictException,
  );
  assert.equal(
    duplicate.calls.some((call) => call.kind === "audit"),
    false,
  );

  const anotherSession = harness();
  await anotherSession.service.createStudentBatch({
    academicProgramId: "program-a",
    academicSessionId: "session-b",
    code: "LLB-26",
    name: "Next session",
  });
  const anotherDepartment = harness({}, "department-b");
  await anotherDepartment.service.createStudentBatch({
    academicProgramId: "program-a",
    academicSessionId: "session-a",
    code: "LLB-26",
    name: "Other department",
  });
  assert.equal(
    (
      anotherSession.calls.find((call) => call.kind === "batch-create")
        ?.value as { academicSessionId: string }
    ).academicSessionId,
    "session-b",
  );
  assert.equal(
    (
      anotherDepartment.calls.find((call) => call.kind === "batch-create")
        ?.value as { departmentId: string }
    ).departmentId,
    "department-b",
  );
});
