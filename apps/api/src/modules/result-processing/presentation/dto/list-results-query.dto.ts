import { ResultRecordStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";

export class ListResultsQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  academicTermId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  courseOfferingId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  enrollmentId?: string;

  @IsOptional()
  @IsEnum(ResultRecordStatus)
  status?: ResultRecordStatus;
}

