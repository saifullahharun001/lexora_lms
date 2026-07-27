import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

import type { RequestContext } from "@lexora/types";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { FileObjectStatus } from "@prisma/client";

import type {
  FileLifecycleTransitionInput,
  FileObjectPersistenceRecord,
  MalwareScanResultRecord,
  ReadFileMetadataInput,
  RecordScanResultInput,
  RegisterPendingFileInput,
} from "../../contracts/file-storage.contracts";
import { ContentInspectionError } from "../ports/file-content-inspector.port";
import type { FileStorageRepository } from "../ports/file-storage.repository";
import { FileStorageService } from "./file-storage.service";

const context = (
  authenticated = true,
  departmentId: string | null = "department-a",
): RequestContext => ({
  requestId: "request-1",
  path: "/internal",
  method: "POST",
  principal: authenticated
    ? {
        actorId: "user-1",
        actorType: "user",
        isAuthenticated: true,
        activeDepartmentId: departmentId,
        roleAssignments: [],
        permissions: [],
      }
    : null,
  department: {
    kind: departmentId ? "department" : "unresolved",
    departmentId,
    source: "principal",
  },
  audit: { requestId: "request-1", departmentId },
});
function file(
  status: FileObjectStatus = "PENDING_SCAN",
  departmentId = "department-a",
): FileObjectPersistenceRecord {
  return {
    id: "file-1",
    departmentId,
    uploadedByUserId: "user-1",
    bucket: "private",
    objectKey: "opaque/id-123",
    originalFilename: "report.pdf",
    mimeType: "application/pdf",
    sizeBytes: 42,
    checksumSha256: "a".repeat(64),
    visibility: "PRIVATE",
    status,
    archivedAt: status === "ARCHIVED" ? new Date() : null,
    deletedAt: status === "DELETED" ? new Date() : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
class FakeRepository implements FileStorageRepository {
  record = file();
  scans: MalwareScanResultRecord[] = [];
  lastCreate?: RegisterPendingFileInput;
  transitioned?: FileLifecycleTransitionInput;
  async createPending(input: RegisterPendingFileInput) {
    this.lastCreate = input;
    this.record = { ...file(), ...input };
    return this.record;
  }
  async findById(input: ReadFileMetadataInput) {
    return this.record.id === input.fileId &&
      this.record.departmentId === input.departmentId &&
      (input.includeDeleted || this.record.status !== "DELETED")
      ? this.record
      : null;
  }
  async findLatestScan(fileId: string, departmentId: string) {
    return this.record.id === fileId &&
      this.record.departmentId === departmentId
      ? (this.scans.at(-1) ?? null)
      : null;
  }
  async recordScanResult(input: RecordScanResultInput) {
    if (this.record.status !== "PENDING_SCAN")
      throw new Error("FILE_NOT_PENDING_OR_NOT_FOUND");
    const scan: MalwareScanResultRecord = {
      id: `scan-${this.scans.length}`,
      fileObjectId: input.fileId,
      scanner: input.scanner,
      status: input.status,
      signatureName: input.signatureName ?? null,
      safeDiagnosticMetadata: input.safeDiagnosticMetadata ?? null,
      scannedAt: input.scannedAt ?? null,
      createdAt: new Date(),
    };
    this.scans.push(scan);
    return scan;
  }
  async transitionStatus(input: FileLifecycleTransitionInput) {
    this.transitioned = input;
    if (!input.expectedStatuses.includes(this.record.status)) return null;
    if (
      input.targetStatus === "AVAILABLE" &&
      this.scans.at(-1)?.status !== "CLEAN"
    )
      return null;
    this.record = {
      ...this.record,
      status: input.targetStatus,
      archivedAt:
        input.targetStatus === "ARCHIVED" ? new Date() : this.record.archivedAt,
      deletedAt:
        input.targetStatus === "DELETED" ? new Date() : this.record.deletedAt,
    };
    return this.record;
  }
  archive(fileId: string, departmentId: string, statuses: FileObjectStatus[]) {
    return this.transitionStatus({
      fileId,
      departmentId,
      expectedStatuses: statuses,
      targetStatus: "ARCHIVED",
    });
  }
  markDeleted(fileId: string, departmentId: string) {
    return this.transitionStatus({
      fileId,
      departmentId,
      expectedStatuses: ["ARCHIVED"],
      targetStatus: "DELETED",
    });
  }
}
function harness(requestContext = context()) {
  const repository = new FakeRepository();
  const audits: unknown[] = [];
  const prisma = {
    auditLog: {
      create: async (entry: unknown) => {
        audits.push(entry);
        return entry;
      },
    },
  };
  const objectStorage = {
    statObject: async () => ({
      bucket: "private",
      objectKey: "quarantine/department-a/id-123",
      sizeBytes: 42,
    }),
    readObject: async () => Readable.from([Buffer.from("content")]),
  };
  const contentInspector = {
    inspect: async () => ({
      canonicalMimeType: "application/pdf",
      recognizedExtension: "pdf",
    }),
  };
  return {
    service: new FileStorageService(
      repository,
      objectStorage as never,
      contentInspector,
      prisma as never,
      { get: () => requestContext } as never,
    ),
    repository,
    audits,
    objectStorage,
    contentInspector,
  };
}
const registration = {
  bucket: "private",
  objectKey: "quarantine/department-a/id-123",
  originalFilename: "../report.pdf",
  clientClaimedMimeType: "application/pdf",
  sizeBytes: 42,
  checksumSha256: "A".repeat(64),
};

test("requires authenticated principal and active department", async () => {
  await assert.rejects(
    () => harness(context(false)).service.getMetadata("file-1"),
    UnauthorizedException,
  );
  await assert.rejects(
    () => harness(context(true, null)).service.getMetadata("file-1"),
    BadRequestException,
  );
});
test("registration uses principal scope, normalizes checksum, and audits", async () => {
  const { service, repository, audits } = harness();
  const result = await service.registerPending(registration);
  assert.equal(repository.lastCreate?.departmentId, "department-a");
  assert.equal(repository.lastCreate?.uploadedByUserId, "user-1");
  assert.equal(repository.lastCreate?.checksumSha256, "a".repeat(64));
  assert.equal(audits.length, 1);
  assert.ok(!("bucket" in result));
  assert.ok(!("objectKey" in result));
});
test("registration persists detected MIME and keeps audit context safe", async () => {
  const { service, repository, audits } = harness();
  await service.registerPending({
    ...registration,
    clientClaimedMimeType: "application/octet-stream",
  });
  assert.equal(repository.lastCreate?.mimeType, "application/pdf");
  const serializedAudit = JSON.stringify(audits);
  assert.equal(serializedAudit.includes(registration.objectKey), false);
  assert.equal(serializedAudit.includes(registration.bucket), false);
  assert.equal(serializedAudit.includes("application/octet-stream"), false);
  assert.equal(serializedAudit.includes("academic-documents-v1"), true);
});
for (const objectKey of [
  "quarantine/department-b/id-123",
  "available/department-a/id-123",
]) {
  test("registration rejects objects outside the active department quarantine", async () => {
    const { service, repository, audits } = harness();
    await assert.rejects(
      () => service.registerPending({ ...registration, objectKey }),
      NotFoundException,
    );
    assert.equal(repository.lastCreate, undefined);
    assert.equal(audits.length, 0);
  });
}
test("authoritative size mismatch prevents persistence and audit", async () => {
  const { service, repository, audits, objectStorage } = harness();
  objectStorage.statObject = async () => ({
    bucket: "private",
    objectKey: registration.objectKey,
    sizeBytes: 41,
  });
  await assert.rejects(
    () => service.registerPending(registration),
    BadRequestException,
  );
  assert.equal(repository.lastCreate, undefined);
  assert.equal(audits.length, 0);
});
test("content-policy failure prevents persistence and audit", async () => {
  const { service, repository, audits, contentInspector } = harness();
  contentInspector.inspect = async () => ({
    canonicalMimeType: "image/png",
    recognizedExtension: "png",
  });
  await assert.rejects(
    () => service.registerPending(registration),
    BadRequestException,
  );
  assert.equal(repository.lastCreate, undefined);
  assert.equal(audits.length, 0);
});
for (const [code, expected] of [
  ["CONTENT_UNRECOGNIZED", BadRequestException],
  ["CONTENT_INSPECTION_TIMEOUT", ServiceUnavailableException],
  ["CONTENT_INSPECTION_FAILED", ServiceUnavailableException],
] as const) {
  test(`classifies inspection failure ${code}`, async () => {
    const { service, repository, audits, contentInspector } = harness();
    contentInspector.inspect = async () => {
      throw new ContentInspectionError(code);
    };
    await assert.rejects(() => service.registerPending(registration), expected);
    assert.equal(repository.lastCreate, undefined);
    assert.equal(audits.length, 0);
  });
}
test("preserves object-storage and unexpected programmer errors", async () => {
  for (const source of ["stat", "read"] as const) {
    const { service, repository, audits, objectStorage } = harness();
    const infrastructureFailure = new Error(`sanitized ${source} failure`);
    objectStorage[source === "stat" ? "statObject" : "readObject"] =
      async () => {
        throw infrastructureFailure;
      };
    await assert.rejects(
      () => service.registerPending(registration),
      (error: unknown) => error === infrastructureFailure,
    );
    assert.equal(repository.lastCreate, undefined);
    assert.equal(audits.length, 0);
  }
  const { service, contentInspector } = harness();
  const programmerFailure = new Error("programmer failure");
  contentInspector.inspect = async () => {
    throw programmerFailure;
  };
  await assert.rejects(
    () => service.registerPending(registration),
    (error: unknown) => error === programmerFailure,
  );
});
test("specific client MIME mismatch prevents persistence", async () => {
  const { service, repository, audits } = harness();
  await assert.rejects(
    () =>
      service.registerPending({
        ...registration,
        clientClaimedMimeType: "image/png",
      }),
    BadRequestException,
  );
  assert.equal(repository.lastCreate, undefined);
  assert.equal(audits.length, 0);
});
test("generic metadata excludes bucket and object key", async () => {
  const result = await harness().service.getMetadata("file-1");
  assert.ok(!("bucket" in result));
  assert.ok(!("objectKey" in result));
});
test("cross-department lookup is safe not-found", async () => {
  const { service, repository } = harness();
  repository.record = file("PENDING_SCAN", "department-b");
  await assert.rejects(() => service.getMetadata("file-1"), NotFoundException);
});
test("availability requires latest CLEAN and writes audit", async () => {
  const { service, repository, audits } = harness();
  await service.recordScan({
    fileId: "file-1",
    scanner: " scanner ",
    status: "CLEAN",
  });
  assert.equal((await service.markAvailable("file-1")).status, "AVAILABLE");
  assert.equal(repository.transitioned?.requireLatestCleanScan, true);
  assert.equal(audits.length, 2);
});
for (const status of [
  "AVAILABLE",
  "QUARANTINED",
  "REJECTED",
  "ARCHIVED",
  "DELETED",
] as const) {
  test(`scan recording is rejected for ${status}`, async () => {
    const { service, repository } = harness();
    repository.record = file(status);
    await assert.rejects(
      () =>
        service.recordScan({
          fileId: "file-1",
          scanner: "scanner",
          status: "ERROR",
        }),
      ConflictException,
    );
  });
}
for (const status of ["PENDING", "SKIPPED"] as const) {
  test(`trusted scan recording rejects ${status}`, async () => {
    const { service } = harness();
    await assert.rejects(
      () =>
        service.recordScan({
          fileId: "file-1",
          scanner: "scanner",
          status: status as never,
        }),
      BadRequestException,
    );
  });
}
for (const status of [undefined, "ERROR", "INFECTED"] as const) {
  test(`availability fails for latest scan ${status ?? "missing"}`, async () => {
    const { service, repository } = harness();
    if (status)
      await repository.recordScanResult({
        fileId: "file-1",
        departmentId: "department-a",
        scanner: "scanner",
        status,
      });
    await assert.rejects(
      () => service.markAvailable("file-1"),
      ConflictException,
    );
  });
}
for (const status of ["QUARANTINED", "ARCHIVED", "DELETED"] as const) {
  test(`${status} cannot be activated`, async () => {
    const { service, repository } = harness();
    repository.record = file(status);
    await assert.rejects(
      () => service.markAvailable("file-1"),
      ConflictException,
    );
  });
}
test("archive and delete are soft-state transitions", async () => {
  const { service, repository } = harness();
  repository.record = file("AVAILABLE");
  assert.equal(
    (await service.archive({ fileId: "file-1" })).status,
    "ARCHIVED",
  );
  const deleted = await service.markDeleted("file-1");
  assert.equal(deleted.status, "DELETED");
  assert.ok(repository.record.deletedAt);
});
test("audit failure is propagated", async () => {
  const { service } = harness();
  (service as unknown as { prisma: unknown }).prisma = {
    auditLog: {
      create: async () => {
        throw new Error("audit failed");
      },
    },
  };
  await assert.rejects(
    () => service.registerPending(registration),
    /audit failed/,
  );
});
