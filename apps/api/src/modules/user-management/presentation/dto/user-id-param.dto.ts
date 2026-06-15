import { IsString, MinLength } from "class-validator";

export class UserIdParamDto {
  @IsString()
  @MinLength(3)
  id!: string;
}
