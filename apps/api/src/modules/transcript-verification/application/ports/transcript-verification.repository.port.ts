import type {
  Prisma,
  TranscriptRecord,
  TranscriptRevocationRecord,
  TranscriptSealMetadata,
  TranscriptVerificationToken,
  TranscriptVersion
} from "@prisma/client";

export type TranscriptRecordDetails = Prisma.TranscriptRecordGetPayload<{
  include: {
    versions: {
      orderBy: { versionNumber: "desc" };
      include: {
        termSummaries: {
          orderBy: { sortOrder: "asc" };
          include: { courseLines: { orderBy: { sortOrder: "asc" } } };
        };
        sealMetadata: true;
      };
    };
    revocationRecords: { orderBy: { requestedAt: "desc" } };
  };
}>;

export type TranscriptVersionDetails = Prisma.TranscriptVersionGetPayload<{
  include: {
    transcriptRecord: true;
    termSummaries: {
      orderBy: { sortOrder: "asc" };
      include: { courseLines: { orderBy: { sortOrder: "asc" } } };
    };
    verificationTokens: true;
    sealMetadata: true;
  };
}>;

export type TranscriptSealDetails = Prisma.TranscriptSealMetadataGetPayload<{
  include: { transcriptVersion: { include: { transcriptRecord: true } } };
}>;

export type PublicVerificationTokenDetails = Prisma.TranscriptVerificationTokenGetPayload<{
  include: {
    transcriptVersion: {
      include: {
        transcriptRecord: true;
        sealMetadata: true;
      };
    };
  };
}>;

export interface CreateTranscriptSnapshotInput {
  departmentId: string;
  studentUserId: string;
  transcriptNumber: string;
  generatedByUserId: string;
  sourceCgpaRecordId?: string;
  studentSnapshotJson: Prisma.InputJsonValue;
  programSnapshotJson?: Prisma.InputJsonValue;
  departmentSnapshotJson?: Prisma.InputJsonValue;
  printStructureJson?: Prisma.InputJsonValue;
  cumulativeAttemptedCredits?: string;
  cumulativeEarnedCredits?: string;
  cgpaSnapshot?: string;
  academicStandingStatus?: string;
  completionStatus?: string;
  graduationStatus?: string;
  termSummaries: Array<{
    academicTermId?: string;
    sourceGpaRecordId?: string;
    sortOrder: number;
    termCodeSnapshot: string;
    termNameSnapshot: string;
    attemptedCredits?: string;
    earnedCredits?: string;
    qualityPoints?: string;
    termGpaSnapshot?: string;
    cumulativeCgpaSnapshot?: string;
    academicStandingStatus?: string;
    courseLines: Array<{
      resultRecordId?: string;
      courseOfferingId?: string;
      sortOrder: number;
      courseCodeSnapshot: string;
      courseTitleSnapshot: string;
      creditHoursSnapshot: string;
      normalizedPercentage?: string;
      letterGrade?: string;
      gradePoint?: string;
      qualityPoints?: string;
      isCountedInGpa: boolean;
      completionStatus?: string;
      remarks?: string;
    }>;
  }>;
}

export interface ListTranscriptFilters {
  departmentId: string;
  studentUserId?: string;
  status?: string;
}

export interface TranscriptVerificationRepositoryPort {
  listTranscriptRecords(filters: ListTranscriptFilters): Promise<TranscriptRecord[]>;
  findTranscriptRecordById(
    departmentId: string,
    id: string
  ): Promise<TranscriptRecordDetails | null>;
  createTranscriptSnapshot(
    input: CreateTranscriptSnapshotInput
  ): Promise<TranscriptRecordDetails>;
  listTranscriptVersions(
    departmentId: string,
    transcriptRecordId: string
  ): Promise<TranscriptVersionDetails[]>;
  findTranscriptVersionById(
    departmentId: string,
    id: string
  ): Promise<TranscriptVersionDetails | null>;
  issueTranscript(
    departmentId: string,
    transcriptRecordId: string,
    actorId: string
  ): Promise<TranscriptRecordDetails | null>;
  revokeTranscript(input: {
    departmentId: string;
    transcriptRecordId: string;
    actorId: string;
    reason: string;
    appliesToAllTokens: boolean;
  }): Promise<TranscriptRevocationRecord | null>;
  createVerificationToken(input: {
    departmentId: string;
    transcriptRecordId: string;
    actorId: string;
    publicCodeHash: string;
    publicSummaryJson: Prisma.InputJsonValue;
    expiresAt?: Date;
  }): Promise<TranscriptVerificationToken | null>;
  findPublicVerificationToken(
    publicCodeHash: string
  ): Promise<PublicVerificationTokenDetails | null>;
  markVerificationTokenExpired(id: string): Promise<TranscriptVerificationToken | null>;
  recordPublicVerification(id: string): Promise<TranscriptVerificationToken | null>;
  listSeals(departmentId: string): Promise<TranscriptSealDetails[]>;
  createSeal(input: {
    departmentId: string;
    transcriptVersionId: string;
    sealType: string;
    signerDisplayName?: string;
    signerTitle?: string;
    signatureAlgorithm?: string;
    signatureReference?: string;
    sealReference?: string;
    payloadDigest?: string;
    metadataJson?: Prisma.InputJsonValue;
    signedAt?: Date;
  }): Promise<TranscriptSealDetails | null>;
  updateSeal(
    departmentId: string,
    id: string,
    input: Partial<{
      sealType: string;
      signerDisplayName: string | null;
      signerTitle: string | null;
      signatureAlgorithm: string | null;
      signatureReference: string | null;
      sealReference: string | null;
      payloadDigest: string | null;
      metadataJson: Prisma.InputJsonValue;
      signedAt: Date | null;
    }>
  ): Promise<TranscriptSealDetails | null>;
}
