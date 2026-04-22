import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";

import { configuration } from "../common/config/configuration";
import { validateEnv } from "../common/config/env.schema";
import { DatabaseModule } from "../common/database/database.module";
import { RedisModule } from "../common/redis/redis.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [".env"],
      validate: validateEnv,
      load: [
        () => {
          const env = validateEnv(process.env);
          return configuration(env);
        }
      ]
    }),
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        const env = validateEnv(process.env);
        return [
          {
            ttl: env.RATE_LIMIT_TTL_SECONDS * 1000,
            limit: env.RATE_LIMIT_MAX_REQUESTS
          }
        ];
      }
    }),
    DatabaseModule,
    RedisModule
  ]
})
export class PlatformModule {}
