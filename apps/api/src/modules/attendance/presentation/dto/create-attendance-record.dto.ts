import { AttendanceRecordStatus, AttendanceSourceType } from "@prisma/client";
import { IsEnum, IsObject, IsOptional, IsString, MinLength } from "class-validator";

export class CreateAttendanceRecordDto {
  @IsString()
  @MinLength(3)
  classSessionId!: string;

  @IsString()
  @MinLength(3)
  enrollmentId!: string;

  @IsString()
  @MinLength(3)
  studentUserId!: string;

  @IsEnum(AttendanceRecordStatus)
  status!: AttendanceRecordStatus;

  @IsEnum(AttendanceSourceType)
  sourceType!: AttendanceSourceType;

  @IsOptional()
  @IsString()
  externalSourceRef?: string;

  @IsOptional()
  @IsObject()
  sourcePayloadJson?: Record<string, unknown>;
}
