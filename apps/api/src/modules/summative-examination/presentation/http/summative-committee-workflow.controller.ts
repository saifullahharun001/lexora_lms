import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";

import { SummativeCommitteeWorkflowService } from "../../application/services/summative-committee-workflow.service";
import { SUMMATIVE_EXAMINATION_POLICY_NAMES } from "../../domain/summative-examination.policy-names";
import { SummativeCalculatedMarkIdParamDto } from "./dto/resource-id-param.dto";
import {
  ConfirmSummativeChairmanApprovalDto,
  SubmitSummativeMemberReviewDto,
} from "./dto/summative-committee-workflow.dto";

@Controller({
  path: "summative/calculated-marks/:calculatedMarkId/committee-workflow",
  version: "1",
})
@UseGuards(AuthGuard, PolicyGuard)
export class SummativeCommitteeWorkflowController {
  constructor(private readonly service: SummativeCommitteeWorkflowService) {}

  @Get("member-workspace")
  @RequirePolicy(SUMMATIVE_EXAMINATION_POLICY_NAMES.MEMBER_REVIEW)
  getMemberWorkspace(@Param() params: SummativeCalculatedMarkIdParamDto) {
    return this.service.getMemberWorkspace(params.calculatedMarkId);
  }

  @Post("member-reviews")
  @RequirePolicy(SUMMATIVE_EXAMINATION_POLICY_NAMES.MEMBER_REVIEW)
  submitMemberReview(
    @Param() params: SummativeCalculatedMarkIdParamDto,
    @Body() body: SubmitSummativeMemberReviewDto,
  ) {
    return this.service.submitMemberReview(params.calculatedMarkId, body);
  }

  @Get("chairman-workspace")
  @RequirePolicy(SUMMATIVE_EXAMINATION_POLICY_NAMES.CHAIRMAN_APPROVAL)
  getChairmanWorkspace(@Param() params: SummativeCalculatedMarkIdParamDto) {
    return this.service.getChairmanWorkspace(params.calculatedMarkId);
  }

  @Post("chairman-approval")
  @RequirePolicy(SUMMATIVE_EXAMINATION_POLICY_NAMES.CHAIRMAN_APPROVAL)
  approveAndFinalLock(
    @Param() params: SummativeCalculatedMarkIdParamDto,
    @Body() _body: ConfirmSummativeChairmanApprovalDto,
  ) {
    return this.service.approveAndFinalLock(params.calculatedMarkId);
  }
}
