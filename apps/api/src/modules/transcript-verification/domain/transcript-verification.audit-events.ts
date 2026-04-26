export const TRANSCRIPT_VERIFICATION_AUDIT_EVENTS = {
  TRANSCRIPT_GENERATED: "transcript-verification.transcript.generated",
  TRANSCRIPT_VERSION_GENERATED: "transcript-verification.transcript-version.generated",
  TRANSCRIPT_ISSUED: "transcript-verification.transcript.issued",
  VERIFICATION_TOKEN_ISSUED: "transcript-verification.verification-token.issued",
  VERIFICATION_PUBLIC_ACCESSED: "transcript-verification.verification.public-accessed",
  VERIFICATION_TOKEN_EXPIRED: "transcript-verification.verification-token.expired",
  TRANSCRIPT_REVOKED: "transcript-verification.transcript.revoked"
} as const;
