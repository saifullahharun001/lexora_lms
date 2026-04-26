import { CourseOfferingStatus } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min
} from "class-validator";

export class UpdateCourseOfferingDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  sectionCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsEnum(CourseOfferingStatus)
  status?: CourseOfferingStatus;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  visibilityStartAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  visibilityEndAt?: Date;
}
