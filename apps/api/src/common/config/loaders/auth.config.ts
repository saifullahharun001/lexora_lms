import { registerAs } from "@nestjs/config";

import { getValidatedEnv } from "../env.schema";

export const authConfig = registerAs("auth", () => {
  const env = getValidatedEnv();

  return {
    accessSecret: env.JWT_ACCESS_SECRET,
    accessTtl: env.JWT_ACCESS_TTL,
    refreshSecret: env.JWT_REFRESH_SECRET,
    refreshTtl: env.JWT_REFRESH_TTL,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    refreshCookieName: env.REFRESH_TOKEN_COOKIE_NAME,
    refreshCookieSecure: env.REFRESH_TOKEN_COOKIE_SECURE,
    refreshCookieDomain: env.REFRESH_TOKEN_COOKIE_DOMAIN,
    otpIssuer: env.OTP_ISSUER,
    otpDigits: env.OTP_DIGITS,
    otpTtlSeconds: env.OTP_TTL_SECONDS,
    otpRateLimitPerWindow: env.OTP_RATE_LIMIT_PER_WINDOW
  };
});

