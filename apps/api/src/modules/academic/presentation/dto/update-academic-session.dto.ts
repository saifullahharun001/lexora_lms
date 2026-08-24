import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

import { TrimAcademicManagementString } from "./academic-management-string.transform";

export class UpdateAcademicSessionDto {
  @IsOptional()
  @TrimAcademicManagementString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code?: string;

  @IsOptional()
  @TrimAcademicManagementString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name?: string;
}
