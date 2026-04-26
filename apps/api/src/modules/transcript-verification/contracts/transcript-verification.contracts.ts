export interface TranscriptRecord {
  id: string;
  departmentId: string;
  studentUserId: string;
  transcriptNumber: string;
  status: string;
  latestVersionNumber: number;
  generatedByUserId?: string | null;
  issuedAt?: Date | null;
  revokedAt?: Date | null;
}

export interface TranscriptVersion {
  id: string;
  departmentId: string;
  transcriptRecordId: string;
  sourceCgpaRecordId?: string | null;
  versionNumber: number;
  status: string;
  generatedByUserId?: string | null;
  issuedByUserId?: string | null;
  studentSnapshotJson: Record<string, unknown>;
  programSnapshotJson?: Record<string, unknown> | null;
  departmentSnapshotJson?: Record<string, unknown> | null;
  printStructureJson?: Record<string, unknown> | null;
  cumulativeAttemptedCredits?: number | null;
  cumulativeEarnedCredits?: number | null;
  cgpaSnapshot?: number | null;
  academicStandingStatus?: string | null;
  completionStatus?: string | null;
  graduationStatus?: string | null;
  generatedAt: Date;
  issuedAt?: Date | null;
  supersededAt?: Date | null;
  revokedAt?: Date | null;
}

export interface TranscriptTermSummary {
  id: string;
  departmentId: string;
  transcriptVersionId: string;
  academicTermId?: string | null;
  sourceGpaRecordId?: string | null;
  sortOrder: number;
  termCodeSnapshot: string;
  termNameSnapshot: string;
  attemptedCredits?: number | null;
  earnedCredits?: number | null;
  qualityPoints?: number | null;
  termGpaSnapshot?: number | null;
  cumulativeCgpaSnapshot?: number | null;
  academicStandingStatus?: string | null;
}

export interface TranscriptCourseLine {
  id: string;
  departmentId: string;
  transcriptVersionId: string;
  transcriptTermSummaryId: string;
  resultRecordId?: string | null;
  courseOfferingId?: string | null;
  sortOrder: number;
  courseCodeSnapshot: string;
  courseTitleSnapshot: string;
  creditHoursSnapshot: number;
  normalizedPercentage?: number | null;
  letterGrade?: string | null;
  gradePoint?: number | null;
  qualityPoints?: number | null;
  isCountedInGpa: boolean;
  completionStatus?: string | null;
  remarks?: string | null;
}

export interface TranscriptVerificationToken {
  id: string;
  departmentId: string;
  transcriptVersionId: string;
  issuedByUserId?: string | null;
  publicCode: string;
  status: string;
  publicSummaryJson?: Record<string, unknown> | null;
  verificationCount: number;
  lastVerifiedAt?: Date | null;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
  issuedAt: Date;
}

export interface TranscriptRevocationRecord {
  id: string;
  departmentId: string;
  transcriptRecordId: string;
  transcriptVersionId?: string | null;
  status: string;
  reason: string;
  requestedByUserId: string;
  appliedByUserId?: string | null;
  rejectedByUserId?: string | null;
  appliesToAllTokens: boolean;
  requestSnapshotJson?: Record<string, unknown> | null;
  requestedAt: Date;
  appliedAt?: Date | null;
  rejectedAt?: Date | null;
}

export interface TranscriptSealMetadata {
  id: string;
  departmentId: string;
  transcriptVersionId: string;
  sealType: string;
  signerDisplayName?: string | null;
  signerTitle?: string | null;
  signatureAlgorithm?: string | null;
  signatureReference?: string | null;
  sealReference?: string | null;
  payloadDigest?: string | null;
  metadataJson?: Record<string, unknown> | null;
  signedAt?: Date | null;
}
