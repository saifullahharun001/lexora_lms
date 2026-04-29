import { TranscriptRecordStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";

export class ListTranscriptsQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  studentUserId?: string;

  @IsOptional()
  @IsEnum(TranscriptRecordStatus)
  status?: TranscriptRecordStatus;
}
