import { IsOptional, IsString, MinLength } from "class-validator";

export class ComputeResultsDto {
  @IsString()
  @MinLength(3)
  courseOfferingId!: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  enrollmentId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  gradeScaleId?: string;
}

