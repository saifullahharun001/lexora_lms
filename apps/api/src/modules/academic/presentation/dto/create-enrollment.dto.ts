import { EligibilityStatus, EnrollmentSourceType, EnrollmentStatus } from "@prisma/client";
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MinLength
} from "class-validator";

export class CreateEnrollmentDto {
  @IsString()
  @MinLength(3)
  academicTermId!: string;

  @IsString()
  @MinLength(3)
  courseOfferingId!: string;

  @IsString()
  @MinLength(3)
  studentUserId!: string;

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
  eligibilitySnapshotJson?: Record<string, unknown>;
}
