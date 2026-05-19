import { NotificationChannel, NotificationTemplateStatus } from "@prisma/client";
import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from "class-validator";

export class UpdateNotificationTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  eventCode?: string;

  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @IsOptional()
  @IsEnum(NotificationTemplateStatus)
  status?: NotificationTemplateStatus;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  locale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  subjectTemplate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  titleTemplate?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  bodyTemplate?: string;

  @IsOptional()
  @IsObject()
  variablesJson?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isCritical?: boolean;
}
