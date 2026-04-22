import { registerAs } from "@nestjs/config";

import { getValidatedEnv } from "../env.schema";

export const databaseConfig = registerAs("database", () => {
  const env = getValidatedEnv();

  return {
    url: env.DATABASE_URL,
    directUrl: env.DATABASE_DIRECT_URL
  };
});

