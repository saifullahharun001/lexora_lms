import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";

import { BatchCoordinatorAssignmentService } from "../../application/services/batch-coordinator-assignment.service";
import { ACADEMIC_POLICY_NAMES } from "../../domain/academic.policy-names";
import { CreateBatchCoordinatorAssignmentDto } from "../dto/create-batch-coordinator-assignment.dto";
import { ListBatchCoordinatorAssignmentsQueryDto } from "../dto/list-batch-coordinator-assignments-query.dto";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";
import {
  ReactivateBatchCoordinatorAssignmentDto,
  UpdateBatchCoordinatorAssignmentDto,
} from "../dto/update-batch-coordinator-assignment.dto";

@Controller({ path: "batch-coordinator-assignments", version: "1" })
@UseGuards(AuthGuard, PolicyGuard)
export class BatchCoordinatorAssignmentsController {
  constructor(
    private readonly assignmentService: BatchCoordinatorAssignmentService,
  ) {}

  @Post()
  @RequirePolicy(ACADEMIC_POLICY_NAMES.BATCH_COORDINATOR_ASSIGNMENT_MANAGE)
  create(@Body() body: CreateBatchCoordinatorAssignmentDto) {
    return this.assignmentService.create(body);
  }

  @Get()
  @RequirePolicy(ACADEMIC_POLICY_NAMES.BATCH_COORDINATOR_ASSIGNMENT_MANAGE)
  list(@Query() query: ListBatchCoordinatorAssignmentsQueryDto) {
    return this.assignmentService.list(query);
  }

  @Get(":id")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.BATCH_COORDINATOR_ASSIGNMENT_MANAGE)
  getById(@Param() params: ResourceIdParamDto) {
    return this.assignmentService.getById(params.id);
  }

  @Patch(":id")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.BATCH_COORDINATOR_ASSIGNMENT_MANAGE)
  update(
    @Param() params: ResourceIdParamDto,
    @Body() body: UpdateBatchCoordinatorAssignmentDto,
  ) {
    return this.assignmentService.update(params.id, body);
  }

  @Post(":id/unassign")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.BATCH_COORDINATOR_ASSIGNMENT_MANAGE)
  unassign(@Param() params: ResourceIdParamDto) {
    return this.assignmentService.unassign(params.id);
  }

  @Post(":id/reactivate")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.BATCH_COORDINATOR_ASSIGNMENT_MANAGE)
  reactivate(
    @Param() params: ResourceIdParamDto,
    @Body() body: ReactivateBatchCoordinatorAssignmentDto,
  ) {
    return this.assignmentService.reactivate(params.id, body);
  }

  @Post(":id/archive")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.BATCH_COORDINATOR_ASSIGNMENT_MANAGE)
  archive(@Param() params: ResourceIdParamDto) {
    return this.assignmentService.archive(params.id);
  }
}
