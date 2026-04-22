import type {
  QuizAttemptRecord,
  QuizOptionRecord,
  QuizQuestionRecord,
  QuizRecord,
  QuizResponseRecord
} from "../../contracts/quiz.contracts";
import type { GradingRecordFoundation } from "../../../assignment/contracts/assignment.contracts";

export interface QuizService {
  createQuiz(input: QuizRecord): Promise<QuizRecord>;
  updateQuiz(input: QuizRecord): Promise<QuizRecord>;
  addQuestion(input: QuizQuestionRecord): Promise<QuizQuestionRecord>;
  addOption(input: QuizOptionRecord): Promise<QuizOptionRecord>;
  startAttempt(input: QuizAttemptRecord): Promise<QuizAttemptRecord>;
  submitAttempt(input: QuizAttemptRecord): Promise<QuizAttemptRecord>;
  saveResponse(input: QuizResponseRecord): Promise<QuizResponseRecord>;
  gradeAttempt(input: GradingRecordFoundation): Promise<GradingRecordFoundation>;
  regradeAttempt(input: GradingRecordFoundation): Promise<GradingRecordFoundation>;
}

