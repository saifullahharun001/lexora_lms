import {
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateExaminationCourseDto {
  @IsString()
  @MinLength(3)
  examinationId!: string;

  @IsString()
  @MinLength(3)
  courseOfferingId!: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(64)
  ruleVersionCode!: string;

  @IsOptional()
  @IsDateString({ strict: true })
  markingDeadline?: string;
}
