import { BloomLevel } from "@prisma/client";
import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";

const POSITIVE_DECIMAL_6_2_PATTERN =
  /^(?:0\.(?!0{1,2}$)\d{1,2}|[1-9]\d{0,3}(?:\.\d{1,2})?)$/;

const trimString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

const normalizeOptionalLabel = ({ value }: { value: unknown }) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string") return value;
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
};

const isDefined = (_object: unknown, value: unknown) => value !== undefined;
const isDefinedAndNotNull = (_object: unknown, value: unknown) =>
  value !== undefined && value !== null;

export class AddQuestionConfigurationItemDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  questionLabel!: string;

  @Transform(normalizeOptionalLabel)
  @IsOptional()
  @IsString()
  @MaxLength(16)
  subQuestionLabel?: string | null;

  @IsInt()
  @Min(1)
  @Max(32767)
  displayOrder!: number;

  @IsString()
  @Matches(POSITIVE_DECIMAL_6_2_PATTERN, {
    message:
      "fullMark must be a positive decimal string within Decimal(6,2)",
  })
  fullMark!: string;

  @IsBoolean()
  isRequired!: boolean;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(3)
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]+$/)
  cloId?: string;

  @IsOptional()
  @IsEnum(BloomLevel)
  bloomLevel?: BloomLevel;

  @IsBoolean()
  isActive!: boolean;
}

export class UpdateQuestionConfigurationItemDto {
  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  questionLabel?: string;

  @Transform(normalizeOptionalLabel)
  @IsOptional()
  @IsString()
  @MaxLength(16)
  subQuestionLabel?: string | null;

  @ValidateIf(isDefined)
  @IsInt()
  @Min(1)
  @Max(32767)
  displayOrder?: number;

  @ValidateIf(isDefined)
  @IsString()
  @Matches(POSITIVE_DECIMAL_6_2_PATTERN, {
    message:
      "fullMark must be a positive decimal string within Decimal(6,2)",
  })
  fullMark?: string;

  @ValidateIf(isDefined)
  @IsBoolean()
  isRequired?: boolean;

  @Transform(trimString)
  @ValidateIf(isDefinedAndNotNull)
  @IsString()
  @MinLength(3)
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]+$/)
  cloId?: string | null;

  @ValidateIf(isDefinedAndNotNull)
  @IsEnum(BloomLevel)
  bloomLevel?: BloomLevel | null;

  @ValidateIf(isDefined)
  @IsBoolean()
  isActive?: boolean;
}
