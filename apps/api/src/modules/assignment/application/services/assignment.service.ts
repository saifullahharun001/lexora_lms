import type {
  AssignmentRecord,
  AssignmentSubmissionRecord,
  GradingRecordFoundation,
  SubmissionFileRecord
} from "../../contracts/assignment.contracts";

export interface AssignmentService {
  createAssignment(input: AssignmentRecord): Promise<AssignmentRecord>;
  updateAssignment(input: AssignmentRecord): Promise<AssignmentRecord>;
  createSubmission(input: AssignmentSubmissionRecord): Promise<AssignmentSubmissionRecord>;
  attachSubmissionFile(input: SubmissionFileRecord): Promise<SubmissionFileRecord>;
  gradeSubmission(input: GradingRecordFoundation): Promise<GradingRecordFoundation>;
  regradeSubmission(input: GradingRecordFoundation): Promise<GradingRecordFoundation>;
}

