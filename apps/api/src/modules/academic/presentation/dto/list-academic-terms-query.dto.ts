import { AcademicTermStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";

export class ListAcademicTermsQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  academicYearId?: string;

  @IsOptional()
  @IsEnum(AcademicTermStatus)
  status?: AcademicTermStatus;
}
