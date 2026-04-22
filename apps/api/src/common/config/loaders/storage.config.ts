import { registerAs } from "@nestjs/config";

import { getValidatedEnv } from "../env.schema";

export const storageConfig = registerAs("storage", () => {
  const env = getValidatedEnv();

  return {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKey: env.S3_ACCESS_KEY,
    secretKey: env.S3_SECRET_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    publicBaseUrl: env.S3_PUBLIC_BASE_URL,
    malwareScanning: {
      mode: env.MALWARE_SCANNER_MODE,
      host: env.MALWARE_SCANNER_HOST,
      port: env.MALWARE_SCANNER_PORT,
      timeoutMs: env.MALWARE_SCANNER_TIMEOUT_MS
    }
  };
});

