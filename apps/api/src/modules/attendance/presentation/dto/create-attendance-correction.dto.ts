import { Transform } from "class-transformer";
import { IsIn, IsString, MaxLength, MinLength } from "class-validator";

export class CreateAttendanceCorrectionDto {
  @IsString() @MinLength(1) @MaxLength(128)
  classSessionId!: string;

  @IsString() @MinLength(1) @MaxLength(128)
  enrollmentId!: string;

  @IsIn(["PRESENT", "ABSENT"])
  status!: "PRESENT" | "ABSENT";

  @Transform(({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(2000)
  reason!: string;
}
