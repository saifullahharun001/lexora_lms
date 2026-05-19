import { Module } from "@nestjs/common";

import { PrismaModule } from "@/common/prisma/prisma.module";
import { RequestContextModule } from "@/common/request-context/request-context.module";
import { AuthorizationModule } from "@/modules/authorization/authorization.module";
import { PlatformModule } from "@/platform/platform.module";
import { NotificationService } from "./application/services/notification.service";
import { NOTIFICATION_REPOSITORY } from "./domain/notification.constants";
import { PrismaNotificationRepository } from "./infrastructure/repositories/prisma-notification.repository";
import { NotificationPreferencesController } from "./presentation/http/notification-preferences.controller";
import { NotificationTemplatesController } from "./presentation/http/notification-templates.controller";
import { NotificationsController } from "./presentation/http/notifications.controller";

@Module({
  imports: [
    PlatformModule,
    AuthorizationModule,
    PrismaModule,
    RequestContextModule
  ],
  controllers: [
    NotificationsController,
    NotificationTemplatesController,
    NotificationPreferencesController
  ],
  providers: [
    NotificationService,
    {
      provide: NOTIFICATION_REPOSITORY,
      useClass: PrismaNotificationRepository
    }
  ],
  exports: [
    NotificationService
  ]
})
export class NotificationModule {}
