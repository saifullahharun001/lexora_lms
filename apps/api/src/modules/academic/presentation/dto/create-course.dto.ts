import { CourseStatus } from "@prisma/client";
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from "class-validator";
import { IsDecimalString } from "./validators/decimal-string.decorator";

export class CreateCourseDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  academicProgramId?: string;

  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsDecimalString("creditHours")
  creditHours!: string;

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
