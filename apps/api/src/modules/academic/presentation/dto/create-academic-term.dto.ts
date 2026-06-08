import { AcademicTermStatus } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateAcademicTermDto {
  @IsString()
  @MinLength(3)
  academicYearId!: string;

  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(150)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sequence!: number;

  @Type(() => Date)
  @IsDate()
  startDate!: Date;

  @Type(() => Date)
  @IsDate()
  endDate!: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  enrollmentStartAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  enrollmentEndAt?: Date;

  @IsOptional()
  @IsEnum(AcademicTermStatus)
  status?: AcademicTermStatus;
}
