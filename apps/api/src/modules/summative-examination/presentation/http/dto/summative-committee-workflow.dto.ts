import {
  Equals,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

import { SummativeCommitteeMemberReviewOutcome } from "@prisma/client";

export class SubmitSummativeMemberReviewDto {
  @IsEnum(SummativeCommitteeMemberReviewOutcome)
  outcome!: SummativeCommitteeMemberReviewOutcome;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(1000)
  reviewComment?: string;
}

export class ConfirmSummativeChairmanApprovalDto {
  @Equals(true)
  confirmFinalLock!: true;
}
