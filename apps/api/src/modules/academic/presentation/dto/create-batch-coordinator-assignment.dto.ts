import { Type } from "class-transformer";
import { IsDate, IsOptional, IsString, MinLength } from "class-validator";

export class CreateBatchCoordinatorAssignmentDto {
  @IsString()
  @MinLength(3)
  studentBatchId!: string;

  @IsString()
  @MinLength(3)
  academicTermId!: string;

  @IsString()
  @MinLength(3)
  coordinatorUserId!: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date;
}
