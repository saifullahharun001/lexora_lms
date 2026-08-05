import { createHash, type Hash } from "node:crypto";
import { Readable } from "node:stream";

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  type FileObjectStatus,
  type FileVisibility,
  Prisma,
} from "@prisma/client";

import { PrismaService } from "../../../../common/prisma/prisma.service";
import { RequestContextService } from "../../../../common/request-context/request-context.service";
import type {
  FileArchiveRequest,
  FileObjectMetadata,
  FileObjectPersistenceRecord,
  FileQuarantineRequest,
  MalwareScanResultRecord,
  TrustedMalwareScanStatus,
} from "../../contracts/file-storage.contracts";
import { assertFileLifecycleTransition } from "../../domain/file-lifecycle.policy";
import { FILE_STORAGE_AUDIT_EVENTS } from "../../domain/file-storage.audit-events";
import {
  FILE_CONTENT_INSPECTOR_PORT,
  FILE_STORAGE_REPOSITORY,
  MALWARE_SCANNER_PORT,
  OBJECT_STORAGE_PORT,
} from "../../domain/file-storage.constants";
import {
  FileStorageValidationError,
  normalizeSafeDiagnosticMetadata,
  validatePendingMetadata,
  validateTrustedScanInput,
} from "../../domain/file-storage-validation";
import {
  ACADEMIC_DOCUMENT_CONTENT_POLICY,
  enforceTrustedFileContentPolicy,
  FileContentPolicyError,
} from "../../domain/trusted-file-content.policy";
import {
  ContentInspectionError,
  type FileContentInspectorPort,
} from "../ports/file-content-inspector.port";
import type { FileStorageRepository } from "../ports/file-storage.repository";
import type {
  MalwareScannerPort,
  MalwareScannerResult,
} from "../ports/malware-scanner.port";
import type { ObjectStoragePort } from "../ports/object-storage.port";

const ORCHESTRATOR_SCANNER = "file-storage-orchestrator";
const INFECTED_QUARANTINE_REASON =
  "Trusted malware scan reported an infected file";
type OrchestrationErrorClassification =
  | "object_not_found"
  | "object_metadata_failed"
  | "object_metadata_mismatch"
  | "object_read_failed"
  | "content_unrecognized"
  | "content_inspection_timeout"
  | "content_inspection_failed"
  | "content_policy_mismatch"
  | "scanner_exception"
  | "integrity_mismatch";

class StreamingIntegrityVerifier {
  private readonly hash: Hash = createHash("sha256");
  private byteCount = 0;
  private completelyConsumed = false;
  readonly stream: Readable;

  constructor(private readonly source: Readable) {
    this.stream = Readable.from(this.verify());
  }

  private async *verify(): AsyncGenerator<Buffer> {
    for await (const chunk of this.source) {
      const bytes =
        typeof chunk === "string"
          ? Buffer.from(chunk)
          : Buffer.isBuffer(chunk)
            ? chunk
            : ArrayBuffer.isView(chunk)
              ? Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
              : null;
      if (!bytes) throw new Error("Unsupported stored-byte stream chunk");
      this.byteCount += bytes.byteLength;
      this.hash.update(bytes);
      yield bytes;
    }
    this.completelyConsumed = true;
  }

  result(): { complete: boolean; sizeBytes: number; checksumSha256: string } {
    return {
      complete: this.completelyConsumed,
      sizeBytes: this.byteCount,
      checksumSha256: this.hash.copy().digest("hex"),
    };
  }
}

export interface ScanPendingStoredFileResult {
  file: FileObjectMetadata;
  scan: MalwareScanResultRecord;
  promotionCompleted: boolean;
}

export interface RegisterPendingFileServiceInput {
  bucket: string;
  objectKey: string;
  originalFilename: string;
  clientClaimedMimeType?: string;
  sizeBytes: number;
  checksumSha256: string;
  visibility?: FileVisibility;
}
/** Trusted infrastructure boundary. Never expose scan recording through a user-facing controller or workflow. */
export interface RecordScanServiceInput {
  fileId: string;
  scanner: string;
  status: TrustedMalwareScanStatus;
  signatureName?: string | null;
  safeDiagnosticMetadata?: Record<string, unknown> | null;
  scannedAt?: Date;
}

