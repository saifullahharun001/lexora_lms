import { EligibilityStatus, EnrollmentSourceType, EnrollmentStatus } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsDate,
  IsEnum,
  IsObject,
  IsOptional
} from "class-validator";

export class UpdateEnrollmentDto {
  @IsOptional()
  @IsEnum(EnrollmentSourceType)
  sourceType?: EnrollmentSourceType;

  @IsOptional()
  @IsEnum(EnrollmentStatus)
  status?: EnrollmentStatus;

  @IsOptional()
  @IsEnum(EligibilityStatus)
  eligibilityStatus?: EligibilityStatus;

  @IsOptional()
  @IsObject()
  eligibilitySnapshotJson?: Record<string, unknown> | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  enrolledAt?: Date | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  droppedAt?: Date | null;
}
