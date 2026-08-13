import assert from "node:assert/strict";
import test from "node:test";

import {
  TranscriptRecordStatus,
  TranscriptVersionStatus,
} from "@prisma/client";

import type { CreateTranscriptSnapshotInput } from "../../application/ports/transcript-verification.repository.port";
import { PrismaTranscriptVerificationRepository } from "./prisma-transcript-verification.repository";

interface TranscriptRecordState {
  id: string;
  departmentId: string;
  studentUserId: string;
  transcriptNumber: string;
  status: TranscriptRecordStatus;
  latestVersionNumber: number;
  generatedByUserId: string | null;
  issuedAt: Date | null;
  revokedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TranscriptVersionState {
  id: string;
  departmentId: string;
  transcriptRecordId: string;
  versionNumber: number;
  status: TranscriptVersionStatus;
  revokedAt: Date | null;
  [key: string]: unknown;
}

interface State {
  records: TranscriptRecordState[];
  versions: TranscriptVersionState[];
  revocations: Array<Record<string, unknown>>;
  verificationTokens: Array<Record<string, unknown>>;
}

interface RecordWhere {
  id?: string;
  departmentId?: string;
  studentUserId?: string;
  status?: TranscriptRecordStatus | { in: TranscriptRecordStatus[] };
  archivedAt?: null;
}

const historicalDate = new Date("2026-08-12T10:00:00.000Z");
const revokedDate = new Date("2026-08-13T09:00:00.000Z");

function transcriptRecord(
  overrides: Partial<TranscriptRecordState> = {},
): TranscriptRecordState {
  return {
    id: "record-existing",
    departmentId: "department-a",
    studentUserId: "student-a",
    transcriptNumber: "TR-HISTORICAL",
    status: TranscriptRecordStatus.GENERATED,
    latestVersionNumber: 1,
    generatedByUserId: "examiner-a",
    issuedAt: null,
    revokedAt: null,
    archivedAt: null,
    createdAt: historicalDate,
    updatedAt: historicalDate,
    ...overrides,
  };
}

function transcriptVersion(
  overrides: Partial<TranscriptVersionState> = {},
): TranscriptVersionState {
  return {
    id: "version-existing",
    departmentId: "department-a",
    transcriptRecordId: "record-existing",
    versionNumber: 1,
    status: TranscriptVersionStatus.GENERATED,
    revokedAt: null,
    ...overrides,
  };
}

function snapshotInput(
  overrides: Partial<CreateTranscriptSnapshotInput> = {},
): CreateTranscriptSnapshotInput {
  return {
    departmentId: "department-a",
    studentUserId: "student-a",
    transcriptNumber: "TR-NEW",
    generatedByUserId: "examiner-a",
    studentSnapshotJson: { id: "student-a", displayName: "Student A" },
    termSummaries: [],
    ...overrides,
  };
}

function matchesWhere(record: TranscriptRecordState, where: RecordWhere) {
  if (where.id !== undefined && record.id !== where.id) return false;
  if (
    where.departmentId !== undefined &&
    record.departmentId !== where.departmentId
  ) {
    return false;
  }
  if (
    where.studentUserId !== undefined &&
    record.studentUserId !== where.studentUserId
  ) {
    return false;
  }
  if (where.archivedAt === null && record.archivedAt !== null) return false;
  if (where.status !== undefined) {
    if (typeof where.status === "object") {
      if (!where.status.in.includes(record.status)) return false;
    } else if (record.status !== where.status) {
      return false;
    }
  }
  return true;
}

function harness(initial: Partial<State> = {}) {
  let state: State = structuredClone({
    records: initial.records ?? [],
    versions: initial.versions ?? [],
    revocations: initial.revocations ?? [],
    verificationTokens: initial.verificationTokens ?? [],
  });
  const lookupQueries: Array<{ where: RecordWhere }> = [];
  const updateQueries: Array<{ where: RecordWhere }> = [];

  const includeRecordDetails = (
    source: State,
    record: TranscriptRecordState,
  ) => ({
    ...record,
    versions: source.versions
      .filter((version) => version.transcriptRecordId === record.id)
      .sort((left, right) => right.versionNumber - left.versionNumber)
      .map((version) => ({
        ...version,
        termSummaries: [],
        sealMetadata: null,
      })),
    revocationRecords: source.revocations.filter(
      (revocation) => revocation.transcriptRecordId === record.id,
    ),
  });

  const prisma = {
    $transaction: async (
      callback: (transaction: Record<string, unknown>) => Promise<unknown>,
    ) => {
      const working = structuredClone(state);
      const tx = {
        transcriptRecord: {
          findFirst: async (args: {
            where: RecordWhere;
            orderBy?: { createdAt: "asc" };
          }) => {
            lookupQueries.push(structuredClone(args));
            const matches = working.records.filter((record) =>
              matchesWhere(record, args.where),
            );
            if (args.orderBy?.createdAt === "asc") {
              matches.sort(
                (left, right) =>
                  left.createdAt.getTime() - right.createdAt.getTime(),
              );
            }
            return matches[0] ?? null;
          },
          update: async (args: {
            where: RecordWhere;
            data: { latestVersionNumber: number };
          }) => {
            updateQueries.push(structuredClone(args));
            const record = working.records.find((candidate) =>
              matchesWhere(candidate, args.where),
            );
            if (!record)
              throw new Error("Transcript record update did not match");
            record.latestVersionNumber = args.data.latestVersionNumber;
            return record;
          },
          create: async (args: {
            data: {
              departmentId: string;
              studentUserId: string;
              transcriptNumber: string;
              status: TranscriptRecordStatus;
              latestVersionNumber: number;
              generatedByUserId: string;
            };
          }) => {
            const now = new Date("2026-08-13T12:00:00.000Z");
            const record = transcriptRecord({
              id: `record-${working.records.length + 1}`,
              ...args.data,
              issuedAt: null,
              revokedAt: null,
              archivedAt: null,
              createdAt: now,
              updatedAt: now,
            });
            working.records.push(record);
            return record;
          },
          findFirstOrThrow: async (args: { where: RecordWhere }) => {
            const record = working.records.find((candidate) =>
              matchesWhere(candidate, args.where),
            );
            if (!record) throw new Error("Transcript record not found");
            return includeRecordDetails(working, record);
          },
        },
        transcriptVersion: {
          create: async (args: {
            data: {
              departmentId: string;
              transcriptRecordId: string;
              versionNumber: number;
              status: TranscriptVersionStatus;
              [key: string]: unknown;
            };
          }) => {
            const version: TranscriptVersionState = {
              id: `version-${working.versions.length + 1}`,
              ...args.data,
              revokedAt: null,
            };
            working.versions.push(version);
            return version;
          },
        },
        transcriptTermSummary: {
          create: async () => {
            throw new Error("Unexpected term summary creation");
          },
        },
        transcriptCourseLine: {
          createMany: async () => {
            throw new Error("Unexpected course line creation");
          },
        },
      };

      const result = await callback(tx);
      state = working;
      return result;
    },
  };

  return {
    repository: new PrismaTranscriptVerificationRepository(prisma as never),
    getState: () => state,
    lookupQueries,
    updateQueries,
  };
}

test("creates a generated record and version 1 when no transcript exists", async () => {
  const h = harness();
  const result = await h.repository.createTranscriptSnapshot(snapshotInput());

  assert.equal(result.transcriptNumber, "TR-NEW");
  assert.equal(result.status, TranscriptRecordStatus.GENERATED);
  assert.equal(result.latestVersionNumber, 1);
  assert.equal(result.revokedAt, null);
  assert.equal(result.versions.length, 1);
  assert.equal(result.versions[0]?.versionNumber, 1);
  assert.equal(result.versions[0]?.status, TranscriptVersionStatus.GENERATED);
});

test("reuses each legitimate active lineage and appends its next version", async () => {
  for (const status of [
    TranscriptRecordStatus.DRAFT,
    TranscriptRecordStatus.GENERATED,
    TranscriptRecordStatus.ISSUED,
  ]) {
    const h = harness({
      records: [transcriptRecord({ status })],
      versions: [transcriptVersion()],
    });
    const result = await h.repository.createTranscriptSnapshot(snapshotInput());

    assert.equal(result.id, "record-existing");
    assert.equal(result.transcriptNumber, "TR-HISTORICAL");
    assert.equal(result.status, status);
    assert.equal(result.latestVersionNumber, 2);
    assert.equal(result.versions[0]?.versionNumber, 2);
    assert.equal(result.versions[0]?.status, TranscriptVersionStatus.GENERATED);
    assert.equal(h.updateQueries[0]?.where.departmentId, "department-a");
    assert.equal(h.updateQueries[0]?.where.archivedAt, null);
    assert.deepEqual(h.updateQueries[0]?.where.status, {
      in: [
        TranscriptRecordStatus.DRAFT,
        TranscriptRecordStatus.GENERATED,
        TranscriptRecordStatus.ISSUED,
      ],
    });
  }
});

test("creates a fresh lineage without mutating revoked transcript history", async () => {
  const revokedRecord = transcriptRecord({
    status: TranscriptRecordStatus.REVOKED,
    revokedAt: revokedDate,
  });
  const revokedVersion = transcriptVersion({
    status: TranscriptVersionStatus.REVOKED,
    revokedAt: revokedDate,
  });
  const revocation = {
    id: "revocation-existing",
    transcriptRecordId: revokedRecord.id,
    transcriptVersionId: revokedVersion.id,
    status: "APPLIED",
    appliedAt: revokedDate,
  };
  const token = {
    id: "token-existing",
    transcriptVersionId: revokedVersion.id,
    status: "REVOKED",
    revokedAt: revokedDate,
    publicCode: "historical-hash",
  };
  const historicalState = structuredClone({
    record: revokedRecord,
    version: revokedVersion,
    revocation,
    token,
  });
  const h = harness({
    records: [revokedRecord],
    versions: [revokedVersion],
    revocations: [revocation],
    verificationTokens: [token],
  });

  const result = await h.repository.createTranscriptSnapshot(snapshotInput());
  const state = h.getState();

  assert.notEqual(result.id, revokedRecord.id);
  assert.notEqual(result.transcriptNumber, revokedRecord.transcriptNumber);
  assert.equal(result.transcriptNumber, "TR-NEW");
  assert.equal(result.status, TranscriptRecordStatus.GENERATED);
  assert.equal(result.revokedAt, null);
  assert.equal(result.latestVersionNumber, 1);
  assert.equal(result.versions[0]?.versionNumber, 1);
  assert.equal(result.versions[0]?.status, TranscriptVersionStatus.GENERATED);
  assert.deepEqual(
    state.records.find((record) => record.id === revokedRecord.id),
    historicalState.record,
  );
  assert.deepEqual(
    state.versions.find((version) => version.id === revokedVersion.id),
    historicalState.version,
  );
  assert.deepEqual(state.revocations, [historicalState.revocation]);
  assert.deepEqual(state.verificationTokens, [historicalState.token]);
  assert.equal(h.updateQueries.length, 0);
});

test("does not reuse archived transcript history", async () => {
  for (const record of [
    transcriptRecord({ status: TranscriptRecordStatus.ARCHIVED }),
    transcriptRecord({ archivedAt: revokedDate }),
  ]) {
    const h = harness({ records: [record], versions: [transcriptVersion()] });
    const result = await h.repository.createTranscriptSnapshot(snapshotInput());

    assert.notEqual(result.id, record.id);
    assert.equal(result.transcriptNumber, "TR-NEW");
    assert.equal(result.latestVersionNumber, 1);
    assert.equal(h.updateQueries.length, 0);
  }
});

test("opposite-department revoked history cannot influence lineage selection", async () => {
  const oppositeDepartmentRecord = transcriptRecord({
    departmentId: "department-b",
    status: TranscriptRecordStatus.REVOKED,
    revokedAt: revokedDate,
  });
  const h = harness({ records: [oppositeDepartmentRecord] });

  const result = await h.repository.createTranscriptSnapshot(snapshotInput());

  assert.notEqual(result.id, oppositeDepartmentRecord.id);
  assert.equal(result.departmentId, "department-a");
  assert.equal(result.transcriptNumber, "TR-NEW");
  assert.equal(h.lookupQueries[0]?.where.departmentId, "department-a");
  assert.deepEqual(h.lookupQueries[0]?.where.status, {
    in: [
      TranscriptRecordStatus.DRAFT,
      TranscriptRecordStatus.GENERATED,
      TranscriptRecordStatus.ISSUED,
    ],
  });
});
