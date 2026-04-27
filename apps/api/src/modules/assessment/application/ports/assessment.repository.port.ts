import type {
  AssignmentStatus,
  Prisma,
  QuizStatus
} from "@prisma/client";

export interface AssignmentListFilters {
  departmentId: string;
  courseOfferingId?: string;
  status?: AssignmentStatus;
}

export interface CreateAssignmentInput {
  departmentId: string;
  courseOfferingId: string;
  title: string;
  instructions?: string;
  status?: AssignmentStatus;
  maxPoints: string;
  availableFrom?: Date;
  dueAt?: Date;
  closeAt?: Date;
  allowLateSubmission?: boolean;
  maxLateMinutes?: number;
  maxSubmissionCount?: number;
}

export type UpdateAssignmentInput = Partial<Omit<CreateAssignmentInput, "departmentId">>;

export interface SubmissionListFilters {
  departmentId: string;
  assignmentId?: string;
  enrollmentId?: string;
  studentUserId?: string;
}

export interface CreateSubmissionInput {
  departmentId: string;
  assignmentId: string;
  enrollmentId: string;
  attemptNumber: number;
  status: "SUBMITTED" | "LATE" | "RESUBMITTED";
  submittedAt: Date;
  isLate: boolean;
  lateByMinutes?: number;
  notes?: string;
}

export interface QuizListFilters {
  departmentId: string;
  courseOfferingId?: string;
  status?: QuizStatus;
}

export interface CreateQuizInput {
  departmentId: string;
  courseOfferingId: string;
  title: string;
  instructions?: string;
  status?: QuizStatus;
  maxPoints: string;
  availableFrom?: Date;
  startsAt?: Date;
  dueAt?: Date;
  closeAt?: Date;
  timeLimitMinutes?: number;
  maxAttempts?: number;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  autoGradingEnabled?: boolean;
  evaluationConfigJson?: Prisma.InputJsonValue;
}

export interface AttemptListIdentity {
  departmentId: string;
  quizId: string;
  enrollmentId: string;
}

export interface CreateQuizAttemptInput {
  departmentId: string;
  courseOfferingId: string;
  quizId: string;
  enrollmentId: string;
  attemptNumber: number;
  timeLimitMinutesSnapshot?: number;
}

export interface AssessmentRepositoryPort {
  findAssignments(filters: AssignmentListFilters): Promise<unknown[]>;
  findAssignmentById(departmentId: string, id: string): Promise<unknown | null>;
  createAssignment(input: CreateAssignmentInput): Promise<unknown>;
  updateAssignment(
    departmentId: string,
    id: string,
    input: UpdateAssignmentInput
  ): Promise<unknown | null>;

  findSubmissions(filters: SubmissionListFilters): Promise<unknown[]>;
  findSubmissionById(departmentId: string, id: string): Promise<unknown | null>;
  countSubmissions(identity: {
    departmentId: string;
    assignmentId: string;
    enrollmentId: string;
  }): Promise<number>;
  createSubmission(input: CreateSubmissionInput): Promise<unknown>;

  findQuizzes(filters: QuizListFilters): Promise<unknown[]>;
  findQuizById(departmentId: string, id: string): Promise<unknown | null>;
  createQuiz(input: CreateQuizInput): Promise<unknown>;

  countQuizAttempts(identity: AttemptListIdentity): Promise<number>;
  findQuizAttemptById(departmentId: string, id: string): Promise<unknown | null>;
  createQuizAttempt(input: CreateQuizAttemptInput): Promise<unknown>;
  submitQuizAttempt(departmentId: string, id: string, submittedAt: Date): Promise<unknown | null>;
}
