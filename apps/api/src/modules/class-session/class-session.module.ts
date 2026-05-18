import { Module } from "@nestjs/common";

import { PrismaModule } from "@/common/prisma/prisma.module";
import { RequestContextModule } from "@/common/request-context/request-context.module";
import { AuthorizationModule } from "@/modules/authorization/authorization.module";
import { PlatformModule } from "@/platform/platform.module";
import { ClassSessionService } from "./application/services/class-session.service";
import { CLASS_SESSION_REPOSITORY } from "./domain/class-session.constants";
import { PrismaClassSessionRepository } from "./infrastructure/repositories/prisma-class-session.repository";
import { ClassSessionsController } from "./presentation/http/class-sessions.controller";

@Module({
  imports: [
    PlatformModule,
    AuthorizationModule,
    PrismaModule,
    RequestContextModule
  ],
  controllers: [
    ClassSessionsController
  ],
  providers: [
    ClassSessionService,
    {
      provide: CLASS_SESSION_REPOSITORY,
      useClass: PrismaClassSessionRepository
    }
  ]
})
export class ClassSessionModule {}
