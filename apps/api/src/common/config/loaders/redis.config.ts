import { registerAs } from "@nestjs/config";

import { getValidatedEnv } from "../env.schema";

export const redisConfig = registerAs("redis", () => {
  const env = getValidatedEnv();

  return {
    url: env.REDIS_URL,
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    db: env.REDIS_DB
  };
});

