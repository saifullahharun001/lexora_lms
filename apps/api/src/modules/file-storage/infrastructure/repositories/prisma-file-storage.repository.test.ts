import assert from "node:assert/strict";
import test from "node:test";

import type { FileObjectStatus } from "@prisma/client";

import type { FileLifecycleTransitionInput } from "../../contracts/file-storage.contracts";
import { PrismaFileStorageRepository } from "./prisma-file-storage.repository";

function harness(input?: {
  departmentId?: string;
  objectKey?: string;
  status?: FileObjectStatus;
  latestScanStatus?: "CLEAN" | "INFECTED" | "ERROR" | null;
}) {
  const now = new Date("2026-08-03T00:00:00.000Z");
  const state = {
    id: "file-1",
    departmentId: input?.departmentId ?? "department-a",
    uploadedByUserId: "user-1",
    bucket: "private",
    objectKey: input?.objectKey ?? "quarantine/department-a/id-123",
    originalFilename: "report.pdf",
    mimeType: "application/pdf",
    sizeBytes: 42,
    checksumSha256: "a".repeat(64),
    visibility: "PRIVATE" as const,
    status: input?.status ?? ("PENDING_SCAN" as FileObjectStatus),
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const latestScanStatus =
    input && "latestScanStatus" in input ? input.latestScanStatus : "CLEAN";
  const tx = {
    fileObject: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        where.id === state.id && where.departmentId === state.departmentId
          ? state
          : null,
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          id: string;
          departmentId: string;
          status: FileObjectStatus | { in: FileObjectStatus[] };
          objectKey?: string;
        };
        data: { status: FileObjectStatus; objectKey?: string };
      }) => {
        const matches =
          where.id === state.id &&
          where.departmentId === state.departmentId &&
          (typeof where.status === "string"
            ? where.status === state.status
            : where.status.in.includes(state.status)) &&
          (!where.objectKey || where.objectKey === state.objectKey);
        if (!matches) return { count: 0 };
        state.status = data.status;
        if (data.objectKey) state.objectKey = data.objectKey;
        return { count: 1 };
      },
      findFirstOrThrow: async () => state,
    },
    malwareScanResult: {
      findFirst: async () =>
        latestScanStatus ? { status: latestScanStatus } : null,
    },
  };
  const prisma = {
    $transaction: async (operation: (transaction: typeof tx) => unknown) =>
      operation(tx),
  };
  return {
    repository: new PrismaFileStorageRepository(prisma as never),
    state,
  };
}

const validPromotion: FileLifecycleTransitionInput = {
  fileId: "file-1",
  departmentId: "department-a",
  expectedStatuses: ["PENDING_SCAN"],
  targetStatus: "AVAILABLE",
  requireLatestCleanScan: true,
  promotionLocation: {
    expectedQuarantineObjectKey: "quarantine/department-a/id-123",
    availableObjectKey: "available/department-a/id-123",
  },
};

test("guarded promotion atomically persists AVAILABLE and the derived object key", async () => {
  const { repository, state } = harness();
  const result = await repository.transitionStatus(validPromotion);
  assert.equal(result?.status, "AVAILABLE");
  assert.equal(result?.objectKey, "available/department-a/id-123");
  assert.equal(state.status, "AVAILABLE");
  assert.equal(state.objectKey, "available/department-a/id-123");
});

for (const [name, harnessInput, transition] of [
  ["wrong department", {}, { ...validPromotion, departmentId: "department-b" }],
  [
    "wrong current quarantine key",
    { objectKey: "quarantine/department-a/different" },
    validPromotion,
  ],
  [
    "arbitrary available key",
    {},
    {
      ...validPromotion,
      promotionLocation: {
        ...validPromotion.promotionLocation!,
        availableObjectKey: "available/department-a/arbitrary",
      },
    },
  ],
  ["non-pending state", { status: "AVAILABLE" }, validPromotion],
  ["missing latest scan", { latestScanStatus: null }, validPromotion],
  ["non-clean latest scan", { latestScanStatus: "ERROR" }, validPromotion],
] as const) {
  test(`guarded promotion rejects ${name}`, async () => {
    const { repository, state } = harness(harnessInput);
    const original = { status: state.status, objectKey: state.objectKey };
    assert.equal(await repository.transitionStatus(transition), null);
    assert.deepEqual(
      { status: state.status, objectKey: state.objectKey },
      original,
    );
  });
}
