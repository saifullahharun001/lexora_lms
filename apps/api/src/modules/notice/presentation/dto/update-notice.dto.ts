import { Type } from "class-transformer";
import { IsBoolean, IsDate, IsIn, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateNoticeDto {
  @IsOptional()
  @IsString()
  academicProgramId?: string | null;

  @IsOptional()
  @IsString()
  academicTermId?: string | null;

  @IsOptional()
  @IsString()
  courseOfferingId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(3)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string;

  @IsOptional()
  @IsIn(["DEPARTMENT", "PROGRAM", "ACADEMIC_TERM", "COURSE_OFFERING"])
  audienceType?: string;

  @IsOptional()
  @IsIn(["NORMAL", "IMPORTANT", "URGENT"])
  priority?: string;

  @IsOptional()
  @IsBoolean()
  publishNotification?: boolean;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date | null;
}
