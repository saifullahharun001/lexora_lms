import { IsOptional, IsString, MinLength } from "class-validator";

export class ListCgpaQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  studentUserId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  asOfAcademicTermId?: string;
}

