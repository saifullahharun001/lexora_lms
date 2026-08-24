import assert from "node:assert/strict";
import test from "node:test";

import { PrismaAcademicRepository } from "./prisma-academic.repository";

const now = new Date("2026-08-24T00:00:00.000Z");

function sessionRecord(id = "session-a", departmentId = "department-a") {
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

function batchRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "batch-a",
    departmentId: "department-a",
    academicProgramId: "program-a",
    academicSessionId: "session-a",
    code: "LLB-26",
    name: "LL.B. 2026",
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    academicProgram: {
      id: "program-a",
      departmentId: "department-a",
      code: "LLB",
      name: "LL.B.",
      archivedAt: null,
    },
    academicSession: {
      id: "session-a",
      departmentId: "department-a",
      code: "2026-2027",
      name: "2026-2027",
      archivedAt: null,
    },
    ...overrides,
  };
}

function harness() {
  const calls: Array<{ kind: string; args: Record<string, unknown> }> = [];
  let batchDetail: ReturnType<typeof batchRecord> | null = batchRecord();
  let batchList = [batchRecord()];
  const academicSession = {
    findMany: async (args: Record<string, unknown>) => {
      calls.push({ kind: "session-findMany", args });
      return [sessionRecord()];
    },
    findFirst: async (args: Record<string, unknown>) => {
      calls.push({ kind: "session-findFirst", args });
      return sessionRecord();
    },
    create: async (args: Record<string, unknown>) => {
      calls.push({ kind: "session-create", args });
      return sessionRecord(
        "session-created",
        (args.data as { departmentId: string }).departmentId,
      );
    },
    updateMany: async (args: Record<string, unknown>) => {
      calls.push({ kind: "session-updateMany", args });
      return { count: 1 };
    },
  };
  const studentBatch = {
    findMany: async (args: Record<string, unknown>) => {
      calls.push({ kind: "batch-findMany", args });
      return batchList;
    },
    findFirst: async (args: Record<string, unknown>) => {
      calls.push({ kind: "batch-findFirst", args });
      return batchDetail;
    },
    create: async (args: Record<string, unknown>) => {
      calls.push({ kind: "batch-create", args });
      const data = args.data as {
        departmentId: string;
        academicProgramId: string;
        academicSessionId: string;
        code: string;
        name: string;
      };
      return batchRecord({
        departmentId: data.departmentId,
        academicProgramId: data.academicProgramId,
        academicSessionId: data.academicSessionId,
        code: data.code,
        name: data.name,
      });
    },
    updateMany: async (args: Record<string, unknown>) => {
      calls.push({ kind: "batch-updateMany", args });
      return { count: 1 };
    },
  };
  const prisma = {
    academicSession,
    studentBatch,
    auditLog: {
      create: async (args: Record<string, unknown>) => {
        calls.push({ kind: "audit-create", args });
        return args;
      },
    },
    $queryRaw: async (args: Record<string, unknown>) => {
      calls.push({ kind: "lock", args });
      return [{ id: "locked" }];
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        academicSession,
        studentBatch,
        auditLog: {
          create: async (args: Record<string, unknown>) => {
            calls.push({ kind: "audit-create", args });
            return args;
          },
        },
        $queryRaw: async (args: Record<string, unknown>) => {
          calls.push({ kind: "lock", args });
          return [{ id: "locked" }];
        },
      }),
  };
  return {
    calls,
    repository: new PrismaAcademicRepository(prisma as never),
    setBatchDetail(value: ReturnType<typeof batchRecord> | null) {
      batchDetail = value;
    },
    setBatchList(value: ReturnType<typeof batchRecord>[]) {
      batchList = value;
    },
  };
}

test("AcademicSession repository applies non-archived department scope, search, and scoped writes", async () => {
  const h = harness();
  await h.repository.findAcademicSessions({
    departmentId: "department-a",
    search: "2026",
  });
  await h.repository.findAcademicSessionById("department-a", "session-a");
  await h.repository.createAcademicSession({
    departmentId: "department-a",
    actorUserId: "admin-a",
    code: "2026-2027",
    name: "Session",
  });
  await h.repository.updateAcademicSession({
    departmentId: "department-a",
    actorUserId: "admin-a",
    academicSessionId: "session-a",
    changes: { name: "Updated" },
  });
  const list = h.calls.find((call) => call.kind === "session-findMany")!.args;
  assert.deepEqual(list.where, {
    departmentId: "department-a",
    archivedAt: null,
    OR: [{ code: { contains: "2026" } }, { name: { contains: "2026" } }],
  });
  const detail = h.calls.find(
    (call) => call.kind === "session-findFirst",
  )!.args;
  assert.deepEqual(detail.where, {
    id: "session-a",
    departmentId: "department-a",
    archivedAt: null,
  });
  assert.deepEqual(
    h.calls.find((call) => call.kind === "session-create")!.args.data,
    { departmentId: "department-a", code: "2026-2027", name: "Session" },
  );
  assert.deepEqual(
    h.calls.find((call) => call.kind === "session-updateMany")!.args,
    {
      where: {
        id: "session-a",
        departmentId: "department-a",
        archivedAt: null,
      },
      data: { name: "Updated" },
    },
  );
});

