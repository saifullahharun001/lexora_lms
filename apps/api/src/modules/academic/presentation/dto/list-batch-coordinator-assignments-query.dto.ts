import { BatchCoordinatorAssignmentStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";

export class ListBatchCoordinatorAssignmentsQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  studentBatchId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  academicTermId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  coordinatorUserId?: string;

  @IsOptional()
  @IsEnum(BatchCoordinatorAssignmentStatus)
  status?: BatchCoordinatorAssignmentStatus;
}
