import { AttendanceRecordStatus } from "@prisma/client";
import { IsEnum, IsString, MinLength } from "class-validator";

export class OverrideAttendanceRecordDto {
  @IsEnum(AttendanceRecordStatus)
  status!: AttendanceRecordStatus;

  @IsString()
  @MinLength(3)
  overrideReason!: string;
}
