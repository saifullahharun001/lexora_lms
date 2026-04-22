import type {
  QuizAttemptRecord,
  QuizOptionRecord,
  QuizQuestionRecord,
  QuizRecord,
  QuizResponseRecord
} from "../../contracts/quiz.contracts";
import type { GradingRecordFoundation } from "../../../assignment/contracts/assignment.contracts";

export interface QuizRepositoryPort {
  findQuizById(id: string): Promise<QuizRecord | null>;
  saveQuiz(record: QuizRecord): Promise<QuizRecord>;
  saveQuizQuestion(record: QuizQuestionRecord): Promise<QuizQuestionRecord>;
  saveQuizOption(record: QuizOptionRecord): Promise<QuizOptionRecord>;
  findAttemptById(id: string): Promise<QuizAttemptRecord | null>;
  findAttemptByNumber(
    quizId: string,
    enrollmentId: string,
    attemptNumber: number
  ): Promise<QuizAttemptRecord | null>;
  saveAttempt(record: QuizAttemptRecord): Promise<QuizAttemptRecord>;
  saveResponse(record: QuizResponseRecord): Promise<QuizResponseRecord>;
  saveGradingRecord(record: GradingRecordFoundation): Promise<GradingRecordFoundation>;
}

