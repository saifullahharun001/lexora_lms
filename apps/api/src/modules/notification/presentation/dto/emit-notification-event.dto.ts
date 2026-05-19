import { NotificationChannel } from "@prisma/client";
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from "class-validator";

export class EmitNotificationEventDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  eventCode!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(NotificationChannel, { each: true })
  channelTargets!: NotificationChannel[];

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MinLength(3, { each: true })
  recipientUserIds!: string[];

  @IsOptional()
  @IsObject()
  payloadJson?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  contextJson?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  dedupeKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  actionUrl?: string;

  @IsOptional()
  @IsBoolean()
  isCritical?: boolean;
}
