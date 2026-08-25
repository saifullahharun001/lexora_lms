import { Type } from "class-transformer";
import {
  IsDate,
  IsDefined,
  IsOptional,
  ValidateIf,
} from "class-validator";

export class UpdateBatchCoordinatorAssignmentDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date | null;
}

export class ReactivateBatchCoordinatorAssignmentDto {
  @IsDefined()
  @ValidateIf((_object, value) => value !== null)
  @Type(() => Date)
  @IsDate()
  expiresAt!: Date | null;
}
