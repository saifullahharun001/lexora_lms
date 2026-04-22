import { registerAs } from "@nestjs/config";

import { getValidatedEnv } from "../env.schema";

export const appConfig = registerAs("app", () => {
  const env = getValidatedEnv();

  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    webUrl: env.WEB_APP_URL,
    apiUrl: env.API_APP_URL,
    publicVerificationUrl: env.PUBLIC_VERIFICATION_URL,
    allowedOrigins: env.ALLOWED_ORIGINS.split(",").map((value) => value.trim())
  };
});

