import type {
  FileObjectStatus,
  FileVisibility,
  MalwareScanStatus,
} from "@prisma/client";

/** Safe metadata. Storage bucket and object key are intentionally excluded. */
export interface FileObjectMetadata {
  id: string;
  departmentId: string;
  uploadedByUserId: string | null;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  visibility: FileVisibility;
  status: FileObjectStatus;
  archivedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Trusted persistence record. Never return this from generic metadata reads. */
export interface FileObjectPersistenceRecord extends FileObjectMetadata {
  bucket: string;
  objectKey: string;
}

export type TrustedMalwareScanStatus = "CLEAN" | "INFECTED" | "ERROR";

export interface MalwareScanResultRecord {
  id: string;
  fileObjectId: string;
  scanner: string;
  status: MalwareScanStatus;
  signatureName: string | null;
  safeDiagnosticMetadata: Record<string, unknown> | null;
  scannedAt: Date | null;
  createdAt: Date;
}

export interface RegisterPendingFileInput {
  departmentId: string;
  uploadedByUserId: string;
  bucket: string;
  objectKey: string;
  originalFilename: string;
  /** Canonical MIME determined by trusted content inspection, never a client claim. */
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  visibility: FileVisibility;
}

export interface ReadFileMetadataInput {
  fileId: string;
  departmentId: string;
  includeDeleted?: boolean;
}
export interface RecordScanResultInput {
  fileId: string;
  departmentId: string;
  scanner: string;
  status: TrustedMalwareScanStatus;
  signatureName?: string | null;
  safeDiagnosticMetadata?: Record<string, unknown> | null;
  scannedAt?: Date | null;
}
export interface FileLifecycleTransitionInput {
  fileId: string;
  departmentId: string;
  expectedStatuses: FileObjectStatus[];
  targetStatus: FileObjectStatus;
  lifecycleTimestamp?: Date;
  requireLatestCleanScan?: boolean;
}
export interface FileArchiveRequest {
  fileId: string;
  reason?: string;
}
export interface FileQuarantineRequest {
  fileId: string;
  reason: string;
}
