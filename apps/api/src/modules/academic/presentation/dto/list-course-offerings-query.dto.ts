import { CourseOfferingStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";

export class ListCourseOfferingsQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  academicTermId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  courseId?: string;

  @IsOptional()
  @IsEnum(CourseOfferingStatus)
  status?: CourseOfferingStatus;
}
