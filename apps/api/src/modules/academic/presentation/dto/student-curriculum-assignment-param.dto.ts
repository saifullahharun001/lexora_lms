import { Transform } from "class-transformer";
import { IsNotEmpty, IsString, MinLength } from "class-validator";

function TrimmedResourceId() {
  return Transform(({ value }) =>
    typeof value === "string" ? value.trim() : value,
  );
}

export class StudentCurriculumAssignmentParamDto {
  @TrimmedResourceId()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  studentUserId!: string;

  @TrimmedResourceId()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  academicProgramId!: string;
}
