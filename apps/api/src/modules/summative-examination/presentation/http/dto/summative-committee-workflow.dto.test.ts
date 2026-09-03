import assert from "node:assert/strict";
import test from "node:test";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { SummativeCommitteeMemberReviewOutcome } from "@prisma/client";

import {
  ConfirmSummativeChairmanApprovalDto,
  SubmitSummativeMemberReviewDto,
} from "./summative-committee-workflow.dto";

async function errors<T extends object>(type: new () => T, value: object) {
  return validate(plainToInstance(type, value), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

test("Member review DTO admits only the two structural outcomes and bounded optional text", async () => {
  assert.equal(
    (
      await errors(SubmitSummativeMemberReviewDto, {
        outcome: SummativeCommitteeMemberReviewOutcome.VERIFIED,
      })
    ).length,
    0,
  );
  assert.equal(
    (
      await errors(SubmitSummativeMemberReviewDto, {
        outcome: SummativeCommitteeMemberReviewOutcome.CORRECTION_REQUIRED,
        reviewComment: "The source chain needs correction.",
      })
    ).length,
    0,
  );
  assert.ok(
    (
      await errors(SubmitSummativeMemberReviewDto, {
        outcome: "APPROVED",
      })
    ).length > 0,
  );
  assert.ok(
    (
      await errors(SubmitSummativeMemberReviewDto, {
        outcome: SummativeCommitteeMemberReviewOutcome.VERIFIED,
        reviewComment: " ".repeat(1001),
      })
    ).length > 0,
  );
});

test("Chairman DTO requires an explicit final-lock confirmation and has no mark field", async () => {
  assert.equal(
    (await errors(ConfirmSummativeChairmanApprovalDto, { confirmFinalLock: true }))
      .length,
    0,
  );
  assert.ok(
    (await errors(ConfirmSummativeChairmanApprovalDto, { confirmFinalLock: false }))
      .length > 0,
  );
  assert.ok(
    (
      await errors(ConfirmSummativeChairmanApprovalDto, {
        confirmFinalLock: true,
        approvedSummativeMark: "99.999",
        chairmanUserId: "forged-user",
        departmentId: "forged-department",
      })
    ).length > 0,
  );
});
