import { IsOptional, IsString, MinLength } from "class-validator";

export class CreateAssignmentSubmissionDto {
  @IsString()
  @MinLength(3)
  assignmentId!: string;

  @IsString()
  @MinLength(3)
  enrollmentId!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

