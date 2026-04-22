import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";

@Module({
  imports: [
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
  ]
})
export class IdentityAccessModule {}
