import { Type } from "class-transformer";
import {
  IsDate,
  IsObject,
  IsOptional,
  IsString,
  MinLength
} from "class-validator";
import { Prisma } from "@prisma/client";

export class CreateTranscriptSealDto {
  @IsString()
  @MinLength(3)
  transcriptVersionId!: string;

  @IsString()
  @MinLength(2)
  sealType!: string;

  @IsOptional()
  @IsString()
  signerDisplayName?: string;

  @IsOptional()
  @IsString()
  signerTitle?: string;

  @IsOptional()
  @IsString()
  signatureAlgorithm?: string;

  @IsOptional()
  @IsString()
  signatureReference?: string;

  @IsOptional()
  @IsString()
  sealReference?: string;

  @IsOptional()
  @IsString()
  payloadDigest?: string;

  @IsOptional()
  @IsObject()
  metadataJson?: Prisma.InputJsonObject;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  signedAt?: Date;
}
