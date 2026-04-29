import { Type } from "class-transformer";
import { ResultRecordStatus } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

export class ListResultsQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  academicTermId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  courseOfferingId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  enrollmentId?: string;

  @IsOptional()
  @IsEnum(ResultRecordStatus)
  status?: ResultRecordStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}
