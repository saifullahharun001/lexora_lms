import { Module } from "@nestjs/common";

import { PrismaModule } from "@/common/prisma/prisma.module";
import { RequestContextModule } from "@/common/request-context/request-context.module";
import { AuthorizationModule } from "@/modules/authorization/authorization.module";
import { NotificationModule } from "@/modules/notification/notification.module";
import { PlatformModule } from "@/platform/platform.module";
import { NoticeService } from "./application/services/notice.service";
import { NOTICE_REPOSITORY } from "./domain/notice.constants";
import { PrismaNoticeRepository } from "./infrastructure/repositories/prisma-notice.repository";
import { NoticesController } from "./presentation/http/notices.controller";

@Module({
  imports: [
    PlatformModule,
    AuthorizationModule,
    NotificationModule,
    PrismaModule,
    RequestContextModule
  ],
  controllers: [
    NoticesController
  ],
  providers: [
    NoticeService,
    {
      provide: NOTICE_REPOSITORY,
      useClass: PrismaNoticeRepository
    }
  ],
  exports: [
    NoticeService
  ]
})
export class NoticeModule {}