@Injectable()
export class FileStorageService {
  constructor(
    @Inject(FILE_STORAGE_REPOSITORY)
    private readonly repository: FileStorageRepository,
    @Inject(OBJECT_STORAGE_PORT)
    private readonly objectStorage: ObjectStoragePort,
    @Inject(FILE_CONTENT_INSPECTOR_PORT)
    private readonly contentInspector: FileContentInspectorPort,
    @Inject(MALWARE_SCANNER_PORT)
    private readonly malwareScanner: MalwareScannerPort,
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
  ) {}

  async registerPending(
    input: RegisterPendingFileServiceInput,
  ): Promise<FileObjectMetadata> {
    const { actorId, departmentId } = this.requireActorContext();
    const requiredPrefix = `quarantine/${departmentId}/`;
    if (!input.objectKey.startsWith(requiredPrefix))
      throw new NotFoundException("Quarantine object was not found");
    let metadata: ReturnType<typeof validatePendingMetadata>;
    try {
      metadata = validatePendingMetadata({
        ...input,
        canonicalMimeType: "application/octet-stream",
      });
    } catch (error) {
      this.rethrowValidation(error);
    }
    const location = { bucket: metadata.bucket, objectKey: metadata.objectKey };
    const authoritative = await this.objectStorage.statObject(location);
    if (!authoritative)
      throw new NotFoundException("Quarantine object was not found");
    if (authoritative.sizeBytes !== metadata.sizeBytes)
      throw new BadRequestException("Quarantine object size does not match");
    const stream = await this.objectStorage.readObject(location);
    let detected: Awaited<ReturnType<FileContentInspectorPort["inspect"]>>;
    try {
      detected = await this.contentInspector.inspect(stream);
    } catch (error) {
      if (!(error instanceof ContentInspectionError)) throw error;
      if (error.code === "CONTENT_UNRECOGNIZED")
        throw new BadRequestException("File content is not recognized");
      throw new ServiceUnavailableException(
        "File content inspection is temporarily unavailable",
      );
    }
    let accepted: ReturnType<typeof enforceTrustedFileContentPolicy>;
    try {
      accepted = enforceTrustedFileContentPolicy({
        filename: metadata.originalFilename,
        claimedMimeType: input.clientClaimedMimeType,
        detectedCanonicalMimeType: detected.canonicalMimeType,
        detectedExtension: detected.recognizedExtension,
        policy: ACADEMIC_DOCUMENT_CONTENT_POLICY,
      });
    } catch (error) {
      if (!(error instanceof FileContentPolicyError)) throw error;
      throw new BadRequestException("File content is not accepted");
    }
    try {
      metadata = validatePendingMetadata({
        ...metadata,
        canonicalMimeType: accepted.canonicalMimeType,
      });
    } catch (error) {
      this.rethrowValidation(error);
    }
    const file = await this.repository.createPending({
      departmentId,
      uploadedByUserId: actorId,
      bucket: metadata.bucket,
      objectKey: metadata.objectKey,
      originalFilename: metadata.originalFilename,
      mimeType: metadata.mimeType,
      sizeBytes: metadata.sizeBytes,
      checksumSha256: metadata.checksumSha256,
      visibility: input.visibility ?? "PRIVATE",
    });
    await this.writeAudit(
      FILE_STORAGE_AUDIT_EVENTS.REGISTERED_PENDING_SCAN,
      file,
      {
        contentPolicyId: accepted.policyId,
        canonicalMime: accepted.canonicalMimeType,
        recognizedExtension: accepted.recognizedExtension,
      },
    );
    return this.toSafeMetadata(file);
  }

  async getMetadata(fileId: string): Promise<FileObjectMetadata> {
    const { departmentId } = this.requireActorContext();
    return this.toSafeMetadata(await this.requireFile(fileId, departmentId));
  }

