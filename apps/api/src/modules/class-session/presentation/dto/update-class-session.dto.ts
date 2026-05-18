import { Type } from "class-transformer";
import { IsDate, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateClassSessionDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  teacherAssignmentId?: string | null;

  @IsOptional()
  @IsString()
  sessionCode?: string | null;

  @IsOptional()
  @IsString()
  title?: string | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledStartAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledEndAt?: Date;

  @IsOptional()
  @IsString()
  location?: string | null;

  @IsOptional()
  @IsString()
  externalSourceRef?: string | null;
}
