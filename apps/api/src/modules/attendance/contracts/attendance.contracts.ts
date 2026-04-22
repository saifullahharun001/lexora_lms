export interface AttendanceRecordEntry {
  id: string;
  departmentId: string;
  classSessionId: string;
  enrollmentId: string;
  studentUserId: string;
  status: string;
  sourceType: string;
  markedByUserId?: string | null;
  overrideByUserId?: string | null;
  overrideReason?: string | null;
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
}

