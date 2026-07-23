import {
  FALLBACK_FILENAME,
  sanitizeDisplayFilename,
} from "./filename-sanitizer";

const POSTGRES_INTEGER_MAX = 2_147_483_647;
const MAX_SIGNATURE_LENGTH = 255;
const MAX_DIAGNOSTIC_BYTES = 4_096;
const MAX_DIAGNOSTIC_DEPTH = 4;
const DISALLOWED_KEY =
  /(secret|token|password|credential|authorization|cookie|raw|content|payload|signed.?url|database.?url|environment|access.?key|file.?data|file.?body|file.?bytes)/i;
const PROTOTYPE_POLLUTION_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

export class FileStorageValidationError extends Error {}
export interface PendingMetadataCandidate {
  bucket: string;
  objectKey: string;
  originalFilename: string;
  canonicalMimeType: string;
  sizeBytes: number;
  checksumSha256: string;
}

export function validatePendingMetadata(input: PendingMetadataCandidate) {
  const originalFilename = sanitizeDisplayFilename(input.originalFilename);
  if (!input.originalFilename.trim() || originalFilename === FALLBACK_FILENAME)
    fail("A usable filename is required");
  if (
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes <= 0 ||
    input.sizeBytes > POSTGRES_INTEGER_MAX
  )
    fail("File size must be a positive PostgreSQL integer");
  if (!/^[a-fA-F0-9]{64}$/.test(input.checksumSha256))
    fail("A valid SHA-256 checksum is required");
  const bucket = input.bucket.trim();
  const mimeType = input.canonicalMimeType.trim();
  const objectKey = input.objectKey.trim();
  if (!bucket) fail("Storage bucket is required");
  if (!mimeType) fail("Canonical MIME is required");
  validateObjectKey(objectKey, originalFilename);
  return {
    bucket,
    objectKey,
    originalFilename,
    mimeType,
    sizeBytes: input.sizeBytes,
    checksumSha256: input.checksumSha256.toLowerCase(),
  };
}

export function validateTrustedScanInput(input: {
  scanner: string;
  signatureName?: string | null;
  scannedAt?: Date;
}) {
  const scanner = input.scanner.trim();
  if (!scanner) fail("Scanner name is required");
  const signatureName = input.signatureName?.trim() || null;
  if (signatureName && signatureName.length > MAX_SIGNATURE_LENGTH)
    fail("Signature name is too long");
  if (input.scannedAt && !Number.isFinite(input.scannedAt.getTime()))
    fail("Scan timestamp is invalid");
  return { scanner, signatureName, scannedAt: input.scannedAt };
}

export function normalizeSafeDiagnosticMetadata(
  value?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (value == null) return null;
  const normalized = normalizeJson(value, 0) as Record<string, unknown>;
  if (
    new TextEncoder().encode(JSON.stringify(normalized)).byteLength >
    MAX_DIAGNOSTIC_BYTES
  )
    fail("Diagnostic metadata is too large");
  return normalized;
}

function validateObjectKey(key: string, displayFilename: string) {
  if (
    !key ||
    key.startsWith("/") ||
    key.includes("\\") ||
    /[\u0000-\u001f\u007f-\u009f]/.test(key)
  )
    fail("Object key is unsafe");
  const segments = key.split("/");
  if (
    segments.some(
      (segment) =>
        !segment || !segment.trim() || segment === "." || segment === "..",
    )
  )
    fail("Object key is unsafe");
  const finalSegment = segments.at(-1) as string;
  const normalizedFinalSegment = finalSegment
    .normalize("NFKC")
    .trim()
    .toLowerCase();
  const normalizedDisplayFilename = displayFilename
    .normalize("NFKC")
    .trim()
    .toLowerCase();
  if (normalizedFinalSegment === normalizedDisplayFilename)
    fail("Object key must be opaque and independent from the filename");
}

function normalizeJson(value: unknown, depth: number): unknown {
  if (depth > MAX_DIAGNOSTIC_DEPTH)
    fail("Diagnostic metadata is too deeply nested");
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("Diagnostic metadata must be JSON-safe");
    return value;
  }
  if (Array.isArray(value))
    return value.map((item) => normalizeJson(item, depth + 1));
  if (typeof value !== "object") fail("Diagnostic metadata must be JSON-safe");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    fail("Diagnostic metadata must contain only plain JSON objects");
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (PROTOTYPE_POLLUTION_KEYS.has(key) || DISALLOWED_KEY.test(key))
      fail("Diagnostic metadata contains a disallowed key");
    output[key] = normalizeJson(item, depth + 1);
  }
  return output;
}

function fail(message: string): never {
  throw new FileStorageValidationError(message);
}
