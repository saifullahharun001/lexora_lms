export interface EnrollmentEligibilitySnapshot {
  status: string;
  snapshotJson?: Record<string, unknown> | null;
}

export interface EnrollmentRecord {
  id: string;
  departmentId: string;
  academicTermId: string;
  courseOfferingId: string;
  studentUserId: string;
  approvedByUserId?: string | null;
  sourceType: string;
  status: string;
  eligibilityStatus: string;
  eligibilitySnapshotJson?: Record<string, unknown> | null;
}

