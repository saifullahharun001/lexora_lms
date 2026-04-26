import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "@/common/prisma/prisma.module";
import { RequestContextModule } from "@/common/request-context/request-context.module";
import { AuthController } from "./presentation/http/auth.controller";
import { IdentityAccessService } from "./application/services/identity-access.service";
import { PrismaIdentityAccessRepository } from "./infrastructure/repositories/prisma-identity-access.repository";
import { PasswordHasherService } from "./infrastructure/password-hasher.service";
import { TokenHasherService } from "./infrastructure/token-hasher.service";
import { IdentityAccessAuditWriter } from "./infrastructure/identity-access.audit-writer";

@Module({
  imports: [
    ConfigModule,
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
  controllers: [AuthController],
  providers: [
    PasswordHasherService,
    TokenHasherService,
    PrismaIdentityAccessRepository,
    IdentityAccessAuditWriter,
    {
      provide: "IdentityAccessRepositoryPort",
      useExisting: PrismaIdentityAccessRepository
    },
    {
      provide: "AuditWriter",
      useExisting: IdentityAccessAuditWriter
    },
    IdentityAccessService
  ]
})
export class IdentityAccessModule {}
