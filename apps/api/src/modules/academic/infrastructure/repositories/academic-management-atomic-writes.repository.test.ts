import assert from "node:assert/strict";
import test from "node:test";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { PrismaAcademicRepository } from "./prisma-academic.repository";

const now = new Date("2026-08-24T00:00:00.000Z");
const writeContext = {
  departmentId: "department-a",
  actorUserId: "admin-a",
  requestId: "request-a",
  ipAddress: "127.0.0.1",
  userAgent: "test-agent",
};

function sessionRecord(
  id: string,
  code = "2026-2027",
  name = "Academic Session 2026",
) {
  return {
    id,
    departmentId: "department-a",
    code,
    name,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function batchRecord(id: string, code = "LLB-26", name = "LL.B. 2026") {
  return {
    id,
    departmentId: "department-a",
    academicProgramId: "program-a",
    academicSessionId: "session-a",
    code,
    name,
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
      name: "Academic Session 2026",
      archivedAt: null,
    },
  };
}

interface State {
  sessions: ReturnType<typeof sessionRecord>[];
  batches: ReturnType<typeof batchRecord>[];
  audits: Array<Record<string, unknown>>;
}

function duplicateError(target: string[]) {
  return new PrismaClientKnownRequestError("duplicate", {
    code: "P2002",
    clientVersion: "6.6.0",
    meta: { target },
  });
}

function harness() {
  let state: State = {
    sessions: [sessionRecord("session-a")],
    batches: [batchRecord("batch-a")],
    audits: [],
  };
  let failAudit = false;
  let failPostWriteBatchIntegrity = false;
  let dependenciesAvailable = true;
  let duplicateSession = false;
  let duplicateBatch = false;

  const client = (working: State) => {
    let batchMutationPerformed = false;

    return {
      academicSession: {
        create: async (args: {
          data: { departmentId: string; code: string; name: string };
        }) => {
          if (duplicateSession) {
            throw duplicateError(["department_id", "code"]);
          }
          const record = sessionRecord(
            "session-created",
            args.data.code,
            args.data.name,
          );
          working.sessions.push(record);
          return { id: record.id };
        },
        updateMany: async (args: {
          where: { id: string; departmentId: string; archivedAt: null };
          data: { code?: string; name?: string };
        }) => {
          if (duplicateSession) {
            throw duplicateError(["department_id", "code"]);
          }
          const record = working.sessions.find(
            (candidate) =>
              candidate.id === args.where.id &&
              candidate.departmentId === args.where.departmentId &&
              candidate.archivedAt === null,
          );
          if (!record) return { count: 0 };
          Object.assign(record, args.data);
          return { count: 1 };
        },
        findFirst: async (args: {
          where: { id: string; departmentId: string; archivedAt: null };
        }) =>
          working.sessions.find(
            (candidate) =>
              candidate.id === args.where.id &&
              candidate.departmentId === args.where.departmentId &&
              candidate.archivedAt === null,
          ) ?? null,
      },
      studentBatch: {
        create: async (args: {
          data: {
            departmentId: string;
            academicProgramId: string;
            academicSessionId: string;
            code: string;
            name: string;
          };
        }) => {
          if (duplicateBatch) {
            throw duplicateError([
              "department_id",
              "academic_program_id",
              "academic_session_id",
              "code",
            ]);
          }
          const record = batchRecord(
            "batch-created",
            args.data.code,
            args.data.name,
          );
          working.batches.push(record);
          batchMutationPerformed = true;
          return { id: record.id };
        },
        updateMany: async (args: {
          where: {
            id: string;
            departmentId: string;
            archivedAt: null;
            academicProgramId: string;
            academicSessionId: string;
          };
          data: { code?: string; name?: string };
        }) => {
          if (duplicateBatch) {
            throw duplicateError([
              "department_id",
              "academic_program_id",
              "academic_session_id",
              "code",
            ]);
          }
          const record = working.batches.find(
            (candidate) =>
              candidate.id === args.where.id &&
              candidate.departmentId === args.where.departmentId &&
              candidate.archivedAt === null &&
              candidate.academicProgramId === args.where.academicProgramId &&
              candidate.academicSessionId === args.where.academicSessionId,
          );
          if (!record) return { count: 0 };
          Object.assign(record, args.data);
          batchMutationPerformed = true;
          return { count: 1 };
        },
        findFirst: async (args: {
          where: { id: string; departmentId: string; archivedAt: null };
          select: Record<string, unknown>;
        }) => {
          const record = working.batches.find(
            (candidate) =>
              candidate.id === args.where.id &&
              candidate.departmentId === args.where.departmentId &&
              candidate.archivedAt === null,
          );
          if (!record) return null;
          if ("academicProgram" in args.select) {
            if (failPostWriteBatchIntegrity && batchMutationPerformed) {
              return {
                ...record,
                academicProgram: {
                  ...record.academicProgram,
                  id: "malformed-program",
                },
              };
            }
            return record;
          }
          return {
            id: record.id,
            academicProgramId: record.academicProgramId,
            academicSessionId: record.academicSessionId,
          };
        },
      },
      auditLog: {
        create: async (args: { data: Record<string, unknown> }) => {
          if (failAudit) throw new Error("AUDIT_WRITE_FAILED");
          working.audits.push(args.data);
          return args.data;
        },
      },
      $queryRaw: async () => (dependenciesAvailable ? [{ id: "locked" }] : []),
    };
  };

  const prisma = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const working = structuredClone(state);
      const result = await callback(client(working));
      state = working;
      return result;
    },
  };

  return {
    repository: new PrismaAcademicRepository(prisma as never),
    snapshot: () => structuredClone(state),
    failAudit() {
      failAudit = true;
    },
    failPostWriteBatchIntegrity() {
      failPostWriteBatchIntegrity = true;
    },
    makeDependenciesUnavailable() {
      dependenciesAvailable = false;
    },
    duplicateSession() {
      duplicateSession = true;
    },
    duplicateBatch() {
      duplicateBatch = true;
    },
  };
}

