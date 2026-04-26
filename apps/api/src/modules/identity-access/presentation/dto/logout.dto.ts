import { IsOptional, IsString, MaxLength } from "class-validator";

export class LogoutDto {
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  refreshToken?: string;
}
