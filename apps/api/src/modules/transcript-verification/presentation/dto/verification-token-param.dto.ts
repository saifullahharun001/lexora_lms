import { IsString, MinLength } from "class-validator";

export class VerificationTokenParamDto {
  @IsString()
  @MinLength(20)
  token!: string;
}
