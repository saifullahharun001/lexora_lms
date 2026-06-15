import { Module } from "@nestjs/common";

import { PrismaModule } from "@/common/prisma/prisma.module";
import { RequestContextModule } from "@/common/request-context/request-context.module";
import { AuthorizationModule } from "@/modules/authorization/authorization.module";
import { PasswordHasherService } from "@/modules/identity-access/infrastructure/password-hasher.service";
import { PlatformModule } from "@/platform/platform.module";

import { UserManagementService } from "./application/services/user-management.service";
import { UsersController } from "./presentation/http/users.controller";

@Module({
  imports: [
    PlatformModule,
    AuthorizationModule,
    PrismaModule,
    RequestContextModule
  ],
  controllers: [UsersController],
  providers: [PasswordHasherService, UserManagementService]
})
export class UserManagementModule {}
