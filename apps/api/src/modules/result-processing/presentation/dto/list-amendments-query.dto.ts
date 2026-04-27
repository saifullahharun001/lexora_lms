import { ResultAmendmentStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";

export class ListAmendmentsQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  resultRecordId?: string;

  @IsOptional()
  @IsEnum(ResultAmendmentStatus)
  status?: ResultAmendmentStatus;
}

