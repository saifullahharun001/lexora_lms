import { Injectable } from "@nestjs/common";
import {
  Prisma,
  type FileObject,
  type MalwareScanResult,
} from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import type { FileStorageRepository } from "../../application/ports/file-storage.repository";
import type {
  FileLifecycleTransitionInput,
  FileObjectMetadata,
  FileObjectPersistenceRecord,
  MalwareScanResultRecord,
  ReadFileMetadataInput,
  RecordScanResultInput,
  RegisterPendingFileInput,
} from "../../contracts/file-storage.contracts";

export function toOptionalPrismaJson(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | undefined {
  return value == null ? undefined : (value as Prisma.InputJsonValue);
}

@Injectable()
export class PrismaFileStorageRepository implements FileStorageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createPending(
    input: RegisterPendingFileInput,
  ): Promise<FileObjectPersistenceRecord> {
    return this.mapFile(
      await this.prisma.fileObject.create({
        data: { ...input, status: "PENDING_SCAN" },
      }),
    );
  }

  async findById(
    input: ReadFileMetadataInput,
  ): Promise<FileObjectPersistenceRecord | null> {
    const record = await this.prisma.fileObject.findFirst({
      where: {
        id: input.fileId,
        departmentId: input.departmentId,
        ...(input.includeDeleted ? {} : { status: { not: "DELETED" } }),
      },
    });
    return record ? this.mapFile(record) : null;
  }

  async findLatestScan(
    fileId: string,
    departmentId: string,
  ): Promise<MalwareScanResultRecord | null> {
    const scan = await this.prisma.malwareScanResult.findFirst({
      where: {
        fileObjectId: fileId,
        fileObject: { departmentId, status: { not: "DELETED" } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return scan ? this.mapScan(scan) : null;
  }

  async recordScanResult(
    input: RecordScanResultInput,
  ): Promise<MalwareScanResultRecord> {
    const rawResultJson = toOptionalPrismaJson(input.safeDiagnosticMetadata);
    return this.prisma.$transaction(
      async (tx) => {
        const file = await tx.fileObject.findFirst({
          where: {
            id: input.fileId,
            departmentId: input.departmentId,
            status: "PENDING_SCAN",
          },
          select: { id: true },
        });
        if (!file) throw new Error("FILE_NOT_PENDING_OR_NOT_FOUND");
        return this.mapScan(
          await tx.malwareScanResult.create({
            data: {
              fileObjectId: file.id,
              scanner: input.scanner,
              status: input.status,
              signatureName: input.signatureName,
              rawResultJson,
              scannedAt: input.scannedAt,
            },
          }),
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async transitionStatus(
    input: FileLifecycleTransitionInput,
  ): Promise<FileObjectPersistenceRecord | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const file = await tx.fileObject.findFirst({
          where: { id: input.fileId, departmentId: input.departmentId },
          select: { id: true, status: true },
        });
        if (!file || !input.expectedStatuses.includes(file.status)) return null;
        if (
          input.targetStatus === "AVAILABLE" ||
          input.requireLatestCleanScan
        ) {
          const scan = await tx.malwareScanResult.findFirst({
            where: { fileObjectId: file.id },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { status: true },
          });
          if (scan?.status !== "CLEAN") return null;
        }
        const timestamp = input.lifecycleTimestamp ?? new Date();
        const result = await tx.fileObject.updateMany({
          where: {
            id: input.fileId,
            departmentId: input.departmentId,
            status: { in: input.expectedStatuses },
          },
          data: {
            status: input.targetStatus,
            ...(input.targetStatus === "ARCHIVED"
              ? { archivedAt: timestamp }
              : {}),
            ...(input.targetStatus === "DELETED"
              ? { deletedAt: timestamp }
              : {}),
          },
        });
        if (result.count !== 1) return null;
        return this.mapFile(
          await tx.fileObject.findFirstOrThrow({
            where: { id: input.fileId, departmentId: input.departmentId },
          }),
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  archive(
    fileId: string,
    departmentId: string,
    expectedStatuses: FileObjectMetadata["status"][],
  ) {
    return this.transitionStatus({
      fileId,
      departmentId,
      expectedStatuses,
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
  private mapFile(record: FileObject): FileObjectPersistenceRecord {
    return { ...record };
  }
  private mapScan(record: MalwareScanResult): MalwareScanResultRecord {
    const metadata = record.rawResultJson;
    return {
      id: record.id,
      fileObjectId: record.fileObjectId,
      scanner: record.scanner,
      status: record.status,
      signatureName: record.signatureName,
      safeDiagnosticMetadata:
        metadata && typeof metadata === "object" && !Array.isArray(metadata)
          ? (metadata as Record<string, unknown>)
          : null,
      scannedAt: record.scannedAt,
      createdAt: record.createdAt,
    };
  }
}
