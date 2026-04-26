import { z } from "zod";

const durationPattern = /^\d+[smhd]$/;
const postgresUrlPattern = /^postgres(ql)?:\/\//;
const redisUrlPattern = /^redis(s)?:\/\//;
const bucketPattern = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().regex(postgresUrlPattern, "DATABASE_URL must be a PostgreSQL URL"),
  DATABASE_DIRECT_URL: z
    .string()
    .regex(postgresUrlPattern, "DATABASE_DIRECT_URL must be a PostgreSQL URL"),
  REDIS_URL: z.string().regex(redisUrlPattern, "REDIS_URL must be a Redis URL"),
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().positive(),
  REDIS_PASSWORD: z.string().optional().default(""),
  REDIS_DB: z.coerce.number().int().nonnegative().default(0),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().regex(durationPattern, "JWT_ACCESS_TTL must look like 15m"),
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_TTL: z.string().regex(durationPattern, "JWT_REFRESH_TTL must look like 30d"),
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
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().regex(bucketPattern, "S3_BUCKET must be a valid bucket name"),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(8),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).transform((value) => value === "true"),
  S3_PUBLIC_BASE_URL: z.string().url(),
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
  AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive(),
  UNIVERSITY_EMAIL_DOMAINS: z.string().optional().default(""),
  AUTH_LOCKOUT_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(5),
  AUTH_LOCKOUT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  AUTH_LOCKOUT_DURATION_MINUTES: z.coerce.number().int().positive().default(15)
}).superRefine((env, ctx) => {
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["JWT_REFRESH_SECRET"],
      message: "JWT refresh secret must differ from access secret"
    });
  }

  if (env.RATE_LIMIT_MAX_REQUESTS < env.AUTH_RATE_LIMIT_MAX_REQUESTS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["AUTH_RATE_LIMIT_MAX_REQUESTS"],
      message: "Auth rate limit must not exceed the general rate limit"
    });
  }
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return envSchema.parse(config);
}

let cachedEnv: Env | null = null;

export function getValidatedEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = validateEnv(process.env);
  }

  return cachedEnv;
}
