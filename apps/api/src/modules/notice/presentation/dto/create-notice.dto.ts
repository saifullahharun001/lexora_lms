import { Type } from "class-transformer";
import { IsBoolean, IsDate, IsIn, IsOptional, IsString, MinLength } from "class-validator";

export class CreateNoticeDto {
  @IsOptional()
  @IsString()
  academicProgramId?: string;

  @IsOptional()
  @IsString()
  academicTermId?: string;

  @IsOptional()
  @IsString()
  courseOfferingId?: string;

  @IsString()
  @MinLength(3)
  title!: string;

  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsIn(["DEPARTMENT", "PROGRAM", "ACADEMIC_TERM", "COURSE_OFFERING"])
  audienceType: string = "DEPARTMENT";

  @IsOptional()
  @IsIn(["NORMAL", "IMPORTANT", "URGENT"])
  priority: string = "NORMAL";

  @IsOptional()
  @IsBoolean()
  publishNotification: boolean = false;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date;
}
