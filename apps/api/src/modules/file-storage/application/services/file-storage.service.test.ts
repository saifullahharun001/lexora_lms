import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
import type { MalwareScannerPort } from "../ports/malware-scanner.port";
import { FileStorageService } from "./file-storage.service";

const storedBytes = Buffer.alloc(42, 1);
const storedChecksum = createHash("sha256").update(storedBytes).digest("hex");

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
    objectKey: `quarantine/${departmentId}/id-123`,
    originalFilename: "report.pdf",
    mimeType: "application/pdf",
    sizeBytes: 42,
    checksumSha256: storedChecksum,
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
    if (this.record.departmentId !== input.departmentId) return null;
    if (!input.expectedStatuses.includes(this.record.status)) return null;
    if (
      input.targetStatus === "AVAILABLE" &&
      (this.scans.at(-1)?.status !== "CLEAN" ||
        !input.promotionLocation ||
        this.record.objectKey !==
          input.promotionLocation.expectedQuarantineObjectKey ||
        !this.record.objectKey.startsWith(
          `quarantine/${input.departmentId}/`,
        ) ||
        input.promotionLocation.availableObjectKey !==
          `available/${this.record.objectKey.slice("quarantine/".length)}`)
    )
      return null;
    this.record = {
      ...this.record,
      status: input.targetStatus,
      objectKey:
        input.targetStatus === "AVAILABLE"
          ? (input.promotionLocation?.availableObjectKey ??
            this.record.objectKey)
          : this.record.objectKey,
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
  const storageCalls = {
    stats: 0,
    reads: [] as Readable[],
    moves: [] as unknown[],
  };
  const objectStorage = {
    statObject: async (location: { bucket: string; objectKey: string }) => {
      storageCalls.stats += 1;
      return { ...location, sizeBytes: 42 };
    },
    readObject: async () => {
      const stream = Readable.from([Buffer.from(storedBytes)]);
      storageCalls.reads.push(stream);
      return stream;
    },
    moveToAvailable: async (...args: unknown[]) => {
      storageCalls.moves.push(args);
      const destination = args[1] as { bucket: string; objectKey: string };
      return { ...destination, sizeBytes: 42 };
    },
  };
  const contentInspector = {
    inspect: async () => ({
      canonicalMimeType: "application/pdf",
      recognizedExtension: "pdf",
    }),
  };
  const scannerCalls: Readable[] = [];
  const malwareScanner: MalwareScannerPort = {
    scan: async (stream: Readable) => {
      scannerCalls.push(stream);
      for await (const _chunk of stream) void _chunk;
      return { scanner: "clamav", status: "CLEAN" as const };
    },
  };
  return {
    service: new FileStorageService(
      repository,
      objectStorage as never,
      contentInspector,
      malwareScanner,
      prisma as never,
      { get: () => requestContext } as never,
    ),
    repository,
    audits,
    objectStorage,
    contentInspector,
    malwareScanner,
    storageCalls,
    scannerCalls,
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
  assert.deepEqual(repository.transitioned?.promotionLocation, {
    expectedQuarantineObjectKey: "quarantine/department-a/id-123",
    availableObjectKey: "available/department-a/id-123",
  });
  assert.equal(repository.record.objectKey, "available/department-a/id-123");
  assert.equal(
    (
      await repository.findById({
        fileId: "file-1",
        departmentId: "department-a",
      })
    )?.objectKey,
    "available/department-a/id-123",
  );
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
      status === "DELETED" ? NotFoundException : ConflictException,
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

test("stored-byte CLEAN scan uses distinct streams, verifies integrity, promotes, and returns safe data", async () => {
  const { service, repository, audits, storageCalls, scannerCalls } = harness();
  const result = await service.scanPendingStoredFile("file-1");
  assert.equal(result.scan.status, "CLEAN");
  assert.equal(result.file.status, "AVAILABLE");
  assert.equal(result.promotionCompleted, true);
  assert.equal(storageCalls.stats, 1);
  assert.equal(storageCalls.reads.length, 2);
  assert.notEqual(storageCalls.reads[0], storageCalls.reads[1]);
  assert.equal(scannerCalls.length, 1);
  assert.deepEqual(storageCalls.moves[0], [
    { bucket: "private", objectKey: "quarantine/department-a/id-123" },
    { bucket: "private", objectKey: "available/department-a/id-123" },
    { expectedSizeBytes: 42, expectedChecksumSha256: storedChecksum },
  ]);
  assert.equal(repository.transitioned?.requireLatestCleanScan, true);
  assert.equal(audits.length, 2);
  const serialized = JSON.stringify({ result, audits });
  assert.equal(serialized.includes("quarantine/"), false);
  assert.equal(serialized.includes('"bucket"'), false);
});

test("stored-byte scan blocks cross-department access before all side effects", async () => {
  const h = harness();
  h.repository.record = file("PENDING_SCAN", "department-b");
  h.contentInspector.inspect = async () => {
    throw new Error("must not inspect");
  };
  h.malwareScanner.scan = async () => {
    throw new Error("must not scan");
  };
  await assert.rejects(
    () => h.service.scanPendingStoredFile("file-1"),
    NotFoundException,
  );
  assert.equal(h.storageCalls.stats, 0);
  assert.equal(h.storageCalls.reads.length, 0);
  assert.equal(h.storageCalls.moves.length, 0);
  assert.equal(h.repository.scans.length, 0);
  assert.equal(h.repository.transitioned, undefined);
  assert.equal(h.audits.length, 0);
});

test("stored-byte scan blocks non-pending lifecycle before storage and scanning", async () => {
  const h = harness();
  h.repository.record = file("AVAILABLE");
  await assert.rejects(
    () => h.service.scanPendingStoredFile("file-1"),
    ConflictException,
  );
  assert.equal(h.storageCalls.stats, 0);
  assert.equal(h.storageCalls.reads.length, 0);
  assert.equal(h.scannerCalls.length, 0);
  assert.equal(h.storageCalls.moves.length, 0);
});

test("stored-byte scan hides an out-of-scope persisted quarantine key", async () => {
  const h = harness();
  h.repository.record.objectKey = "quarantine/department-b/id-123";
  await assert.rejects(
    () => h.service.scanPendingStoredFile("file-1"),
    NotFoundException,
  );
  assert.equal(h.storageCalls.stats, 0);
  assert.equal(h.storageCalls.reads.length, 0);
  assert.equal(h.repository.scans.length, 0);
  assert.equal(h.storageCalls.moves.length, 0);
});

for (const [name, configure, classification] of [
  [
    "missing quarantine object",
    (h: ReturnType<typeof harness>) => {
      h.objectStorage.statObject = async () => null as never;
    },
    "object_not_found",
  ],
  [
    "authoritative size mismatch",
    (h: ReturnType<typeof harness>) => {
      h.objectStorage.statObject = async (location) => ({
        ...location,
        sizeBytes: 41,
      });
    },
    "object_metadata_mismatch",
  ],
  [
    "authoritative location mismatch",
    (h: ReturnType<typeof harness>) => {
      h.objectStorage.statObject = async () => ({
        bucket: "private",
        objectKey: "quarantine/department-b/id-123",
        sizeBytes: 42,
      });
    },
    "object_metadata_mismatch",
  ],
] as const) {
  test(`stored-byte scan persists sanitized ERROR for ${name}`, async () => {
    const h = harness();
    configure(h);
    const result = await h.service.scanPendingStoredFile("file-1");
    assert.equal(result.scan.status, "ERROR");
    assert.deepEqual(result.scan.safeDiagnosticMetadata, { classification });
    assert.equal(result.promotionCompleted, false);
    assert.equal(h.storageCalls.reads.length, 0);
    assert.equal(h.storageCalls.moves.length, 0);
    assert.equal(h.repository.transitioned, undefined);
  });
}

for (const [code, classification] of [
  ["CONTENT_UNRECOGNIZED", "content_unrecognized"],
  ["CONTENT_INSPECTION_TIMEOUT", "content_inspection_timeout"],
  ["CONTENT_INSPECTION_FAILED", "content_inspection_failed"],
] as const) {
  test(`stored-byte scan fails closed for inspection ${code}`, async () => {
    const h = harness();
    h.contentInspector.inspect = async () => {
      throw new ContentInspectionError(code);
    };
    const result = await h.service.scanPendingStoredFile("file-1");
    assert.equal(result.scan.status, "ERROR");
    assert.deepEqual(result.scan.safeDiagnosticMetadata, { classification });
    assert.equal(h.scannerCalls.length, 0);
    assert.equal(h.storageCalls.reads.length, 1);
    assert.equal(h.storageCalls.moves.length, 0);
  });
}

for (const detected of [
  { canonicalMimeType: "image/png", recognizedExtension: "png" },
  { canonicalMimeType: "application/pdf", recognizedExtension: "png" },
]) {
  test("stored-byte scan rejects fresh content-policy or persisted MIME mismatch", async () => {
    const h = harness();
    h.contentInspector.inspect = async () => detected;
    const result = await h.service.scanPendingStoredFile("file-1");
    assert.equal(result.scan.status, "ERROR");
    assert.deepEqual(result.scan.safeDiagnosticMetadata, {
      classification: "content_policy_mismatch",
    });
    assert.equal(h.scannerCalls.length, 0);
    assert.equal(h.storageCalls.moves.length, 0);
  });
}

for (const outcome of ["INFECTED", "ERROR"] as const) {
  test(`stored-byte scanner ${outcome} remains quarantined`, async () => {
    const h = harness();
    h.malwareScanner.scan = async (stream) => {
      for await (const _chunk of stream) void _chunk;
      return outcome === "INFECTED"
        ? { scanner: "clamav", status: outcome, signatureName: "Eicar-Test" }
        : {
            scanner: "clamav",
            status: outcome,
            safeDiagnosticMetadata: { classification: "scanner_error" },
          };
    };
    const result = await h.service.scanPendingStoredFile("file-1");
    assert.equal(result.scan.status, outcome);
    assert.equal(
      result.scan.signatureName,
      outcome === "INFECTED" ? "Eicar-Test" : null,
    );
    assert.equal(result.promotionCompleted, false);
    assert.equal(h.storageCalls.moves.length, 0);
    assert.equal(h.repository.transitioned, undefined);
  });
}

test("unexpected scanner throw becomes sanitized ERROR", async () => {
  const h = harness();
  h.malwareScanner.scan = async () => {
    throw new Error("provider endpoint secret");
  };
  const result = await h.service.scanPendingStoredFile("file-1");
  assert.equal(result.scan.status, "ERROR");
  assert.deepEqual(result.scan.safeDiagnosticMetadata, {
    classification: "scanner_exception",
  });
  assert.equal(
    JSON.stringify({ result, audits: h.audits }).includes("secret"),
    false,
  );
  assert.equal(h.storageCalls.moves.length, 0);
});

for (const failure of ["size", "checksum", "incomplete"] as const) {
  test(`CLEAN scan is downgraded on ${failure} integrity failure`, async () => {
    const h = harness();
    if (failure === "size")
      h.repository.record = { ...h.repository.record, sizeBytes: 41 };
    if (failure === "checksum")
      h.repository.record = {
        ...h.repository.record,
        checksumSha256: "b".repeat(64),
      };
    if (failure === "incomplete")
      h.malwareScanner.scan = async () => ({
        scanner: "clamav",
        status: "CLEAN",
      });
    if (failure === "size")
      h.objectStorage.statObject = async (location) => ({
        ...location,
        sizeBytes: 41,
      });
    const result = await h.service.scanPendingStoredFile("file-1");
    assert.equal(result.scan.status, "ERROR");
    assert.deepEqual(result.scan.safeDiagnosticMetadata, {
      classification: "integrity_mismatch",
    });
    assert.equal(h.storageCalls.moves.length, 0);
  });
}

test("scan audit failure propagates before promotion", async () => {
  const h = harness();
  (h.service as unknown as { prisma: unknown }).prisma = {
    auditLog: { create: async () => Promise.reject(new Error("audit failed")) },
  };
  await assert.rejects(
    () => h.service.scanPendingStoredFile("file-1"),
    /audit failed/,
  );
  assert.equal(h.storageCalls.moves.length, 0);
  assert.equal(h.repository.transitioned, undefined);
});

test("promotion failure leaves persisted CLEAN and database pending", async () => {
  const h = harness();
  h.objectStorage.moveToAvailable = async () => {
    throw new Error("sanitized promotion failure");
  };
  await assert.rejects(
    () => h.service.scanPendingStoredFile("file-1"),
    /sanitized promotion failure/,
  );
  assert.equal(h.repository.scans.at(-1)?.status, "CLEAN");
  assert.equal(h.repository.record.status, "PENDING_SCAN");
  assert.equal(h.repository.transitioned, undefined);
});

test("post-promotion transition failure raises sanitized reconciliation and audits", async () => {
  const h = harness();
  h.repository.transitionStatus = async (input) => {
    h.repository.transitioned = input;
    return null;
  };
  await assert.rejects(
    () => h.service.scanPendingStoredFile("file-1"),
    (error: unknown) =>
      error instanceof ServiceUnavailableException &&
      error.message === "File promotion requires reconciliation",
  );
  assert.equal(h.storageCalls.moves.length, 1);
  assert.equal(h.repository.record.status, "PENDING_SCAN");
  assert.equal(
    JSON.stringify(h.audits).includes(
      "file-storage.file.promotion-reconciliation-required",
    ),
    true,
  );
  assert.equal(JSON.stringify(h.audits).includes("quarantine/"), false);
  assert.equal(
    (h.audits.at(-1) as { data: { outcome: string } }).data.outcome,
    "FAILURE",
  );
});

test("already-moved retry completes the guarded status and object-key update", async () => {
  const h = harness();
  await h.repository.recordScanResult({
    fileId: "file-1",
    departmentId: "department-a",
    scanner: "clamav",
    status: "CLEAN",
  });
  h.objectStorage.moveToAvailable = async (...args: unknown[]) => {
    const destination = args[1] as { bucket: string; objectKey: string };
    return { ...destination, sizeBytes: 42 };
  };
  assert.equal(h.repository.record.status, "PENDING_SCAN");
  assert.equal(h.repository.record.objectKey, "quarantine/department-a/id-123");
  const result = await h.service.markAvailable("file-1");
  assert.equal(result.status, "AVAILABLE");
  assert.equal(h.repository.record.status, "AVAILABLE");
  assert.equal(h.repository.record.objectKey, "available/department-a/id-123");
});

test("unique available-key conflict is a sanitized reconciliation failure", async () => {
  const h = harness();
  await h.repository.recordScanResult({
    fileId: "file-1",
    departmentId: "department-a",
    scanner: "clamav",
    status: "CLEAN",
  });
  h.repository.transitionStatus = async () => {
    throw new Error("Unique constraint failed on provider_object_key_secret");
  };
  await assert.rejects(
    () => h.service.markAvailable("file-1"),
    (error: unknown) =>
      error instanceof ServiceUnavailableException &&
      error.message === "File promotion requires reconciliation",
  );
  const serializedAudit = JSON.stringify(h.audits);
  assert.equal(serializedAudit.includes("provider_object_key_secret"), false);
  assert.equal(
    (h.audits.at(-1) as { data: { outcome: string } }).data.outcome,
    "FAILURE",
  );
});

test("stat exception persists object_metadata_failed", async () => {
  const h = harness();
  h.objectStorage.statObject = async () => {
    throw new Error("provider metadata secret");
  };
  const result = await h.service.scanPendingStoredFile("file-1");
  assert.equal(result.scan.status, "ERROR");
  assert.deepEqual(result.scan.safeDiagnosticMetadata, {
    classification: "object_metadata_failed",
  });
  assert.equal(
    JSON.stringify({ result, audits: h.audits }).includes("secret"),
    false,
  );
  assert.equal(h.storageCalls.reads.length, 0);
  assert.equal(h.storageCalls.moves.length, 0);
});

for (const failingRead of [1, 2] as const) {
  test(`readObject call ${failingRead} persists object_read_failed`, async () => {
    const h = harness();
    let call = 0;
    h.objectStorage.readObject = async () => {
      call += 1;
      if (call === failingRead) throw new Error("provider read secret");
      const stream = Readable.from([Buffer.from(storedBytes)]);
      h.storageCalls.reads.push(stream);
      return stream;
    };
    const result = await h.service.scanPendingStoredFile("file-1");
    assert.equal(result.scan.status, "ERROR");
    assert.deepEqual(result.scan.safeDiagnosticMetadata, {
      classification: "object_read_failed",
    });
    assert.equal(
      JSON.stringify({ result, audits: h.audits }).includes("secret"),
      false,
    );
    assert.equal(h.storageCalls.moves.length, 0);
    assert.equal(h.repository.transitioned, undefined);
    assert.equal(h.scannerCalls.length, 0);
  });
}

test("stored-byte orchestration requires authentication and department before side effects", async () => {
  for (const requestContext of [context(false), context(true, null)]) {
    const h = harness(requestContext);
    await assert.rejects(() => h.service.scanPendingStoredFile("file-1"));
    assert.equal(h.storageCalls.stats, 0);
    assert.equal(h.storageCalls.reads.length, 0);
    assert.equal(h.scannerCalls.length, 0);
    assert.equal(h.repository.scans.length, 0);
    assert.equal(h.repository.transitioned, undefined);
    assert.equal(h.storageCalls.moves.length, 0);
    assert.equal(h.audits.length, 0);
  }
});

for (const status of [undefined, "INFECTED", "ERROR"] as const) {
  test(`object-aware availability does not promote latest ${status ?? "missing"} scan`, async () => {
    const h = harness();
    if (status)
      await h.repository.recordScanResult({
        fileId: "file-1",
        departmentId: "department-a",
        scanner: "clamav",
        status,
      });
    await assert.rejects(
      () => h.service.markAvailable("file-1"),
      ConflictException,
    );
    assert.equal(h.storageCalls.moves.length, 0);
  });
}
