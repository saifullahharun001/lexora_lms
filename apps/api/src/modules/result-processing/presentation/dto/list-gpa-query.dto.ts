import { IsOptional, IsString, MinLength } from "class-validator";

export class ListGpaQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  academicTermId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  studentUserId?: string;
}

