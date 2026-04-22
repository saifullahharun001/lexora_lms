import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  DATABASE_DIRECT_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().positive(),
  REDIS_PASSWORD: z.string().optional().default(""),
  REDIS_DB: z.coerce.number().int().nonnegative().default(0),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().min(2),
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_TTL: z.string().min(2),
  REFRESH_TOKEN_COOKIE_NAME: z.string().min(1),
  REFRESH_TOKEN_COOKIE_SECURE: z
    .enum(["true", "false"])
    .transform((value) => value === "true"),
  REFRESH_TOKEN_COOKIE_DOMAIN: z.string().min(1),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_SECURE: z.enum(["true", "false"]).transform((value) => value === "true"),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASSWORD: z.string().optional().default(""),
  SMTP_FROM_NAME: z.string().min(1),
  SMTP_FROM_EMAIL: z.string().email(),
  OTP_ISSUER: z.string().min(1),
  OTP_DIGITS: z.coerce.number().int().min(4).max(8),
  OTP_TTL_SECONDS: z.coerce.number().int().positive(),
  OTP_RATE_LIMIT_PER_WINDOW: z.coerce.number().int().positive(),
  TWO_FACTOR_ENCRYPTION_KEY: z.string().min(16),
  S3_ENDPOINT: z.string().min(1),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).transform((value) => value === "true"),
  S3_PUBLIC_BASE_URL: z.string().min(1),
  MALWARE_SCANNER_MODE: z.enum(["disabled", "clamav"]).default("disabled"),
  MALWARE_SCANNER_HOST: z.string().min(1),
  MALWARE_SCANNER_PORT: z.coerce.number().int().positive(),
  MALWARE_SCANNER_TIMEOUT_MS: z.coerce.number().int().positive(),
  SENTRY_DSN: z.string().optional().default(""),
  SENTRY_ENVIRONMENT: z.string().min(1),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1),
  WEB_APP_URL: z.string().url(),
  API_APP_URL: z.string().url(),
  PUBLIC_VERIFICATION_URL: z.string().url(),
  ALLOWED_ORIGINS: z.string().min(1),
  RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive(),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive(),
  AUTH_RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive(),
  AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive()
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return envSchema.parse(config);
}

