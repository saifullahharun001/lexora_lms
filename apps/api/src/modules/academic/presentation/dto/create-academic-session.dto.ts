import { IsNotEmpty, IsString, MaxLength } from "class-validator";

import { TrimAcademicManagementString } from "./academic-management-string.transform";

export class CreateAcademicSessionDto {
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
