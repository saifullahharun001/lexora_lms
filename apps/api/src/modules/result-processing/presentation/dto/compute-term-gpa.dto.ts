import { IsOptional, IsString, MinLength } from "class-validator";

export class ComputeTermGpaDto {
  @IsString()
  @MinLength(3)
  academicTermId!: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  studentUserId?: string;
}

