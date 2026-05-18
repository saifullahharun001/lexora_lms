import { Type } from "class-transformer";
import { IsDate, IsOptional, IsString, MinLength } from "class-validator";

export class CreateClassSessionDto {
  @IsString()
  @MinLength(3)
  courseOfferingId!: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  teacherAssignmentId?: string;

  @IsOptional()
  @IsString()
  sessionCode?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @Type(() => Date)
  @IsDate()
  scheduledStartAt!: Date;

  @Type(() => Date)
  @IsDate()
  scheduledEndAt!: Date;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  externalSourceRef?: string;
}
