export interface QuizRecord {
  id: string;
  departmentId: string;
  courseOfferingId: string;
  title: string;
  status: string;
  maxPoints: number;
  availableFrom?: Date | null;
  startsAt?: Date | null;
  dueAt?: Date | null;
  closeAt?: Date | null;
  timeLimitMinutes?: number | null;
  maxAttempts: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  autoGradingEnabled: boolean;
  evaluationConfigJson?: Record<string, unknown> | null;
}

export interface QuizQuestionRecord {
  id: string;
  departmentId: string;
  quizId: string;
  prompt: string;
  questionType: string;
  sortOrder: number;
  maxPoints: number;
  isRequired: boolean;
  configJson?: Record<string, unknown> | null;
}

export interface QuizOptionRecord {
  id: string;
  departmentId: string;
  quizQuestionId: string;
  label: string;
  sortOrder: number;
  isCorrect: boolean;
}

export interface QuizAttemptRecord {
  id: string;
  departmentId: string;
  courseOfferingId: string;
  quizId: string;
  enrollmentId: string;
  attemptNumber: number;
  status: string;
  startedAt: Date;
  submittedAt?: Date | null;
  autoSubmittedAt?: Date | null;
  timeLimitMinutesSnapshot?: number | null;
  evaluationHookStatus: string;
  evaluationHookRef?: string | null;
}

export interface QuizResponseRecord {
  id: string;
  departmentId: string;
  quizAttemptId: string;
  quizQuestionId: string;
  selectedQuizOptionId?: string | null;
  textResponse?: string | null;
  pointsAwarded?: number | null;
  isCorrect?: boolean | null;
  answeredAt?: Date | null;
}

export interface QuizEvaluationHook {
  status: string;
  reference?: string | null;
}

