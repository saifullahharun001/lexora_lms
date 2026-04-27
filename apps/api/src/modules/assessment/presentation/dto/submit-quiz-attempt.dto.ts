import { IsString, MinLength } from "class-validator";

export class SubmitQuizAttemptDto {
  @IsString()
  @MinLength(3)
  quizAttemptId!: string;
}

