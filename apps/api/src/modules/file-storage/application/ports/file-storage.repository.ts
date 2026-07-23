import type {
  FileLifecycleTransitionInput,
  FileObjectMetadata,
  FileObjectPersistenceRecord,
  MalwareScanResultRecord,
  ReadFileMetadataInput,
  RecordScanResultInput,
  RegisterPendingFileInput,
} from "../../contracts/file-storage.contracts";

export interface FileStorageRepository {
  createPending(
    input: RegisterPendingFileInput,
  ): Promise<FileObjectPersistenceRecord>;
  findById(
    input: ReadFileMetadataInput,
  ): Promise<FileObjectPersistenceRecord | null>;
  findLatestScan(
    fileId: string,
    departmentId: string,
  ): Promise<MalwareScanResultRecord | null>;
  recordScanResult(
    input: RecordScanResultInput,
  ): Promise<MalwareScanResultRecord>;
  transitionStatus(
    input: FileLifecycleTransitionInput,
  ): Promise<FileObjectPersistenceRecord | null>;
  archive(
    fileId: string,
    departmentId: string,
    expectedStatuses: FileObjectMetadata["status"][],
  ): Promise<FileObjectPersistenceRecord | null>;
  markDeleted(
    fileId: string,
    departmentId: string,
  ): Promise<FileObjectPersistenceRecord | null>;
}
