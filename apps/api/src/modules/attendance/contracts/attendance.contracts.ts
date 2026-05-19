export interface AttendanceRecordEntry {
  id: string;
  departmentId: string;
  classSessionId: string;
  enrollmentId: string;
  studentUserId: string;
  status: string;
  sourceType: string;
  externalSourceRef?: string | null;
  sourcePayloadJson?: unknown;
  markedByUserId?: string | null;
  overrideByUserId?: string | null;
  overrideReason?: string | null;
  markedAt?: Date;
  archivedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AttendanceImportBatchRecord {
  id: string;
  departmentId: string;
  courseOfferingId?: string | null;
  classSessionId?: string | null;
  uploadedByUserId: string;
  reviewedByUserId?: string | null;
  sourceType: string;
  status: string;
  externalSystemName?: string | null;
  externalBatchRef?: string | null;
  importWindowStartAt?: Date | null;
  importWindowEndAt?: Date | null;
  totalRows?: number;
  processedRows?: number;
  successfulRows?: number;
  failedRows?: number;
  validationSummaryJson?: unknown;
  processedAt?: Date | null;
  archivedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}
