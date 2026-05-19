import { AttendanceRecordStatus, AttendanceSourceType } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

export class ListAttendanceRecordsQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  courseOfferingId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  classSessionId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  enrollmentId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  studentUserId?: string;

  @IsOptional()
  @IsEnum(AttendanceRecordStatus)
  status?: AttendanceRecordStatus;

  @IsOptional()
  @IsEnum(AttendanceSourceType)
  sourceType?: AttendanceSourceType;

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
