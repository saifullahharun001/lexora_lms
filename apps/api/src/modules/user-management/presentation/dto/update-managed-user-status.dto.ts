import { UserStatus } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UpdateManagedUserStatusDto {
  @IsEnum(UserStatus)
  status!: UserStatus;
}
