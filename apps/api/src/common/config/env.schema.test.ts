import assert from "node:assert/strict";
import test from "node:test";

import { validateEnv } from "./env.schema";

const base = {
  DATABASE_URL: "postgresql://localhost/db",
  DATABASE_DIRECT_URL: "postgresql://localhost/db",
  REDIS_URL: "redis://localhost:6379",
  REDIS_HOST: "localhost",
  REDIS_PORT: "6379",
  JWT_ACCESS_SECRET: "a".repeat(32),
  JWT_ACCESS_TTL: "15m",
  JWT_ISSUER: "issuer",
  JWT_AUDIENCE: "audience",
  JWT_REFRESH_SECRET: "b".repeat(32),
  JWT_REFRESH_TTL: "30d",
  REFRESH_TOKEN_COOKIE_NAME: "rt",
  REFRESH_TOKEN_COOKIE_SECURE: "false",
  SMTP_HOST: "localhost",
  SMTP_PORT: "25",
  SMTP_SECURE: "false",
  SMTP_FROM_NAME: "Lexora",
  SMTP_FROM_EMAIL: "test@example.com",
  OTP_ISSUER: "Lexora",
  OTP_DIGITS: "6",
  OTP_TTL_SECONDS: "300",
  OTP_RATE_LIMIT_PER_WINDOW: "5",
  TWO_FACTOR_ENCRYPTION_KEY: "c".repeat(32),
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "lexora-files",
  S3_ACCESS_KEY: "key",
  S3_SECRET_KEY: "secret-key",
  S3_FORCE_PATH_STYLE: "true",
  S3_PUBLIC_BASE_URL: "http://localhost:9000",
  MALWARE_SCANNER_MODE: "clamav",
  MALWARE_SCANNER_TIMEOUT_MS: "1000",
  SENTRY_ENVIRONMENT: "test",
  SENTRY_TRACES_SAMPLE_RATE: "0",
  WEB_APP_URL: "http://localhost:3000",
  API_APP_URL: "http://localhost:4000",
  PUBLIC_VERIFICATION_URL: "http://localhost:3000/verify",
  ALLOWED_ORIGINS: "http://localhost:3000",
  RATE_LIMIT_TTL_SECONDS: "60",
  RATE_LIMIT_MAX_REQUESTS: "100",
  AUTH_RATE_LIMIT_TTL_SECONDS: "60",
  AUTH_RATE_LIMIT_MAX_REQUESTS: "10",
};

const parses = (scanner: Record<string, unknown>) =>
  validateEnv({ ...base, ...scanner });
const rejects = (scanner: Record<string, unknown>) =>
  assert.throws(() => parses(scanner));

test("accepts only the exact evaluation Unix socket path", () => {
  assert.equal(
    parses({
      MALWARE_SCANNER_TRANSPORT: "unix",
      MALWARE_SCANNER_SOCKET_PATH: "/run/lexora-clamav/clamd.sock",
    }).MALWARE_SCANNER_SOCKET_PATH,
    "/run/lexora-clamav/clamd.sock",
  );
  rejects({
    MALWARE_SCANNER_TRANSPORT: "unix",
    MALWARE_SCANNER_SOCKET_PATH: "clamd.sock",
  });
  rejects({
    MALWARE_SCANNER_TRANSPORT: "unix",
    MALWARE_SCANNER_SOCKET_PATH: "/tmp/clamd.sock",
  });
});

test("rejects incomplete and whitespace TCP configuration", () => {
  rejects({ MALWARE_SCANNER_TRANSPORT: "tcp", MALWARE_SCANNER_PORT: "3310" });
  rejects({
    MALWARE_SCANNER_TRANSPORT: "tcp",
    MALWARE_SCANNER_HOST: "scanner.invalid",
  });
  rejects({
    MALWARE_SCANNER_TRANSPORT: "tcp",
    MALWARE_SCANNER_HOST: "   ",
    MALWARE_SCANNER_PORT: "3310",
  });
  rejects({
    MALWARE_SCANNER_TRANSPORT: "tcp",
    MALWARE_SCANNER_HOST: " scanner.internal ",
    MALWARE_SCANNER_PORT: "3310",
  });
});

test("rejects Unix configuration mixed with whitespace or TCP values", () => {
  rejects({
    MALWARE_SCANNER_TRANSPORT: "unix",
    MALWARE_SCANNER_SOCKET_PATH: "/run/lexora-clamav/clamd.sock",
    MALWARE_SCANNER_HOST: "   ",
  });
  rejects({
    MALWARE_SCANNER_TRANSPORT: "unix",
    MALWARE_SCANNER_SOCKET_PATH: "/run/lexora-clamav/clamd.sock",
    MALWARE_SCANNER_PORT: "3310",
  });
  rejects({
    MALWARE_SCANNER_TRANSPORT: "unix",
    MALWARE_SCANNER_SOCKET_PATH: "   ",
  });
});

test("rejects mixed, missing, and unsupported ClamAV endpoint configuration", () => {
  rejects({});
  rejects({ MALWARE_SCANNER_TRANSPORT: "udp" });
  rejects({
    MALWARE_SCANNER_TRANSPORT: "unix",
    MALWARE_SCANNER_SOCKET_PATH: "/run/lexora-clamav/clamd.sock",
    MALWARE_SCANNER_HOST: "localhost",
    MALWARE_SCANNER_PORT: "3310",
  });
  rejects({
    MALWARE_SCANNER_TRANSPORT: "tcp",
    MALWARE_SCANNER_HOST: "scanner.invalid",
    MALWARE_SCANNER_PORT: "3310",
    MALWARE_SCANNER_SOCKET_PATH: "/run/lexora-clamav/clamd.sock",
  });
});

test("accepts explicit TCP and disabled mode without an endpoint", () => {
  const tcp = parses({
    MALWARE_SCANNER_TRANSPORT: "tcp",
    MALWARE_SCANNER_HOST: "scanner.invalid",
    MALWARE_SCANNER_PORT: "3310",
  });
  assert.equal(tcp.MALWARE_SCANNER_PORT, 3310);
  const disabled = validateEnv({ ...base, MALWARE_SCANNER_MODE: "disabled" });
  assert.equal(disabled.MALWARE_SCANNER_TRANSPORT, undefined);
});
