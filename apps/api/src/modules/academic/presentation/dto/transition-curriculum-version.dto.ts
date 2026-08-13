import { Transform } from "class-transformer";
import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

const trimString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class TransitionCurriculumVersionDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  approvalReference?: string;
}
