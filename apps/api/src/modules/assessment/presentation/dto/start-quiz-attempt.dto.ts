import { IsString, MinLength } from "class-validator";

export class StartQuizAttemptDto {
  @IsString()
  @MinLength(3)
  quizId!: string;

  @IsString()
  @MinLength(3)
  enrollmentId!: string;
}