test("AcademicSession create and success audit commit together", async () => {
  const h = harness();
  const created = await h.repository.createAcademicSession({
    ...writeContext,
    code: "2027-2028",
    name: "Academic Session 2027",
  });
  const state = h.snapshot();
  assert.equal(created.id, "session-created");
  assert.equal(
    state.sessions.some((session) => session.id === created.id),
    true,
  );
  assert.deepEqual(state.audits, [
    {
      requestId: "request-a",
      actorUserId: "admin-a",
      actorType: "USER",
      departmentId: "department-a",
      action: "course-management.academic-session.created",
      targetType: "academic_session",
      targetId: "session-created",
      outcome: "SUCCESS",
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
      contextJson: { code: "2027-2028" },
    },
  ]);
});

test("AcademicSession update and success audit commit together", async () => {
  const h = harness();
  await h.repository.updateAcademicSession({
    ...writeContext,
    academicSessionId: "session-a",
    changes: { code: "2026", name: "Updated Session" },
  });
  const state = h.snapshot();
  assert.equal(state.sessions[0]!.name, "Updated Session");
  assert.deepEqual(state.audits[0]!.contextJson, {
    updatedFields: ["code", "name"],
  });
  assert.equal(
    state.audits[0]!.action,
    "course-management.academic-session.updated",
  );
});

test("AcademicSession audit failure rolls create back", async () => {
  const h = harness();
  h.failAudit();
  const before = h.snapshot();
  await assert.rejects(
    h.repository.createAcademicSession({
      ...writeContext,
      code: "2027-2028",
      name: "Academic Session 2027",
    }),
    /AUDIT_WRITE_FAILED/,
  );
  assert.deepEqual(h.snapshot(), before);
});

test("AcademicSession audit failure rolls update back", async () => {
  const h = harness();
  h.failAudit();
  const before = h.snapshot();
  await assert.rejects(
    h.repository.updateAcademicSession({
      ...writeContext,
      academicSessionId: "session-a",
      changes: { name: "Should roll back" },
    }),
    /AUDIT_WRITE_FAILED/,
  );
  assert.deepEqual(h.snapshot(), before);
});

test("AcademicSession duplicate conflict commits neither mutation nor success audit", async () => {
  const h = harness();
  h.duplicateSession();
  const before = h.snapshot();
  await assert.rejects(
    h.repository.createAcademicSession({
      ...writeContext,
      code: "2026-2027",
      name: "Duplicate",
    }),
    (error: unknown) =>
      error instanceof PrismaClientKnownRequestError && error.code === "P2002",
  );
  assert.deepEqual(h.snapshot(), before);
});

