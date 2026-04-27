import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { AssessmentService } from "../../application/services/assessment.service";
import { ASSESSMENT_POLICY_NAMES } from "../../domain/assessment.policy-names";
import { CreateAssignmentDto } from "../dto/create-assignment.dto";
import { ListAssignmentsQueryDto } from "../dto/list-assignments-query.dto";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";
import { UpdateAssignmentDto } from "../dto/update-assignment.dto";

@Controller({
  path: "assignments",
  version: "1"
})
@UseGuards(AuthGuard, PolicyGuard)
export class AssignmentsController {
  constructor(private readonly assessmentService: AssessmentService) {}

  @Post()
  @RequirePolicy(ASSESSMENT_POLICY_NAMES.ASSIGNMENT_MANAGE)
  create(@Body() body: CreateAssignmentDto) {
    return this.assessmentService.createAssignment(body);
  }

  @Get()
  @RequirePolicy(ASSESSMENT_POLICY_NAMES.ASSIGNMENT_READ)
  list(@Query() query: ListAssignmentsQueryDto) {
    return this.assessmentService.listAssignments(query);
  }

  @Get(":id")
  @RequirePolicy(ASSESSMENT_POLICY_NAMES.ASSIGNMENT_READ)
  getById(@Param() params: ResourceIdParamDto) {
    return this.assessmentService.getAssignment(params.id);
  }

  @Patch(":id")
  @RequirePolicy(ASSESSMENT_POLICY_NAMES.ASSIGNMENT_MANAGE)
  update(@Param() params: ResourceIdParamDto, @Body() body: UpdateAssignmentDto) {
    return this.assessmentService.updateAssignment(params.id, body);
  }
}

