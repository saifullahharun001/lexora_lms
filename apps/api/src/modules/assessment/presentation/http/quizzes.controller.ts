import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { AssessmentService } from "../../application/services/assessment.service";
import { ASSESSMENT_POLICY_NAMES } from "../../domain/assessment.policy-names";
import { CreateQuizDto } from "../dto/create-quiz.dto";
import { ListQuizzesQueryDto } from "../dto/list-quizzes-query.dto";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";

@Controller({
  path: "quizzes",
  version: "1"
})
@UseGuards(AuthGuard, PolicyGuard)
export class QuizzesController {
  constructor(private readonly assessmentService: AssessmentService) {}

  @Post()
  @RequirePolicy(ASSESSMENT_POLICY_NAMES.QUIZ_MANAGE)
  create(@Body() body: CreateQuizDto) {
    return this.assessmentService.createQuiz(body);
  }

  @Get()
  @RequirePolicy(ASSESSMENT_POLICY_NAMES.QUIZ_READ)
  list(@Query() query: ListQuizzesQueryDto) {
    return this.assessmentService.listQuizzes(query);
  }

  @Get(":id")
  @RequirePolicy(ASSESSMENT_POLICY_NAMES.QUIZ_READ)
  getById(@Param() params: ResourceIdParamDto) {
    return this.assessmentService.getQuiz(params.id);
  }
}

