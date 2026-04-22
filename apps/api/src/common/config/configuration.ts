import type { Env } from "./env.schema";

export function configuration(env: Env) {
  return {
    app: {
      nodeEnv: env.NODE_ENV,
      port: env.PORT,
      webUrl: env.WEB_APP_URL,
      apiUrl: env.API_APP_URL,
      publicVerificationUrl: env.PUBLIC_VERIFICATION_URL,
      allowedOrigins: env.ALLOWED_ORIGINS.split(",").map((value) => value.trim())
    },
    database: {
      url: env.DATABASE_URL,
      directUrl: env.DATABASE_DIRECT_URL
    },
    redis: {
      url: env.REDIS_URL,
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB
    },
    auth: {
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
    },
    email: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      fromName: env.SMTP_FROM_NAME,
      fromEmail: env.SMTP_FROM_EMAIL
    },
    storage: {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKey: env.S3_ACCESS_KEY,
      secretKey: env.S3_SECRET_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      publicBaseUrl: env.S3_PUBLIC_BASE_URL
    },
    malwareScanning: {
      mode: env.MALWARE_SCANNER_MODE,
      host: env.MALWARE_SCANNER_HOST,
      port: env.MALWARE_SCANNER_PORT,
      timeoutMs: env.MALWARE_SCANNER_TIMEOUT_MS
    },
    sentry: {
      dsn: env.SENTRY_DSN,
      environment: env.SENTRY_ENVIRONMENT,
      tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE
    },
    rateLimit: {
      ttlSeconds: env.RATE_LIMIT_TTL_SECONDS,
      maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
      authTtlSeconds: env.AUTH_RATE_LIMIT_TTL_SECONDS,
      authMaxRequests: env.AUTH_RATE_LIMIT_MAX_REQUESTS
    }
  };
}

