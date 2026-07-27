export type FileContentPolicyErrorCode =
  | "EXTENSION_REQUIRED"
  | "EXTENSION_NOT_ALLOWED"
  | "EXTENSION_CONTENT_MISMATCH"
  | "MIME_NOT_ALLOWED"
  | "MIME_EXTENSION_MISMATCH"
  | "CLAIMED_MIME_MISMATCH";

export class FileContentPolicyError extends Error {
  constructor(readonly code: FileContentPolicyErrorCode) {
    super("File content is not accepted by policy");
  }
}

export interface TrustedFileContentPolicy {
  readonly policyId: string;
  readonly approvedMimeExtensions: Readonly<Record<string, readonly string[]>>;
}

export const ACADEMIC_DOCUMENT_CONTENT_POLICY: TrustedFileContentPolicy =
  Object.freeze({
    policyId: "academic-documents-v1",
    approvedMimeExtensions: Object.freeze({
      "application/pdf": Object.freeze(["pdf"]),
      "image/png": Object.freeze(["png"]),
      "image/jpeg": Object.freeze(["jpg", "jpeg"]),
    }),
  });

export function enforceTrustedFileContentPolicy(input: {
  readonly filename: string;
  readonly claimedMimeType?: string | null;
  readonly detectedCanonicalMimeType: string;
  readonly detectedExtension: string;
  readonly policy: TrustedFileContentPolicy;
}): {
  canonicalMimeType: string;
  recognizedExtension: string;
  policyId: string;
} {
  const finalName = input.filename.split(/[\\/]/).at(-1) ?? "";
  const dot = finalName.lastIndexOf(".");
  if (dot <= 0 || dot === finalName.length - 1) fail("EXTENSION_REQUIRED");
  const filenameExtension = finalName.slice(dot + 1).toLowerCase();
  const mime = input.detectedCanonicalMimeType.trim().toLowerCase();
  const detectedExtension = input.detectedExtension.trim().toLowerCase();
  const approvedEntries = Object.entries(input.policy.approvedMimeExtensions);
  if (
    !approvedEntries.some(([, extensions]) =>
      extensions.includes(filenameExtension),
    )
  )
    fail("EXTENSION_NOT_ALLOWED");
  const approvedExtensions = input.policy.approvedMimeExtensions[mime];
  if (!approvedExtensions) fail("MIME_NOT_ALLOWED");
  if (!approvedExtensions.includes(detectedExtension))
    fail("MIME_EXTENSION_MISMATCH");
  if (!approvedExtensions.includes(filenameExtension))
    fail("EXTENSION_CONTENT_MISMATCH");
  const claim = input.claimedMimeType?.trim().toLowerCase();
  if (claim && claim !== "application/octet-stream" && claim !== mime)
    fail("CLAIMED_MIME_MISMATCH");
  return {
    canonicalMimeType: mime,
    recognizedExtension: detectedExtension,
    policyId: input.policy.policyId,
  };
}

function fail(code: FileContentPolicyErrorCode): never {
  throw new FileContentPolicyError(code);
}
