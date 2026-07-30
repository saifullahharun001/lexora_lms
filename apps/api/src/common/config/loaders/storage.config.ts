import { registerAs } from "@nestjs/config";

import { getValidatedEnv } from "../env.schema";

export type ClamAvEndpoint =
  | { kind: "unix"; path: string }
  | { kind: "tcp"; host: string; port: number };

export const storageConfig = registerAs("storage", () => {
  const env = getValidatedEnv();
  const endpoint: ClamAvEndpoint | null =
    env.MALWARE_SCANNER_MODE !== "clamav"
      ? null
      : env.MALWARE_SCANNER_TRANSPORT === "unix"
        ? { kind: "unix", path: env.MALWARE_SCANNER_SOCKET_PATH! }
        : {
            kind: "tcp",
            host: env.MALWARE_SCANNER_HOST!,
            port: env.MALWARE_SCANNER_PORT!,
          };

  return {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKey: env.S3_ACCESS_KEY,
    secretKey: env.S3_SECRET_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    publicBaseUrl: env.S3_PUBLIC_BASE_URL,
    contentInspectionTimeoutMs: env.FILE_CONTENT_INSPECTION_TIMEOUT_MS,
    malwareScanning: {
      mode: env.MALWARE_SCANNER_MODE,
      endpoint,
      timeoutMs: env.MALWARE_SCANNER_TIMEOUT_MS,
    },
  };
});
