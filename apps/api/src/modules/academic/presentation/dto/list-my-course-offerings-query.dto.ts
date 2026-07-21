import { IsOptional, IsString, MinLength } from "class-validator";

export class ListMyCourseOfferingsQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  academicTermId?: string;
}
