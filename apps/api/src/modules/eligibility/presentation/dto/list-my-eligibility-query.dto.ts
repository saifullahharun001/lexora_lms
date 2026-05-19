import { IsOptional, IsString, MinLength } from "class-validator";

export class ListMyEligibilityQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  courseOfferingId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  academicTermId?: string;
}

