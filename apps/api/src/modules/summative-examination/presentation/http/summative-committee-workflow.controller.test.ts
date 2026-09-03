import assert from "node:assert/strict";
import test from "node:test";

import { RequestMethod } from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  VERSION_METADATA,
} from "@nestjs/common/constants";
import { SummativeCommitteeMemberReviewOutcome } from "@prisma/client";

import { REQUIRE_POLICY_KEY } from "@/modules/authorization/domain/authorization.constants";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";

import { SUMMATIVE_EXAMINATION_POLICY_NAMES } from "../../domain/summative-examination.policy-names";
import {
  ConfirmSummativeChairmanApprovalDto,
  SubmitSummativeMemberReviewDto,
} from "./dto/summative-committee-workflow.dto";
import { SummativeCommitteeWorkflowController } from "./summative-committee-workflow.controller";

const routes = [
  ["getMemberWorkspace", "member-workspace", RequestMethod.GET, SUMMATIVE_EXAMINATION_POLICY_NAMES.MEMBER_REVIEW],
  ["submitMemberReview", "member-reviews", RequestMethod.POST, SUMMATIVE_EXAMINATION_POLICY_NAMES.MEMBER_REVIEW],
  ["getChairmanWorkspace", "chairman-workspace", RequestMethod.GET, SUMMATIVE_EXAMINATION_POLICY_NAMES.CHAIRMAN_APPROVAL],
  ["approveAndFinalLock", "chairman-approval", RequestMethod.POST, SUMMATIVE_EXAMINATION_POLICY_NAMES.CHAIRMAN_APPROVAL],
] as const;

test("Committee workflow routes are authenticated and use separate exact policies", () => {
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, SummativeCommitteeWorkflowController),
    "summative/calculated-marks/:calculatedMarkId/committee-workflow",
  );
  assert.equal(
    Reflect.getMetadata(VERSION_METADATA, SummativeCommitteeWorkflowController),
    "1",
  );
  assert.deepEqual(
    Reflect.getMetadata(GUARDS_METADATA, SummativeCommitteeWorkflowController),
    [AuthGuard, PolicyGuard],
  );
  for (const [handlerName, path, method, policy] of routes) {
    const handler = SummativeCommitteeWorkflowController.prototype[handlerName];
    assert.equal(Reflect.getMetadata(PATH_METADATA, handler), path);
    assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), method);
    assert.equal(Reflect.getMetadata(REQUIRE_POLICY_KEY, handler), policy);
  }
});

test("controller forwards only calculated-mark identity and constrained DTOs", async () => {
  const calls: unknown[] = [];
  const service = new Proxy(
    {},
    {
      get: (_target, property) => (...args: unknown[]) => {
        calls.push([property, ...args]);
        return args;
      },
    },
  );
  const controller = new SummativeCommitteeWorkflowController(service as never);
  const params = { calculatedMarkId: "calculated-a" };
  const review = Object.assign(new SubmitSummativeMemberReviewDto(), {
    outcome: SummativeCommitteeMemberReviewOutcome.VERIFIED,
  });
  const confirmation = Object.assign(new ConfirmSummativeChairmanApprovalDto(), {
    confirmFinalLock: true as const,
  });
  await controller.getMemberWorkspace(params);
  await controller.submitMemberReview(params, review);
  await controller.getChairmanWorkspace(params);
  await controller.approveAndFinalLock(params, confirmation);
  assert.deepEqual(calls, [
    ["getMemberWorkspace", "calculated-a"],
    ["submitMemberReview", "calculated-a", review],
    ["getChairmanWorkspace", "calculated-a"],
    ["approveAndFinalLock", "calculated-a"],
  ]);
});

test("Committee controller exposes no edit, reopen, result or External Member route", () => {
  const handlers = Object.getOwnPropertyNames(
    SummativeCommitteeWorkflowController.prototype,
  ).filter((name) => name !== "constructor");
  assert.deepEqual(handlers.sort(), routes.map(([name]) => name).sort());
  assert.doesNotMatch(handlers.join("|"), /edit|reopen|correction|external|result|handoff/i);
});
