import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

export class RevokeTranscriptDto {
  @IsString()
  @MinLength(10)
  reason!: string;

  @IsOptional()
  @IsBoolean()
  appliesToAllTokens?: boolean;
}
