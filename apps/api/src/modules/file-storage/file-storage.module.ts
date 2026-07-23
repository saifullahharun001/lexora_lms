import { Module } from "@nestjs/common";
import { PrismaModule } from "@/common/prisma/prisma.module";
import { RequestContextModule } from "@/common/request-context/request-context.module";
import { FileStorageService } from "./application/services/file-storage.service";
import { FILE_STORAGE_REPOSITORY } from "./domain/file-storage.constants";
import { PrismaFileStorageRepository } from "./infrastructure/repositories/prisma-file-storage.repository";

@Module({
  imports: [PrismaModule, RequestContextModule],
  providers: [
    FileStorageService,
    { provide: FILE_STORAGE_REPOSITORY, useClass: PrismaFileStorageRepository },
  ],
  exports: [FileStorageService],
})
export class FileStorageModule {}
