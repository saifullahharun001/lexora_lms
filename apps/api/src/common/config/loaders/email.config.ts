import { registerAs } from "@nestjs/config";

import { getValidatedEnv } from "../env.schema";

export const emailConfig = registerAs("email", () => {
  const env = getValidatedEnv();

  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    fromName: env.SMTP_FROM_NAME,
    fromEmail: env.SMTP_FROM_EMAIL
  };
});

