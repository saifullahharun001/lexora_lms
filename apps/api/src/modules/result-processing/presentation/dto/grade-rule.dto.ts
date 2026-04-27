import { Type } from "class-transformer";
import { IsBoolean, IsDecimal, IsInt, IsObject, IsOptional, IsString, Min } from "class-validator";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
type JsonObject = {
  [key: string]: JsonValue;
};

export class GradeRuleDto {
  @IsDecimal()
  minPercentage!: string;

  @IsDecimal()
  maxPercentage!: string;

  @IsString()
  letterGrade!: string;

  @IsDecimal()
  gradePoint!: string;

  @IsOptional()
  @IsBoolean()
  isPassing?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsObject()
  metadataJson?: JsonObject;
}
