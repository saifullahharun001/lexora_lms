import { AttendanceImportSourceType } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsDate,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MinLength
} from "class-validator";

export class CreateAttendanceImportBatchDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  courseOfferingId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  classSessionId?: string;

  @IsEnum(AttendanceImportSourceType)
  sourceType!: AttendanceImportSourceType;

  @IsOptional()
  @IsString()
  externalSystemName?: string;

  @IsOptional()
  @IsString()
  externalBatchRef?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  importWindowStartAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  importWindowEndAt?: Date;

  @IsOptional()
  @IsObject()
  validationSummaryJson?: Record<string, unknown>;
}
