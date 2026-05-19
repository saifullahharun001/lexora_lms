import { Module } from "@nestjs/common";

import { PrismaModule } from "@/common/prisma/prisma.module";
import { RequestContextModule } from "@/common/request-context/request-context.module";
import { AuthorizationModule } from "@/modules/authorization/authorization.module";
import { PlatformModule } from "@/platform/platform.module";
import { EligibilityService } from "./application/services/eligibility.service";
import { ELIGIBILITY_REPOSITORY } from "./domain/eligibility.constants";
import { PrismaEligibilityRepository } from "./infrastructure/repositories/prisma-eligibility.repository";
import { EligibilityController } from "./presentation/http/eligibility.controller";

@Module({
  imports: [
    PlatformModule,
    AuthorizationModule,
    PrismaModule,
    RequestContextModule
  ],
  controllers: [
    EligibilityController
  ],
  providers: [
    EligibilityService,
    {
      provide: ELIGIBILITY_REPOSITORY,
      useClass: PrismaEligibilityRepository
    }
  ]
})
export class EligibilityModule {}