test("StudentBatch repository scopes list filters and returns only compact valid parent identity", async () => {
  const h = harness();
  const result = await h.repository.findStudentBatches({
    departmentId: "department-a",
    academicProgramId: "program-a",
    academicSessionId: "session-a",
    search: "LLB",
  });
  const query = h.calls.find((call) => call.kind === "batch-findMany")!.args;
  assert.deepEqual(query.where, {
    departmentId: "department-a",
    archivedAt: null,
    academicProgramId: "program-a",
    academicSessionId: "session-a",
    academicProgram: { departmentId: "department-a", archivedAt: null },
    academicSession: { departmentId: "department-a", archivedAt: null },
    OR: [{ code: { contains: "LLB" } }, { name: { contains: "LLB" } }],
  });
  assert.deepEqual(result[0]?.academicProgram, {
    id: "program-a",
    code: "LLB",
    name: "LL.B.",
  });
  assert.deepEqual(result[0]?.academicSession, {
    id: "session-a",
    code: "2026-2027",
    name: "2026-2027",
  });
  assert.equal("departmentId" in result[0]!.academicProgram, false);
  assert.equal("archivedAt" in result[0]!.academicSession, false);
});

test("StudentBatch management reads fail closed for malformed or archived relational chains", async () => {
  const h = harness();
  const malformed = batchRecord({
    academicProgram: {
      id: "program-other",
      departmentId: "department-b",
      code: "BAD",
      name: "Bad",
      archivedAt: null,
    },
  });
  const archivedParent = batchRecord({
    id: "batch-archived-parent",
    academicSession: {
      id: "session-a",
      departmentId: "department-a",
      code: "2026-2027",
      name: "2026-2027",
      archivedAt: now,
    },
  });
  h.setBatchList([batchRecord(), malformed, archivedParent]);
  assert.deepEqual(
    (
      await h.repository.findStudentBatches({ departmentId: "department-a" })
    ).map((batch) => batch.id),
    ["batch-a"],
  );
  h.setBatchDetail(malformed);
  assert.equal(
    await h.repository.findStudentBatchById("department-a", "batch-a"),
    null,
  );
});

test("StudentBatch repository create and update preserve immutable parent identity", async () => {
  const h = harness();
  await h.repository.createStudentBatch({
    departmentId: "department-a",
    actorUserId: "admin-a",
    academicProgramId: "program-a",
    academicSessionId: "session-a",
    code: "LLB-26",
    name: "LL.B. 2026",
  });
  await h.repository.updateStudentBatch({
    departmentId: "department-a",
    actorUserId: "admin-a",
    studentBatchId: "batch-a",
    changes: {
      code: "LLB-2026",
      name: "LL.B. 2026-2027",
    },
  });
  assert.deepEqual(
    h.calls.find((call) => call.kind === "batch-create")!.args.data,
    {
      departmentId: "department-a",
      academicProgramId: "program-a",
      academicSessionId: "session-a",
      code: "LLB-26",
      name: "LL.B. 2026",
    },
  );
  const update = h.calls.find((call) => call.kind === "batch-updateMany")!.args;
  assert.deepEqual(update.data, {
    code: "LLB-2026",
    name: "LL.B. 2026-2027",
  });
  assert.equal("academicProgramId" in (update.data as object), false);
  assert.equal("academicSessionId" in (update.data as object), false);
  assert.equal("departmentId" in (update.data as object), false);
  const locks = h.calls
    .filter((call) => call.kind === "lock")
    .map((call) => call.args as { strings: string[]; values: unknown[] });
  assert.match(locks[0]!.strings.join("?"), /academic_programs/);
  assert.match(locks[0]!.strings.join("?"), /archived_at.*IS NULL/s);
  assert.match(locks[0]!.strings.join("?"), /FOR UPDATE/);
  assert.deepEqual(locks[0]!.values, ["program-a", "department-a"]);
  assert.match(locks[1]!.strings.join("?"), /academic_sessions/);
  assert.match(locks[1]!.strings.join("?"), /archived_at.*IS NULL/s);
  assert.match(locks[1]!.strings.join("?"), /FOR UPDATE/);
  assert.deepEqual(locks[1]!.values, ["session-a", "department-a"]);
});
