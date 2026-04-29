import { Type } from "class-transformer";
import { TranscriptRecordStatus } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

export class ListTranscriptsQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  studentUserId?: string;

  @IsOptional()
  @IsEnum(TranscriptRecordStatus)
  status?: TranscriptRecordStatus;

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
