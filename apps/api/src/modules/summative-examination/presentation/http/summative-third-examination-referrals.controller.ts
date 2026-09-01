import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { SUMMATIVE_EXAMINATION_POLICY_NAMES } from "../../domain/summative-examination.policy-names";
import { SummativeThirdExaminationReferralsService } from "../../application/services/summative-third-examination-referrals.service";
import { AssignSummativeThirdExaminerReferralDto } from "./dto/assign-summative-third-examiner-referral.dto";

@Controller("summative-examination/third-referrals")
@UseGuards(AuthGuard, PolicyGuard)
export class SummativeThirdExaminationReferralsController {
  constructor(
    private readonly service: SummativeThirdExaminationReferralsService,
  ) {}

  @Post()
  @RequirePolicy(
    SUMMATIVE_EXAMINATION_POLICY_NAMES.EXAMINER_ASSIGNMENT_MANAGE,
  )
  assignThirdExaminer(
    @Body() dto: AssignSummativeThirdExaminerReferralDto,
  ) {
    return this.service.assignThirdExaminer(dto);
  }
}
