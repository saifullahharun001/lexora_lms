import { AttendanceImportBatchStatus, AttendanceImportSourceType } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

export class ListAttendanceImportBatchesQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  courseOfferingId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  classSessionId?: string;

  @IsOptional()
  @IsEnum(AttendanceImportBatchStatus)
  status?: AttendanceImportBatchStatus;

  @IsOptional()
  @IsEnum(AttendanceImportSourceType)
  sourceType?: AttendanceImportSourceType;

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