  async recordScan(
    input: RecordScanServiceInput,
  ): Promise<MalwareScanResultRecord> {
    const { departmentId } = this.requireActorContext();
    if (!["CLEAN", "INFECTED", "ERROR"].includes(input.status))
      throw new BadRequestException("Unsupported trusted scan status");
    const current = await this.requireFile(input.fileId, departmentId, true);
    if (current.status !== "PENDING_SCAN")
      throw new ConflictException(
        "Scan results may only be recorded for pending files",
      );
    let trusted: ReturnType<typeof validateTrustedScanInput>;
    let diagnosticMetadata: Record<string, unknown> | null;
    try {
      trusted = validateTrustedScanInput(input);
      diagnosticMetadata = normalizeSafeDiagnosticMetadata(
        input.safeDiagnosticMetadata,
      );
    } catch (error) {
      this.rethrowValidation(error);
    }
    let scan: MalwareScanResultRecord;
    try {
      scan = await this.repository.recordScanResult({
        fileId: input.fileId,
        departmentId,
        status: input.status,
        scanner: trusted.scanner,
        signatureName: trusted.signatureName,
        scannedAt: trusted.scannedAt,
        safeDiagnosticMetadata: diagnosticMetadata,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "FILE_NOT_PENDING_OR_NOT_FOUND"
      )
        throw new ConflictException(
          "Scan results may only be recorded for pending files",
        );
      throw error;
    }
    await this.writeAudit(FILE_STORAGE_AUDIT_EVENTS.SCAN_RECORDED, current, {
      scanStatus: scan.status,
    });
    return scan;
  }

  /** Trusted infrastructure/application boundary. Never expose this method directly through a user-facing controller. */
  async scanPendingStoredFile(
    fileId: string,
  ): Promise<ScanPendingStoredFileResult> {
    const { departmentId } = this.requireActorContext();
    const current = await this.requireFile(fileId, departmentId);
    if (current.status !== "PENDING_SCAN")
      throw new ConflictException("Only pending files may be scanned");
    this.requireDepartmentQuarantineLocation(current, departmentId);

    const location = {
      bucket: current.bucket,
      objectKey: current.objectKey,
    };
    let authoritative: Awaited<ReturnType<ObjectStoragePort["statObject"]>>;
    try {
      authoritative = await this.objectStorage.statObject(location);
    } catch {
      return this.persistOperationalError(current, "object_metadata_failed");
    }
    if (!authoritative)
      return this.persistOperationalError(current, "object_not_found");
    if (
      authoritative.bucket !== location.bucket ||
      authoritative.objectKey !== location.objectKey ||
      !Number.isSafeInteger(authoritative.sizeBytes) ||
      authoritative.sizeBytes <= 0 ||
      authoritative.sizeBytes !== current.sizeBytes
    )
      return this.persistOperationalError(current, "object_metadata_mismatch");

    let inspectionStream: Awaited<ReturnType<ObjectStoragePort["readObject"]>>;
    try {
      inspectionStream = await this.objectStorage.readObject(location);
    } catch {
      return this.persistOperationalError(current, "object_read_failed");
    }
    let detected: Awaited<ReturnType<FileContentInspectorPort["inspect"]>>;
    try {
      detected = await this.contentInspector.inspect(inspectionStream);
    } catch (error) {
      let classification: OrchestrationErrorClassification =
        "content_inspection_failed";
      if (error instanceof ContentInspectionError) {
        if (error.code === "CONTENT_UNRECOGNIZED")
          classification = "content_unrecognized";
        if (error.code === "CONTENT_INSPECTION_TIMEOUT")
          classification = "content_inspection_timeout";
      }
      return this.persistOperationalError(current, classification);
    }
    try {
      const accepted = enforceTrustedFileContentPolicy({
        filename: current.originalFilename,
        detectedCanonicalMimeType: detected.canonicalMimeType,
        detectedExtension: detected.recognizedExtension,
        policy: ACADEMIC_DOCUMENT_CONTENT_POLICY,
      });
      if (accepted.canonicalMimeType !== current.mimeType)
        return this.persistOperationalError(current, "content_policy_mismatch");
    } catch (error) {
      if (!(error instanceof FileContentPolicyError)) throw error;
      return this.persistOperationalError(current, "content_policy_mismatch");
    }

    let scannerResult: MalwareScannerResult;
    let source:
      | Awaited<ReturnType<ObjectStoragePort["readObject"]>>
      | undefined;
    let verifier: StreamingIntegrityVerifier | undefined;
    try {
      source = await this.objectStorage.readObject(location);
    } catch {
      return this.persistOperationalError(current, "object_read_failed");
    }
    try {
      verifier = new StreamingIntegrityVerifier(source);
      scannerResult = await this.malwareScanner.scan(verifier.stream);
    } catch {
      scannerResult = this.orchestratorError("scanner_exception");
    } finally {
      this.disposeStream(source);
      this.disposeStream(verifier?.stream);
    }

    if (!["CLEAN", "INFECTED", "ERROR"].includes(scannerResult.status))
      scannerResult = this.orchestratorError("scanner_exception");
    if (scannerResult.status === "CLEAN") {
      const integrity = verifier?.result();
      if (
        !integrity?.complete ||
        integrity.sizeBytes !== current.sizeBytes ||
        integrity.checksumSha256 !== current.checksumSha256.toLowerCase()
      )
        scannerResult = this.orchestratorError("integrity_mismatch");
    }

    const scan = await this.recordScan({
      fileId: current.id,
      scanner: scannerResult.scanner,
      status: scannerResult.status,
      signatureName: scannerResult.signatureName,
      safeDiagnosticMetadata: scannerResult.safeDiagnosticMetadata,
      scannedAt: new Date(),
    });
    if (scan.status === "INFECTED") {
      const quarantined = await this.quarantineInfected(current);
      return { file: quarantined, scan, promotionCompleted: false };
    }
    if (scan.status !== "CLEAN")
      return {
        file: this.toSafeMetadata(current),
        scan,
        promotionCompleted: false,
      };
    const available = await this.markAvailable(current.id);
    return { file: available, scan, promotionCompleted: true };
  }

  async markAvailable(fileId: string): Promise<FileObjectMetadata> {
    const { departmentId } = this.requireActorContext();
    const current = await this.requireFile(fileId, departmentId);
    assertFileLifecycleTransition(current.status, "AVAILABLE");
    if (current.status !== "PENDING_SCAN")
      throw new ConflictException("File lifecycle transition is not allowed");
    const latestScan = await this.repository.findLatestScan(
      fileId,
      departmentId,
    );
    if (latestScan?.status !== "CLEAN")
      throw new ConflictException("A latest persisted CLEAN scan is required");
    this.requireDepartmentQuarantineLocation(current, departmentId);
    const destinationKey = `available/${current.objectKey.slice("quarantine/".length)}`;
    await this.objectStorage.moveToAvailable(
      { bucket: current.bucket, objectKey: current.objectKey },
      { bucket: current.bucket, objectKey: destinationKey },
      {
        expectedSizeBytes: current.sizeBytes,
        expectedChecksumSha256: current.checksumSha256,
      },
    );
    let updated: FileObjectPersistenceRecord | null;
    try {
      updated = await this.repository.transitionStatus({
        fileId,
        departmentId,
        expectedStatuses: ["PENDING_SCAN"],
        targetStatus: "AVAILABLE",
        requireLatestCleanScan: true,
        promotionLocation: {
          expectedQuarantineObjectKey: current.objectKey,
          availableObjectKey: destinationKey,
        },
      });
    } catch {
      await this.writeAudit(
        FILE_STORAGE_AUDIT_EVENTS.PROMOTION_RECONCILIATION_REQUIRED,
        current,
        { lifecycleStatus: current.status },
        "FAILURE",
      );
      throw new ServiceUnavailableException(
        "File promotion requires reconciliation",
      );
    }
    if (
      !updated ||
      updated.status !== "AVAILABLE" ||
      updated.objectKey !== destinationKey
    ) {
      await this.writeAudit(
        FILE_STORAGE_AUDIT_EVENTS.PROMOTION_RECONCILIATION_REQUIRED,
        current,
        { lifecycleStatus: current.status },
        "FAILURE",
      );
      throw new ServiceUnavailableException(
        "File promotion requires reconciliation",
      );
    }
    await this.writeAudit(FILE_STORAGE_AUDIT_EVENTS.AVAILABLE, updated);
    return this.toSafeMetadata(updated);
  }
  quarantine(input: FileQuarantineRequest) {
    if (!input.reason.trim())
      throw new BadRequestException("Quarantine reason is required");
    return this.transition(
      input.fileId,
      ["PENDING_SCAN", "AVAILABLE"],
      "QUARANTINED",
      FILE_STORAGE_AUDIT_EVENTS.QUARANTINED,
      input.reason,
    );
  }
  rejectPending(fileId: string, reason: string) {
    if (!reason.trim())
      throw new BadRequestException("Rejection reason is required");
    return this.transition(
      fileId,
      ["PENDING_SCAN"],
      "REJECTED",
      FILE_STORAGE_AUDIT_EVENTS.REJECTED,
      reason,
    );
  }
  archive(input: FileArchiveRequest) {
    return this.transition(
      input.fileId,
      ["AVAILABLE", "QUARANTINED", "REJECTED"],
      "ARCHIVED",
      FILE_STORAGE_AUDIT_EVENTS.ARCHIVED,
      input.reason,
    );
  }
  markDeleted(fileId: string) {
    return this.transition(
      fileId,
      ["ARCHIVED"],
      "DELETED",
      FILE_STORAGE_AUDIT_EVENTS.DELETED,
    );
  }

  private async transition(
    fileId: string,
    expectedStatuses: FileObjectStatus[],
    targetStatus: FileObjectStatus,
    auditEvent: string,
    reason?: string,
    requireLatestCleanScan = false,
  ): Promise<FileObjectMetadata> {
    const { departmentId } = this.requireActorContext();
    const current = await this.requireFile(fileId, departmentId, true);
    assertFileLifecycleTransition(current.status, targetStatus);
    if (!expectedStatuses.includes(current.status))
      throw new ConflictException("File lifecycle transition is not allowed");
    const updated = await this.repository.transitionStatus({
      fileId,
      departmentId,
      expectedStatuses,
      targetStatus,
      requireLatestCleanScan,
    });
    if (!updated) {
      if (targetStatus === "AVAILABLE")
        throw new ConflictException(
          "A latest persisted CLEAN scan is required",
        );
      throw new ConflictException(
        "File lifecycle state changed; retry the operation",
      );
    }
    await this.writeAudit(
      auditEvent,
      updated,
      reason ? { reason: reason.trim().slice(0, 250) } : undefined,
    );
    return this.toSafeMetadata(updated);
  }

  private async requireFile(
    fileId: string,
    departmentId: string,
    includeDeleted = false,
  ) {
    const file = await this.repository.findById({
      fileId,
      departmentId,
      includeDeleted,
    });
    if (!file) throw new NotFoundException("File not found");
    return file;
  }
  private requireDepartmentQuarantineLocation(
    file: FileObjectPersistenceRecord,
    departmentId: string,
  ): void {
    if (!file.objectKey.startsWith(`quarantine/${departmentId}/`))
      throw new NotFoundException("File not found");
  }
  private async persistOperationalError(
    file: FileObjectPersistenceRecord,
    classification: OrchestrationErrorClassification,
  ): Promise<ScanPendingStoredFileResult> {
    const scan = await this.recordScan({
      fileId: file.id,
      scanner: ORCHESTRATOR_SCANNER,
      status: "ERROR",
      safeDiagnosticMetadata: { classification },
      scannedAt: new Date(),
    });
    return {
      file: this.toSafeMetadata(file),
      scan,
      promotionCompleted: false,
    };
  }
  private async quarantineInfected(
    file: FileObjectPersistenceRecord,
  ): Promise<FileObjectMetadata> {
    const { departmentId } = this.requireActorContext();
    assertFileLifecycleTransition(file.status, "QUARANTINED");
    let updated: FileObjectPersistenceRecord | null;
    try {
      updated = await this.repository.transitionStatus({
        fileId: file.id,
        departmentId,
        expectedStatuses: ["PENDING_SCAN"],
        targetStatus: "QUARANTINED",
      });
    } catch {
      return this.failInfectedQuarantineReconciliation(file);
    }
    if (
      !updated ||
      updated.status !== "QUARANTINED" ||
      updated.departmentId !== file.departmentId ||
      updated.bucket !== file.bucket ||
      updated.objectKey !== file.objectKey
    )
      return this.failInfectedQuarantineReconciliation(file);
    await this.writeAudit(FILE_STORAGE_AUDIT_EVENTS.QUARANTINED, updated, {
      reason: INFECTED_QUARANTINE_REASON,
    });
    return this.toSafeMetadata(updated);
  }
  private async failInfectedQuarantineReconciliation(
    file: FileObjectPersistenceRecord,
  ): Promise<never> {
    try {
      await this.writeAudit(
        FILE_STORAGE_AUDIT_EVENTS.INFECTED_QUARANTINE_RECONCILIATION_REQUIRED,
        file,
        { lifecycleStatus: file.status },
        "FAILURE",
      );
    } catch {
      // Reconciliation audit failure must not expose internal persistence details.
    }
    throw new ServiceUnavailableException(
      "Infected file lifecycle requires reconciliation",
    );
  }
  private orchestratorError(
    classification: OrchestrationErrorClassification,
  ): MalwareScannerResult {
    return {
      scanner: ORCHESTRATOR_SCANNER,
      status: "ERROR",
      safeDiagnosticMetadata: { classification },
    };
  }
  private disposeStream(stream: { destroy(): void } | undefined): void {
    try {
      stream?.destroy();
    } catch {
      // Boundary cleanup must not expose provider or scanner details.
    }
  }
  private requireActorContext(): { actorId: string; departmentId: string } {
    const principal = this.requestContextService.get()?.principal;
    if (!principal?.isAuthenticated || !principal.actorId)
      throw new UnauthorizedException("Authentication is required");
    if (!principal.activeDepartmentId)
      throw new BadRequestException("An active department is required");
    return {
      actorId: principal.actorId,
      departmentId: principal.activeDepartmentId,
    };
  }
  private toSafeMetadata(
    file: FileObjectPersistenceRecord,
  ): FileObjectMetadata {
    const { bucket: _bucket, objectKey: _objectKey, ...safe } = file;
    void _bucket;
    void _objectKey;
    return safe;
  }
  private rethrowValidation(error: unknown): never {
    if (error instanceof FileStorageValidationError)
      throw new BadRequestException(error.message);
    throw error;
  }
  /** State and audit writes are sequential, not atomic; audit failures are intentionally propagated. */
  private async writeAudit(
    action: string,
    file: FileObjectPersistenceRecord,
    extra?: Record<string, unknown>,
    outcome: "SUCCESS" | "FAILURE" = "SUCCESS",
  ) {
    const context = this.requestContextService.get();
    const principal = context?.principal;
    await this.prisma.auditLog.create({
      data: {
        requestId: context?.requestId,
        actorUserId: principal?.actorType === "user" ? principal.actorId : null,
        actorType: principal?.actorType === "service" ? "SERVICE" : "USER",
        departmentId: file.departmentId,
        action,
        targetType: "file_object",
        targetId: file.id,
        outcome,
        ipAddress: context?.audit.ipAddress,
        userAgent: context?.audit.userAgent,
        contextJson: {
          fileObjectId: file.id,
          status: file.status,
          visibility: file.visibility,
          sizeBytes: file.sizeBytes,
          canonicalMime: file.mimeType,
          ...extra,
        } as Prisma.InputJsonValue,
      },
    });
  }
}
