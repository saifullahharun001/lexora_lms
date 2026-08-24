import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

import { TrimAcademicManagementString } from "./academic-management-string.transform";

export class CreateStudentBatchDto {
  @TrimAcademicManagementString()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  academicProgramId!: string;

  @TrimAcademicManagementString()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  academicSessionId!: string;

  @TrimAcademicManagementString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code!: string;

  @TrimAcademicManagementString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;
}
