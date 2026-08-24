import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

import { TrimAcademicManagementString } from "./academic-management-string.transform";

export class ListStudentBatchesQueryDto {
  @IsOptional()
  @TrimAcademicManagementString()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  academicProgramId?: string;

  @IsOptional()
  @TrimAcademicManagementString()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  academicSessionId?: string;

  @IsOptional()
  @TrimAcademicManagementString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  search?: string;
}
