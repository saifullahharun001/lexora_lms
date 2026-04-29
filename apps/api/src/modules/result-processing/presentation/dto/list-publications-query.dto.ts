import { Type } from "class-transformer";
import { ResultPublicationBatchStatus } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

export class ListPublicationsQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  academicTermId?: string;

  @IsOptional()
  @IsEnum(ResultPublicationBatchStatus)
  status?: ResultPublicationBatchStatus;

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
