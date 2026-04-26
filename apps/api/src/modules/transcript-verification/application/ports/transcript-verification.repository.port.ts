import type {
  TranscriptCourseLine,
  TranscriptRecord,
  TranscriptRevocationRecord,
  TranscriptSealMetadata,
  TranscriptTermSummary,
  TranscriptVerificationToken,
  TranscriptVersion
} from "../../contracts/transcript-verification.contracts";

export interface TranscriptVerificationRepositoryPort {
  findTranscriptRecordById(id: string): Promise<TranscriptRecord | null>;
  findTranscriptRecordByStudent(
    departmentId: string,
    studentUserId: string
  ): Promise<TranscriptRecord | null>;
  saveTranscriptRecord(record: TranscriptRecord): Promise<TranscriptRecord>;
  findTranscriptVersionById(id: string): Promise<TranscriptVersion | null>;
  findTranscriptVersionByNumber(
    transcriptRecordId: string,
    versionNumber: number
  ): Promise<TranscriptVersion | null>;
  saveTranscriptVersion(record: TranscriptVersion): Promise<TranscriptVersion>;
  replaceTranscriptTermSummaries(
    transcriptVersionId: string,
    summaries: TranscriptTermSummary[]
  ): Promise<TranscriptTermSummary[]>;
  replaceTranscriptCourseLines(
    transcriptVersionId: string,
    lines: TranscriptCourseLine[]
  ): Promise<TranscriptCourseLine[]>;
  saveTranscriptVerificationToken(
    record: TranscriptVerificationToken
  ): Promise<TranscriptVerificationToken>;
  findTranscriptVerificationTokenByPublicCode(
    publicCode: string
  ): Promise<TranscriptVerificationToken | null>;
  saveTranscriptRevocationRecord(
    record: TranscriptRevocationRecord
  ): Promise<TranscriptRevocationRecord>;
  saveTranscriptSealMetadata(
    record: TranscriptSealMetadata
  ): Promise<TranscriptSealMetadata>;
}
