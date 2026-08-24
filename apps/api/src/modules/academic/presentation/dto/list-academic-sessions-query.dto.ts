import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

import { TrimAcademicManagementString } from "./academic-management-string.transform";

export class ListAcademicSessionsQueryDto {
  @IsOptional()
  @TrimAcademicManagementString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  search?: string;
}
