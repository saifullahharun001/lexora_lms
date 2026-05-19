import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { EligibilityService } from "../../application/services/eligibility.service";
import { ELIGIBILITY_POLICY_NAMES } from "../../domain/eligibility.policy-names";
import { ListMyEligibilityQueryDto } from "../dto/list-my-eligibility-query.dto";
import { OverrideEligibilityDto } from "../dto/override-eligibility.dto";
import {
  CourseOfferingIdParamDto,
  EnrollmentIdParamDto
} from "../dto/resource-id-param.dto";

@Controller({
  path: "eligibility",
  version: "1"
})
@UseGuards(AuthGuard, PolicyGuard)
export class EligibilityController {
  constructor(private readonly eligibilityService: EligibilityService) {}

  @Post("compute/enrollment/:enrollmentId")
  @RequirePolicy(ELIGIBILITY_POLICY_NAMES.RESULT_COMPUTE)
  computeEnrollment(@Param() params: EnrollmentIdParamDto) {
    return this.eligibilityService.computeEnrollment(params.enrollmentId);
  }

  @Post("compute/course-offering/:courseOfferingId")
  @RequirePolicy(ELIGIBILITY_POLICY_NAMES.RESULT_COMPUTE)
  computeCourseOffering(@Param() params: CourseOfferingIdParamDto) {
    return this.eligibilityService.computeCourseOffering(params.courseOfferingId);
  }

  @Get("enrollments/:enrollmentId")
  @RequirePolicy(ELIGIBILITY_POLICY_NAMES.RESULT_READ)
  getEnrollmentEligibility(@Param() params: EnrollmentIdParamDto) {
    return this.eligibilityService.getEnrollmentEligibility(params.enrollmentId);
  }

  @Get("me")
  @RequirePolicy(ELIGIBILITY_POLICY_NAMES.RESULT_SELF_READ)
  listMine(@Query() query: ListMyEligibilityQueryDto) {
    return this.eligibilityService.listMyEligibility(query);
  }

  @Patch("enrollments/:enrollmentId/override")
  @RequirePolicy(ELIGIBILITY_POLICY_NAMES.RESULT_OVERRIDE)
  overrideEnrollment(@Param() params: EnrollmentIdParamDto, @Body() body: OverrideEligibilityDto) {
    return this.eligibilityService.overrideEnrollment(params.enrollmentId, body);
  }
}
