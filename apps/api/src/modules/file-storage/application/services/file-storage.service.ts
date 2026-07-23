import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  Prisma,
  type FileObjectStatus,
  type FileVisibility,
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
import { FILE_STORAGE_AUDIT_EVENTS } from "../../domain/file-storage.audit-events";
import { FILE_STORAGE_REPOSITORY } from "../../domain/file-storage.constants";
import { assertFileLifecycleTransition } from "../../domain/file-lifecycle.policy";
import {
  FileStorageValidationError,
  normalizeSafeDiagnosticMetadata,
  validatePendingMetadata,
  validateTrustedScanInput,
} from "../../domain/file-storage-validation";
import type { FileStorageRepository } from "../ports/file-storage.repository";

export interface RegisterPendingFileServiceInput {
  bucket: string;
  objectKey: string;
  originalFilename: string;
  canonicalMimeType: string;
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
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
  ) {}

  async registerPending(
    input: RegisterPendingFileServiceInput,
  ): Promise<FileObjectMetadata> {
    const { actorId, departmentId } = this.requireActorContext();
    let metadata: ReturnType<typeof validatePendingMetadata>;
    try {
      metadata = validatePendingMetadata(input);
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

  markAvailable(fileId: string) {
    return this.transition(
      fileId,
      ["PENDING_SCAN"],
      "AVAILABLE",
      FILE_STORAGE_AUDIT_EVENTS.AVAILABLE,
      undefined,
      true,
    );
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
        outcome: "SUCCESS",
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
