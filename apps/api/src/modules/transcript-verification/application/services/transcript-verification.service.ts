import type {
  TranscriptRecord,
  TranscriptRevocationRecord,
  TranscriptVerificationToken,
  TranscriptVersion
} from "../../contracts/transcript-verification.contracts";

export interface TranscriptVerificationService {
  generateTranscriptRecord(input: TranscriptRecord): Promise<TranscriptRecord>;
  generateTranscriptVersion(input: TranscriptVersion): Promise<TranscriptVersion>;
  issueTranscriptVersion(input: TranscriptVersion): Promise<TranscriptVersion>;
  issueVerificationToken(
    input: TranscriptVerificationToken
  ): Promise<TranscriptVerificationToken>;
  verifyPublicTranscript(
    publicCode: string
  ): Promise<TranscriptVerificationToken | null>;
  revokeTranscript(
    input: TranscriptRevocationRecord
  ): Promise<TranscriptRevocationRecord>;
  viewOwnTranscript(
    transcriptRecordId: string,
    studentUserId: string
  ): Promise<TranscriptRecord | null>;
}