test("StudentBatch create and success audit commit together", async () => {
  const h = harness();
  const created = await h.repository.createStudentBatch({
    ...writeContext,
    academicProgramId: "program-a",
    academicSessionId: "session-a",
    code: "LLB-27",
    name: "LL.B. 2027",
  });
  const state = h.snapshot();
  assert.equal(created?.id, "batch-created");
  assert.equal(
    state.batches.some((batch) => batch.id === created?.id),
    true,
  );
  assert.deepEqual(state.audits[0], {
    requestId: "request-a",
    actorUserId: "admin-a",
    actorType: "USER",
    departmentId: "department-a",
    action: "course-management.student-batch.created",
    targetType: "student_batch",
    targetId: "batch-created",
    outcome: "SUCCESS",
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
    contextJson: {
      academicProgramId: "program-a",
      academicSessionId: "session-a",
      code: "LLB-27",
    },
  });
});

test("StudentBatch update and success audit commit together", async () => {
  const h = harness();
  await h.repository.updateStudentBatch({
    ...writeContext,
    studentBatchId: "batch-a",
    changes: { code: "LLB-2026", name: "Updated Batch" },
  });
  const state = h.snapshot();
  assert.equal(state.batches[0]!.name, "Updated Batch");
  assert.deepEqual(state.audits[0]!.contextJson, {
    updatedFields: ["code", "name"],
  });
  assert.equal(
    state.audits[0]!.action,
    "course-management.student-batch.updated",
  );
});

test("StudentBatch audit failure rolls create back", async () => {
  const h = harness();
  h.failAudit();
  const before = h.snapshot();
  await assert.rejects(
    h.repository.createStudentBatch({
      ...writeContext,
      academicProgramId: "program-a",
      academicSessionId: "session-a",
      code: "LLB-27",
      name: "LL.B. 2027",
    }),
    /AUDIT_WRITE_FAILED/,
  );
  assert.deepEqual(h.snapshot(), before);
});

test("StudentBatch audit failure rolls update back", async () => {
  const h = harness();
  h.failAudit();
  const before = h.snapshot();
  await assert.rejects(
    h.repository.updateStudentBatch({
      ...writeContext,
      studentBatchId: "batch-a",
      changes: { name: "Should roll back" },
    }),
    /AUDIT_WRITE_FAILED/,
  );
  assert.deepEqual(h.snapshot(), before);
});

test("StudentBatch post-write integrity failure rolls mutation back", async () => {
  const h = harness();
  h.failPostWriteBatchIntegrity();
  const before = h.snapshot();
  await assert.rejects(
    h.repository.updateStudentBatch({
      ...writeContext,
      studentBatchId: "batch-a",
      changes: { name: "Malformed after write" },
    }),
    /UPDATED_STUDENT_BATCH_INTEGRITY_CHECK_FAILED/,
  );
  assert.deepEqual(h.snapshot(), before);
});

test("StudentBatch transactional dependency failure performs no mutation or success audit", async () => {
  const h = harness();
  h.makeDependenciesUnavailable();
  const before = h.snapshot();
  assert.equal(
    await h.repository.createStudentBatch({
      ...writeContext,
      academicProgramId: "program-a",
      academicSessionId: "session-a",
      code: "LLB-27",
      name: "LL.B. 2027",
    }),
    null,
  );
  assert.deepEqual(h.snapshot(), before);
});

test("StudentBatch update dependency failure performs no mutation or success audit", async () => {
  const h = harness();
  h.makeDependenciesUnavailable();
  const before = h.snapshot();
  assert.equal(
    await h.repository.updateStudentBatch({
      ...writeContext,
      studentBatchId: "batch-a",
      changes: { name: "Must not commit" },
    }),
    null,
  );
  assert.deepEqual(h.snapshot(), before);
});

test("StudentBatch duplicate conflict commits neither mutation nor success audit", async () => {
  const h = harness();
  h.duplicateBatch();
  const before = h.snapshot();
  await assert.rejects(
    h.repository.createStudentBatch({
      ...writeContext,
      academicProgramId: "program-a",
      academicSessionId: "session-a",
      code: "LLB-26",
      name: "Duplicate",
    }),
    (error: unknown) =>
      error instanceof PrismaClientKnownRequestError && error.code === "P2002",
  );
  assert.deepEqual(h.snapshot(), before);
});
