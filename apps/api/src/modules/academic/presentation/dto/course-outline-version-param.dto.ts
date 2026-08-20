import { IsString, MinLength } from "class-validator";

export class CourseOutlineVersionParamDto {
  @IsString()
  @MinLength(3)
  id!: string;

  @IsString()
  @MinLength(3)
  courseOutlineVersionId!: string;
}
