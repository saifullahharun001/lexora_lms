import { IsArray, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreatePublicationDto {
  @IsString()
  @MinLength(3)
  academicTermId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  batchCode!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  resultIds?: string[];
}

