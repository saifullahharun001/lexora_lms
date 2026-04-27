import { IsString, MinLength } from "class-validator";

export class ResourceIdParamDto {
  @IsString()
  @MinLength(3)
  id!: string;
}

