import { ResultPublicationBatchStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";

export class ListPublicationsQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  academicTermId?: string;

  @IsOptional()
  @IsEnum(ResultPublicationBatchStatus)
  status?: ResultPublicationBatchStatus;
}

