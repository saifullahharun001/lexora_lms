import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDefined,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";

const trimString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class CourseOutlineTopicPlanDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  syllabusContentTopicId!: string;

  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((item) =>
          typeof item === "string" ? item.trim() : item,
        )
      : value,
  )
  @IsArray()
  @ArrayMaxSize(32_767)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(191, { each: true })
  @ArrayUnique()
  courseLearningOutcomeIds!: string[];

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(255)
  assessmentTechnique?: string;
}

export class CourseOutlineSupplementalResourceDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  resourceTypeCode!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1_000)
  citationText!: string;
}

export class CourseOutlineAssessmentScheduleItemDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  assessmentTemplateComponentId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(32_767)
  plannedWeekNumber?: number;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  scheduledAt?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(1_000)
  notes?: string;
}

export class UpdateCourseOutlineStructuredContentDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32_767)
  @ValidateNested({ each: true })
  @Type(() => CourseOutlineTopicPlanDto)
  @ArrayUnique(
    (topicPlan: CourseOutlineTopicPlanDto) =>
      topicPlan.syllabusContentTopicId,
  )
  topicPlans?: CourseOutlineTopicPlanDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32_767)
  @ValidateNested({ each: true })
  @Type(() => CourseOutlineSupplementalResourceDto)
  supplementalResources?: CourseOutlineSupplementalResourceDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32_767)
  @ValidateNested({ each: true })
  @Type(() => CourseOutlineAssessmentScheduleItemDto)
  @ArrayUnique(
    (item: CourseOutlineAssessmentScheduleItemDto) =>
      item.assessmentTemplateComponentId,
  )
  assessmentSchedule?: CourseOutlineAssessmentScheduleItemDto[];

  @ValidateIf(
    (input: UpdateCourseOutlineStructuredContentDto) =>
      input.topicPlans === undefined &&
      input.supplementalResources === undefined &&
      input.assessmentSchedule === undefined,
  )
  @IsDefined({ message: "At least one structured-content section is required" })
  get suppliedSection(): undefined {
    return undefined;
  }
}
