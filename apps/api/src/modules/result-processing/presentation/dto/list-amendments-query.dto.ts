import { Type } from "class-transformer";
import { ResultAmendmentStatus } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

export class ListAmendmentsQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  resultRecordId?: string;

  @IsOptional()
  @IsEnum(ResultAmendmentStatus)
  status?: ResultAmendmentStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}
