import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDecimal,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested
} from "class-validator";

import { GradeRuleDto } from "./grade-rule.dto";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
type JsonObject = {
  [key: string]: JsonValue;
};

export class CreateGradeScaleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDecimal()
  passGradePoint?: string;

  @IsOptional()
  @IsDecimal()
  passPercentage?: string;

  @IsOptional()
  @IsObject()
  settingsJson?: JsonObject;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GradeRuleDto)
  rules?: GradeRuleDto[];
}
