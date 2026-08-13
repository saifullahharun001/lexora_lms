import { Transform } from "class-transformer";
import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { AcademicVersionStatus } from "@prisma/client";

export class ListSyllabusVersionsQueryDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  curriculumCourseId?: string;

  @IsOptional()
  @IsEnum(AcademicVersionStatus)
  status?: AcademicVersionStatus;
}
