import { S3Client } from "@aws-sdk/client-s3";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { storageConfig } from "@/common/config/loaders/storage.config";
import { PrismaModule } from "@/common/prisma/prisma.module";
import { RequestContextModule } from "@/common/request-context/request-context.module";

import { FileStorageService } from "./application/services/file-storage.service";
import {
  FILE_STORAGE_REPOSITORY,
  OBJECT_STORAGE_PORT,
} from "./domain/file-storage.constants";
import {
  buildS3ClientConfig,
  createS3CommandClient,
  createS3UrlSigner,
  RAW_S3_CLIENT,
  S3_COMMAND_CLIENT,
  S3_URL_SIGNER,
  S3ObjectStorageAdapter,
} from "./infrastructure/object-storage/s3-object-storage.adapter";
import { PrismaFileStorageRepository } from "./infrastructure/repositories/prisma-file-storage.repository";

@Module({
  imports: [
    PrismaModule,
    RequestContextModule,
    ConfigModule.forFeature(storageConfig),
  ],
  providers: [
    FileStorageService,
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
    {
      provide: OBJECT_STORAGE_PORT,
      useExisting: S3ObjectStorageAdapter,
    },
  ],
  exports: [FileStorageService],
})
export class FileStorageModule {}
