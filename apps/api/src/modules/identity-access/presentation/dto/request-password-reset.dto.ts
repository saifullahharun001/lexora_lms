import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class RequestPasswordResetDto {
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  departmentCode!: string;

  @IsEmail()
  email!: string;
}
