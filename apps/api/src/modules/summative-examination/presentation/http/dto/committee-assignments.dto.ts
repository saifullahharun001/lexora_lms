import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export const INTERNAL_COMMITTEE_SEATS = [
  "CHAIRMAN",
  "MEMBER_1",
  "MEMBER_2",
] as const;

export type InternalCommitteeSeat = (typeof INTERNAL_COMMITTEE_SEATS)[number];

export class AssignInternalCommitteeMemberDto {
  @IsString()
  @MinLength(3)
  assignedUserId!: string;

  @IsIn(INTERNAL_COMMITTEE_SEATS)
  seat!: InternalCommitteeSeat;

  @IsOptional()
  @IsDateString({ strict: true })
  expiresAt?: string;
}

export class AppointExternalCommitteeMemberDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(128)
  externalMemberName!: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(255)
  externalMemberAffiliation!: string;

  @IsOptional()
  @IsDateString({ strict: true })
  expiresAt?: string;
}

export class UpdateCommitteeMemberExpiryDto {
  @IsDateString({ strict: true })
  expiresAt!: string;
}

export class ReactivateCommitteeAssignmentDto {
  @IsOptional()
  @IsDateString({ strict: true })
  expiresAt?: string;
}
