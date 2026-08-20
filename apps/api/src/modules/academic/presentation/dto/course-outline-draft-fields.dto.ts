import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength } from "class-validator";

function normalizeNarrative(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export class CourseOutlineDraftFieldsDto {
  @Transform(({ value }) => normalizeNarrative(value))
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  courseSummary?: string | null;

  @Transform(({ value }) => normalizeNarrative(value))
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  deliveryPlan?: string | null;

  @Transform(({ value }) => normalizeNarrative(value))
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  teachingStrategies?: string | null;

  @Transform(({ value }) => normalizeNarrative(value))
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  assessmentStrategy?: string | null;

  @Transform(({ value }) => normalizeNarrative(value))
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  evaluationPolicy?: string | null;

  @Transform(({ value }) => normalizeNarrative(value))
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  makeUpProcedure?: string | null;
}
