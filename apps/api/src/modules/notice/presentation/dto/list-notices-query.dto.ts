import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListNoticesQueryDto {
  @IsOptional()
  @IsIn(["DRAFT", "PUBLISHED", "ARCHIVED"])
  status?: string;

  @IsOptional()
  @IsIn(["DEPARTMENT", "PROGRAM", "ACADEMIC_TERM", "COURSE_OFFERING"])
  audienceType?: string;

  @IsOptional()
  @IsString()
  courseOfferingId?: string;

  @IsOptional()
  @IsString()
  academicProgramId?: string;

  @IsOptional()
  @IsString()
  academicTermId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}
