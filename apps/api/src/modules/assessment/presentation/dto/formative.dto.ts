import { IsBoolean, IsIn, IsString, Length, Matches, MaxLength, ValidateIf } from "class-validator";
import { FORMATIVE_METHODS } from "../../domain/formative.rules";

export class FormativeActivityDto {
  @IsString()
  @Length(1, 255)
  title!: string;

  @IsIn(FORMATIVE_METHODS)
  method!: string;

  @IsString()
  @Matches(/^\d{1,4}(\.\d{1,2})?$/)
  rawMaximum!: string;

  @IsString()
  @Matches(/^\d{1,2}(\.\d{1,2})?$/)
  assignedWeight!: string;
}

export class FormativeMarkDto {
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @Matches(/^\d{1,4}(\.\d{1,2})?$/)
  rawMark!: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(10000)
  feedback?: string;

  @IsBoolean()
  feedbackCompleted!: boolean;

  @IsIn(["CLEAR", "PENDING_REVIEW", "BLOCKED"])
  integrityStatus!: "CLEAR" | "PENDING_REVIEW" | "BLOCKED";
}

export class AdjustFormativeMarkDto extends FormativeMarkDto {
  @IsString()
  @Length(1, 2000)
  reason!: string;
}
