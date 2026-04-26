import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";

import { PrismaModule } from "@/common/prisma/prisma.module";
import { RequestContextModule } from "@/common/request-context/request-context.module";

import { AuthGuard } from "./guards/auth.guard";
import { PolicyGuard } from "./guards/policy.guard";
import { AuthorizationAuditService } from "./services/authorization-audit.service";
import { AuthorizationService } from "./services/authorization.service";
import { PrincipalLoaderService } from "./services/principal-loader.service";

@Module({
  imports: [
    PrismaModule,
    RequestContextModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>("auth.accessSecret"),
        signOptions: {
          issuer: configService.getOrThrow<string>("auth.issuer"),
          audience: configService.getOrThrow<string>("auth.audience")
        }
      })
    })
  ],
  providers: [
    AuthorizationService,
    PrincipalLoaderService,
    AuthorizationAuditService,
    AuthGuard,
    PolicyGuard
  ],
  exports: [AuthorizationService, PrincipalLoaderService, AuthGuard, PolicyGuard]
})
export class AuthorizationModule {}
