import { registerAs } from "@nestjs/config";

import { getValidatedEnv } from "../env.schema";

export const rateLimitConfig = registerAs("rateLimit", () => {
  const env = getValidatedEnv();

  return {
    ttlSeconds: env.RATE_LIMIT_TTL_SECONDS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    authTtlSeconds: env.AUTH_RATE_LIMIT_TTL_SECONDS,
    authMaxRequests: env.AUTH_RATE_LIMIT_MAX_REQUESTS
  };
});

