import { IsDecimal, IsOptional, IsString, MinLength } from "class-validator";

export class CreateAmendmentDto {
  @IsString()
  @MinLength(3)
  resultRecordId!: string;

  @IsString()
  @MinLength(5)
  reason!: string;

  @IsOptional()
  @IsDecimal()
  proposedNormalizedPercentage?: string;

  @IsOptional()
  @IsString()
  proposedLetterGrade?: string;

  @IsOptional()
  @IsDecimal()
  proposedGradePoint?: string;
}

