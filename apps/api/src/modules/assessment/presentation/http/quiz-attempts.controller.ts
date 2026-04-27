import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { AssessmentService } from "../../application/services/assessment.service";
import { ASSESSMENT_POLICY_NAMES } from "../../domain/assessment.policy-names";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";
import { StartQuizAttemptDto } from "../dto/start-quiz-attempt.dto";
import { SubmitQuizAttemptDto } from "../dto/submit-quiz-attempt.dto";

@Controller({
  path: "quiz-attempts",
  version: "1"
})
@UseGuards(AuthGuard, PolicyGuard)
export class QuizAttemptsController {
  constructor(private readonly assessmentService: AssessmentService) {}

  @Post("start")
  @RequirePolicy(ASSESSMENT_POLICY_NAMES.ATTEMPT_CREATE)
  start(@Body() body: StartQuizAttemptDto) {
    return this.assessmentService.startQuizAttempt(body);
  }

  @Post("submit")
  @RequirePolicy(ASSESSMENT_POLICY_NAMES.ATTEMPT_SUBMIT)
  submit(@Body() body: SubmitQuizAttemptDto) {
    return this.assessmentService.submitQuizAttempt(body);
  }

  @Get(":id")
  @RequirePolicy(ASSESSMENT_POLICY_NAMES.ATTEMPT_READ)
  getById(@Param() params: ResourceIdParamDto) {
    return this.assessmentService.getQuizAttempt(params.id);
  }
}

