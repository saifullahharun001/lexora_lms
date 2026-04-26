import { AcademicProgramStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class ListProgramsQueryDto {
  @IsOptional()
  @IsEnum(AcademicProgramStatus)
  status?: AcademicProgramStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
