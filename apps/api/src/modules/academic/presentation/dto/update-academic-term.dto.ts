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

export class UpdateAcademicTermDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  academicYearId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sequence?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

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
