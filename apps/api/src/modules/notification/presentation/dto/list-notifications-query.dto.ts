import { NotificationRecordStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

export class ListNotificationsQueryDto {
  @IsOptional()
  @IsEnum(NotificationRecordStatus)
  status?: NotificationRecordStatus;

  @IsOptional()
  @IsString()
  @MinLength(1)
  eventCode?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  recipientUserId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}
