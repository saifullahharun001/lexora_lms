import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { ResultProcessingService } from "../../application/services/result-processing.service";
import { RESULT_PROCESSING_POLICY_NAMES } from "../../domain/result-processing.policy-names";
import { CreateAmendmentDto } from "../dto/create-amendment.dto";
import { ListAmendmentsQueryDto } from "../dto/list-amendments-query.dto";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";

@Controller({ path: "result-amendments", version: "1" })
@UseGuards(AuthGuard, PolicyGuard)
export class ResultAmendmentsController {
  constructor(private readonly resultProcessingService: ResultProcessingService) {}

  @Post()
  @RequirePolicy(RESULT_PROCESSING_POLICY_NAMES.AMENDMENT_REQUEST)
  create(@Body() body: CreateAmendmentDto) {
    return this.resultProcessingService.requestAmendment(body);
  }

  @Get()
  @RequirePolicy(RESULT_PROCESSING_POLICY_NAMES.AMENDMENT_REQUEST)
  list(@Query() query: ListAmendmentsQueryDto) {
    return this.resultProcessingService.listAmendments(query);
  }

  @Post(":id/approve")
  @RequirePolicy(RESULT_PROCESSING_POLICY_NAMES.AMENDMENT_APPROVE)
  approve(@Param() params: ResourceIdParamDto) {
    return this.resultProcessingService.approveAmendment(params.id);
  }

  @Post(":id/apply")
  @RequirePolicy(RESULT_PROCESSING_POLICY_NAMES.AMENDMENT_APPLY)
  apply(@Param() params: ResourceIdParamDto) {
    return this.resultProcessingService.applyAmendment(params.id);
  }
}

