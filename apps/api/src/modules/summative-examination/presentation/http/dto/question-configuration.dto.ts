import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, IsNotEmpty } from "class-validator";
import { BloomLevel } from "@prisma/client";
import { Type } from "class-transformer";

export class AddQuestionConfigurationItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  questionLabel!: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  subQuestionLabel?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  displayOrder!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  fullMark!: number;

  @IsBoolean()
  isRequired!: boolean;

  @IsOptional()
  @IsString()
  cloId?: string;

  @IsOptional()
  @IsEnum(BloomLevel)
  bloomLevel?: BloomLevel;

  @IsBoolean()
  isActive!: boolean;
}

export class UpdateQuestionConfigurationItemDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  questionLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  subQuestionLabel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  displayOrder?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  fullMark?: number;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsString()
  cloId?: string;

  @IsOptional()
  @IsEnum(BloomLevel)
  bloomLevel?: BloomLevel;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
