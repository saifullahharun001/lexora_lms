import { IsEmail, IsEnum, IsISO8601, IsString, Length, Matches } from "class-validator";
import { ExaminationCandidateCategory } from "@prisma/client";

export class CandidateListDto {
  @IsString() @Length(1, 500) @Matches(/\S/) sourceReference!: string;
}
export class CandidateRegistrationDto {
  @IsString() @Length(3, 128) studentUserId!: string;
  @IsString() @Length(3, 128) curriculumAssignmentId!: string;
  @IsEnum(ExaminationCandidateCategory) category!: ExaminationCandidateCategory;
}
export class PoeAppointmentDto extends CandidateListDto {
  @IsString() @Length(3, 128) userId!: string;
  @IsISO8601() expiresAt!: string;
}
export class ExternalComprehensiveAccessDto extends CandidateListDto {
  @IsEmail() @Length(3, 254) email!: string;
  @IsString() @Length(1, 128) @Matches(/\S/) displayName!: string;
  @IsISO8601() expiresAt!: string;
  @IsString() @Length(8, 72) temporaryPassword!: string;
}
