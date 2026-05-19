import { IsString, MinLength } from "class-validator";

export class ResourceIdParamDto {
  @IsString()
  @MinLength(3)
  id!: string;
}

export class EnrollmentIdParamDto {
  @IsString()
  @MinLength(3)
  enrollmentId!: string;
}

export class CourseOfferingIdParamDto {
  @IsString()
  @MinLength(3)
  courseOfferingId!: string;
}
