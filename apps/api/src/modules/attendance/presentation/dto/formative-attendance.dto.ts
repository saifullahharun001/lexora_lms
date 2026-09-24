import { IsIn, IsString, MaxLength, MinLength } from "class-validator";

export class AttendanceReasonDto {
  @IsString() @MinLength(1) @MaxLength(2000)
  reason!: string;
}
export class AttendanceCorrectionDto extends AttendanceReasonDto {
  @IsIn(["PRESENT", "ABSENT"])
  status!: "PRESENT" | "ABSENT";
}
