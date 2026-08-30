import { Transform } from "class-transformer";
import {
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

const RESOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]+$/;
const AWARDED_DECIMAL_6_2_PATTERN = /^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/;

const trimString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

const hasAwardedMark = (_object: unknown, value: unknown) =>
  value !== undefined && value !== null;

export class RegisterSummativeCandidateDto {
  @Transform(trimString)
  @IsString()
  @MinLength(3)
  @MaxLength(128)
  @Matches(RESOURCE_ID_PATTERN)
  enrollmentId!: string;
}

export class SaveExaminerQuestionMarkDto {
  @ValidateIf(hasAwardedMark)
  @IsString()
  @Matches(AWARDED_DECIMAL_6_2_PATTERN, {
    message:
      "awardedMark must be a non-negative decimal string within Decimal(6,2)",
  })
  awardedMark?: string | null;
}
