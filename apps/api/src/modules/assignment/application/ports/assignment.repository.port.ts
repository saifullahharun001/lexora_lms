import type {
  AssignmentRecord,
  AssignmentSubmissionRecord,
  GradingRecordFoundation,
  SubmissionFileRecord
} from "../../contracts/assignment.contracts";

export interface AssignmentRepositoryPort {
  findAssignmentById(id: string): Promise<AssignmentRecord | null>;
  saveAssignment(record: AssignmentRecord): Promise<AssignmentRecord>;
  findSubmissionById(id: string): Promise<AssignmentSubmissionRecord | null>;
  findSubmissionByAttempt(
    assignmentId: string,
    enrollmentId: string,
    attemptNumber: number
  ): Promise<AssignmentSubmissionRecord | null>;
  saveSubmission(record: AssignmentSubmissionRecord): Promise<AssignmentSubmissionRecord>;
  saveSubmissionFile(record: SubmissionFileRecord): Promise<SubmissionFileRecord>;
  saveGradingRecord(record: GradingRecordFoundation): Promise<GradingRecordFoundation>;
}

