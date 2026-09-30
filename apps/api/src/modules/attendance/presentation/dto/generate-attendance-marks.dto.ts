import { IsString, MinLength } from "class-validator";

export class AttendanceExaminationParamDto {
  @IsString()
  @MinLength(3)
  examinationId!: string;
}
