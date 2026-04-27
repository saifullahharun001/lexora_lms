import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { AssessmentService } from "../../application/services/assessment.service";
import { ASSESSMENT_POLICY_NAMES } from "../../domain/assessment.policy-names";
import { CreateAssignmentSubmissionDto } from "../dto/create-assignment-submission.dto";
import { ListAssignmentSubmissionsQueryDto } from "../dto/list-assignment-submissions-query.dto";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";

@Controller({
  path: "assignment-submissions",
  version: "1"
})
@UseGuards(AuthGuard, PolicyGuard)
export class AssignmentSubmissionsController {
  constructor(private readonly assessmentService: AssessmentService) {}

  @Post()
  @RequirePolicy(ASSESSMENT_POLICY_NAMES.SUBMISSION_CREATE)
  create(@Body() body: CreateAssignmentSubmissionDto) {
    return this.assessmentService.createSubmission(body);
  }

  @Get()
  @RequirePolicy(ASSESSMENT_POLICY_NAMES.SUBMISSION_READ)
  list(@Query() query: ListAssignmentSubmissionsQueryDto) {
    return this.assessmentService.listSubmissions(query);
  }

  @Get(":id")
  @RequirePolicy(ASSESSMENT_POLICY_NAMES.SUBMISSION_READ)
  getById(@Param() params: ResourceIdParamDto) {
    return this.assessmentService.getSubmission(params.id);
  }
}

