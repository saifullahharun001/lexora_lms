export interface AssignmentRecord {
  id: string;
  departmentId: string;
  courseOfferingId: string;
  title: string;
  status: string;
  maxPoints: number;
  availableFrom?: Date | null;
  dueAt?: Date | null;
  closeAt?: Date | null;
  allowLateSubmission: boolean;
  maxLateMinutes?: number | null;
  maxSubmissionCount: number;
  maxFileCount: number;
  maxFileSizeBytes?: number | null;
  allowedMimeTypes: string[];
  plagiarismCheckEnabled: boolean;
  evaluationConfigJson?: Record<string, unknown> | null;
}

export interface AssignmentSubmissionRecord {
  id: string;
  departmentId: string;
  assignmentId: string;
  enrollmentId: string;
  attemptNumber: number;
  status: string;
  submittedAt: Date;
  isLate: boolean;
  lateByMinutes?: number | null;
  notes?: string | null;
  evaluationHookStatus: string;
  evaluationHookRef?: string | null;
}

export interface SubmissionFileRecord {
  id: string;
  departmentId: string;
  assignmentSubmissionId: string;
  fileObjectId: string;
  displayName?: string | null;
  sortOrder: number;
}

export interface SubmissionEvaluationHook {
  status: string;
  reference?: string | null;
}

export interface GradingRecordFoundation {
  id: string;
  departmentId: string;
  courseOfferingId: string;
  gradingMode: string;
  pointsAwarded: number;
  feedback?: string | null;
  isRegrade: boolean;
  regradeReason?: string | null;
  gradedByUserId: string;
}

