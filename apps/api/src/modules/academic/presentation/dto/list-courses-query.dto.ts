import { CourseStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class ListCoursesQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  academicProgramId?: string;

  @IsOptional()
  @IsEnum(CourseStatus)
  status?: CourseStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
