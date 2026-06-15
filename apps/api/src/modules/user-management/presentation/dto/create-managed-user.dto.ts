import { UserStatus } from "@prisma/client";
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from "class-validator";

import { MANAGED_USER_ROLE_CODES } from "../../domain/user-management.constants";
import type { ManagedUserRoleCode } from "../../domain/user-management.constants";

export class CreateManagedUserDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  displayName!: string;

  @IsIn(MANAGED_USER_ROLE_CODES)
  roleCode!: ManagedUserRoleCode;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  temporaryPassword!: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
