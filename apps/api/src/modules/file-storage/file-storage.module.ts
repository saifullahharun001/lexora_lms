import { S3Client } from "@aws-sdk/client-s3";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { malwareScanWorkerConfig } from "@/common/config/loaders/malware-scan-worker.config";
import { storageConfig } from "@/common/config/loaders/storage.config";
import { PrismaModule } from "@/common/prisma/prisma.module";
import { RequestContextModule } from "@/common/request-context/request-context.module";

import { FileMalwareScanJobProcessor } from "./application/services/file-malware-scan-job.processor";
import { FileMalwareScanJobRuntime } from "./application/services/file-malware-scan-job.runtime";
import { FileMalwareScanWorkerHealth } from "./application/services/file-malware-scan-worker.health";
import { FileMalwareScanWorkerRunner } from "./application/services/file-malware-scan-worker.runner";
import { FileStorageService } from "./application/services/file-storage.service";
import {
  FILE_CONTENT_INSPECTOR_PORT,
  FILE_MALWARE_SCAN_JOB_REPOSITORY,
  FILE_MALWARE_SCAN_WORKER_DEPARTMENT_SCOPE_PROVIDER,
  FILE_STORAGE_REPOSITORY,
  MALWARE_SCANNER_PORT,
  OBJECT_STORAGE_PORT,
} from "./domain/file-storage.constants";
import { FileTypeContentInspectorAdapter } from "./infrastructure/content-inspection/file-type-content-inspector.adapter";
import { ClamAvMalwareScannerAdapter } from "./infrastructure/malware-scanning/clamav-malware-scanner.adapter";
import {
  buildS3ClientConfig,
  createS3CommandClient,
  createS3UrlSigner,
  RAW_S3_CLIENT,
  S3_COMMAND_CLIENT,
  S3_URL_SIGNER,
  S3ObjectStorageAdapter,
} from "./infrastructure/object-storage/s3-object-storage.adapter";
import { PrismaFileMalwareScanJobRepository } from "./infrastructure/repositories/prisma-file-malware-scan-job.repository";
import { PrismaFileMalwareScanWorkerDepartmentScopeProvider } from "./infrastructure/repositories/prisma-file-malware-scan-worker-department-scope.provider";
import { PrismaFileStorageRepository } from "./infrastructure/repositories/prisma-file-storage.repository";

@Module({
  imports: [
    PrismaModule,
    RequestContextModule,
    ConfigModule.forFeature(storageConfig),
    ConfigModule.forFeature(malwareScanWorkerConfig),
  ],
  providers: [
    FileStorageService,
    FileMalwareScanJobProcessor,
    FileMalwareScanJobRuntime,
    FileMalwareScanWorkerHealth,
    FileMalwareScanWorkerRunner,
    {
      provide: FILE_MALWARE_SCAN_JOB_REPOSITORY,
      useClass: PrismaFileMalwareScanJobRepository,
    },
    {
      provide: FILE_MALWARE_SCAN_WORKER_DEPARTMENT_SCOPE_PROVIDER,
      useClass: PrismaFileMalwareScanWorkerDepartmentScopeProvider,
    },
    { provide: FILE_STORAGE_REPOSITORY, useClass: PrismaFileStorageRepository },
    {
      provide: RAW_S3_CLIENT,
      inject: [storageConfig.KEY],
      useFactory: (config: ReturnType<typeof storageConfig>) =>
        new S3Client(buildS3ClientConfig(config)),
    },
    {
      provide: S3_COMMAND_CLIENT,
      inject: [RAW_S3_CLIENT],
      useFactory: createS3CommandClient,
    },
    {
      provide: S3_URL_SIGNER,
      inject: [RAW_S3_CLIENT],
      useFactory: createS3UrlSigner,
    },
    S3ObjectStorageAdapter,
    FileTypeContentInspectorAdapter,
    ClamAvMalwareScannerAdapter,
    {
      provide: OBJECT_STORAGE_PORT,
      useExisting: S3ObjectStorageAdapter,
    },
    {
      provide: FILE_CONTENT_INSPECTOR_PORT,
      useExisting: FileTypeContentInspectorAdapter,
    },
    {
      provide: MALWARE_SCANNER_PORT,
      useExisting: ClamAvMalwareScannerAdapter,
    },
  ],
  exports: [FileStorageService, FileMalwareScanWorkerHealth],
})
export class FileStorageModule {}
