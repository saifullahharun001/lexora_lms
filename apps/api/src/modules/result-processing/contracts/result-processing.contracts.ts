export interface ResultRecord {
  id: string;
  departmentId: string;
  academicTermId: string;
  courseOfferingId: string;
  enrollmentId: string;
  gradeScaleId: string;
  publicationBatchId?: string | null;
  status: string;
  eligibilityStatus: string;
  eligibilityReason?: string | null;
  totalRawScore?: number | null;
  normalizedPercentage?: number | null;
  letterGrade?: string | null;
  gradePoint?: number | null;
  creditHoursSnapshot: number;
  qualityPoints?: number | null;
  isPublished: boolean;
  computedSnapshotJson?: Record<string, unknown> | null;
  publishedSnapshotJson?: Record<string, unknown> | null;
  computedByUserId?: string | null;
  verifiedByUserId?: string | null;
  publishedByUserId?: string | null;
  computedAt?: Date | null;
  verifiedAt?: Date | null;
  publishedAt?: Date | null;
  lockedAt?: Date | null;
  amendedAt?: Date | null;
}

export interface ResultComponent {
  id: string;
  departmentId: string;
  resultRecordId: string;
  gradingRecordId?: string | null;
  sourceType: string;
  sourceEntityId?: string | null;
  componentCode: string;
  componentName: string;
  weightPercent: number;
  rawScore: number;
  maxScore: number;
  normalizedPercentage: number;
  weightedScore: number;
  isIncluded: boolean;
  sourceSnapshotJson?: Record<string, unknown> | null;
}

export interface GradeScale {
  id: string;
  departmentId: string;
  code: string;
  name: string;
  description?: string | null;
  isDefault: boolean;
  isActive: boolean;
  passGradePoint?: number | null;
  passPercentage?: number | null;
  settingsJson?: Record<string, unknown> | null;
  updatedByUserId?: string | null;
}

export interface GradeRule {
  id: string;
  gradeScaleId: string;
  sortOrder: number;
  minPercentage: number;
  maxPercentage: number;
  letterGrade: string;
  gradePoint: number;
  isPassing: boolean;
  isActive: boolean;
  metadataJson?: Record<string, unknown> | null;
}

export interface GPARecord {
  id: string;
  departmentId: string;
  academicTermId: string;
  studentUserId: string;
  publicationBatchId?: string | null;
  attemptedCredits: number;
  earnedCredits: number;
  qualityPoints: number;
  gpa: number;
  resultCount: number;
  computedSnapshotJson?: Record<string, unknown> | null;
  computedByUserId?: string | null;
  publishedByUserId?: string | null;
  computedAt?: Date | null;
  publishedAt?: Date | null;
}

export interface CGPARecord {
  id: string;
  departmentId: string;
  studentUserId: string;
  asOfAcademicTermId?: string | null;
  publicationBatchId?: string | null;
  attemptedCredits: number;
  earnedCredits: number;
  cumulativeQualityPoints: number;
  cgpa: number;
  termCount: number;
  computedSnapshotJson?: Record<string, unknown> | null;
  computedByUserId?: string | null;
  publishedByUserId?: string | null;
  computedAt?: Date | null;
  publishedAt?: Date | null;
}

export interface ResultPublicationBatch {
  id: string;
  departmentId: string;
  academicTermId: string;
  batchCode: string;
  name: string;
  status: string;
  resultCount: number;
  gpaCount: number;
  cgpaCount: number;
  selectionSnapshotJson?: Record<string, unknown> | null;
  failureReason?: string | null;
  initiatedByUserId?: string | null;
  publishedByUserId?: string | null;
  processingStartedAt?: Date | null;
  publishedAt?: Date | null;
}

export interface ResultAmendmentRecord {
  id: string;
  departmentId: string;
  resultRecordId: string;
  overrideActionId?: string | null;
  status: string;
  reason: string;
  requestedByUserId: string;
  approvedByUserId?: string | null;
  appliedByUserId?: string | null;
  requestSnapshotJson?: Record<string, unknown> | null;
  previousSnapshotJson?: Record<string, unknown> | null;
  appliedSnapshotJson?: Record<string, unknown> | null;
  rejectionReason?: string | null;
  requestedAt: Date;
  approvedAt?: Date | null;
  rejectedAt?: Date | null;
  appliedAt?: Date | null;
}
