import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

export const MANAGED_EXAMINER_SEATS = [
  "FIRST_EXAMINER",
  "SECOND_EXAMINER",
] as const;

export type ManagedExaminerSeat = (typeof MANAGED_EXAMINER_SEATS)[number];

export class AssignExaminationCourseExaminerDto {
  @IsString()
  @MinLength(3)
  assignedUserId!: string;

  @IsIn(MANAGED_EXAMINER_SEATS)
  seat!: ManagedExaminerSeat;

  @IsOptional()
  @IsDateString({ strict: true })
  expiresAt?: string;
}

export class ReactivateExaminerAssignmentDto {
  @IsOptional()
  @IsDateString({ strict: true })
  expiresAt?: string;
}

export class UpdateExaminerAssignmentExpiryDto {
  @IsDateString({ strict: true })
  expiresAt!: string;
}
