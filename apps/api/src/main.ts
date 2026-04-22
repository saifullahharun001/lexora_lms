import cookieParser from "cookie-parser";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";

import { AppModule } from "./app.module";
import { validateEnv } from "./common/config/env.schema";

async function bootstrap() {
  const env = validateEnv(process.env);
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: env.ALLOWED_ORIGINS.split(",").map((value) => value.trim()),
      credentials: true
    }
  });

  app.setGlobalPrefix("api");
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: "1"
  });
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  await app.listen(env.PORT);
}

bootstrap();
