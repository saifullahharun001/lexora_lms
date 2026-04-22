import { Module } from "@nestjs/common";
import { ConfigModule, type ConfigType } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";

import {
  appConfig,
  authConfig,
  databaseConfig,
  emailConfig,
  rateLimitConfig,
  redisConfig,
  storageConfig
} from "../common/config/loaders";
import { validateEnv } from "../common/config/env.schema";
import { ApiExceptionFilter } from "../common/http/api-exception.filter";
import { PrismaModule } from "../common/prisma/prisma.module";
import { RedisModule } from "../common/redis/redis.module";
import { RequestContextModule } from "../common/request-context/request-context.module";
import { DepartmentContextResolver } from "../common/department-context/department-context.resolver";
import { AuthorizationGuard } from "../common/authorization/authorization.guard";
import { AuthorizationPolicyService } from "../common/authorization/authorization-policy.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [".env"],
      validate: validateEnv,
      load: [
        appConfig,
        authConfig,
        databaseConfig,
        emailConfig,
        redisConfig,
        storageConfig,
        rateLimitConfig
      ]
    }),
    ThrottlerModule.forRootAsync({
      inject: [rateLimitConfig.KEY],
      useFactory: (rateLimit: ConfigType<typeof rateLimitConfig>) => {
        return [
          {
            ttl: rateLimit.ttlSeconds * 1000,
            limit: rateLimit.maxRequests
          }
        ];
      }
    }),
    PrismaModule,
    RedisModule,
    RequestContextModule
  ],
  providers: [
    ApiExceptionFilter,
    DepartmentContextResolver,
    AuthorizationPolicyService,
    AuthorizationGuard
  ],
  exports: [ApiExceptionFilter, DepartmentContextResolver, AuthorizationGuard]
})
export class PlatformModule {}
