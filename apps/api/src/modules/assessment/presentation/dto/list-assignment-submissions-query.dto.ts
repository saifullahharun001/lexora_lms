import { IsOptional, IsString, MinLength } from "class-validator";

export class ListAssignmentSubmissionsQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  assignmentId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  enrollmentId?: string;
}

