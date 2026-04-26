import { CourseStatus } from "@prisma/client";
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from "class-validator";
import { IsDecimalString } from "./validators/decimal-string.decorator";

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  academicProgramId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsDecimalString("creditHours")
  creditHours?: string;

  @IsOptional()
  @IsDecimalString("lectureHours")
  lectureHours?: string;

  @IsOptional()
  @IsDecimalString("labHours")
  labHours?: string;

  @IsOptional()
  @IsEnum(CourseStatus)
  status?: CourseStatus;
}
