import { NotificationChannel } from "@prisma/client";
import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from "class-validator";

export class UpdateNotificationPreferenceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  eventCode!: string;

  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsBoolean()
  isEnabled!: boolean;

  @IsOptional()
  @IsBoolean()
  isCriticalLocked?: boolean;

  @IsOptional()
  @IsObject()
  settingsJson?: Record<string, unknown>;
}
