import { Type } from "class-transformer";
import { IsDate, IsNotEmpty, IsString, IsUUID } from "class-validator";

export class AssignSummativeThirdExaminerReferralDto {
  @IsNotEmpty()
  @IsUUID()
  comparisonId!: string;

  @IsNotEmpty()
  @IsString()
  thirdExaminerUserId!: string;

  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  deadline!: Date;
}
