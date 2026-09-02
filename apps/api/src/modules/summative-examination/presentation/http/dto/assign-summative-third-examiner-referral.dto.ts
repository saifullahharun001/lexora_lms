import { Type } from "class-transformer";
import {
  IsDate,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class AssignSummativeThirdExaminerReferralDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(3)
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]+$/)
  comparisonId!: string;

  @IsNotEmpty()
  @IsString()
  thirdExaminerUserId!: string;

  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  deadline!: Date;
}
