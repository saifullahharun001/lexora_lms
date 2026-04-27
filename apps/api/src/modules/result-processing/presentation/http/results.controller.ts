import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { ResultProcessingService } from "../../application/services/result-processing.service";
import { RESULT_PROCESSING_POLICY_NAMES } from "../../domain/result-processing.policy-names";
import { ComputeResultsDto } from "../dto/compute-results.dto";
import { ListResultsQueryDto } from "../dto/list-results-query.dto";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";

@Controller({ path: "results", version: "1" })
@UseGuards(AuthGuard, PolicyGuard)
export class ResultsController {
  constructor(private readonly resultProcessingService: ResultProcessingService) {}

  @Post("compute")
  @RequirePolicy(RESULT_PROCESSING_POLICY_NAMES.RESULT_COMPUTE)
  compute(@Body() body: ComputeResultsDto) {
    return this.resultProcessingService.computeResults(body);
  }

  @Get()
  @RequirePolicy(RESULT_PROCESSING_POLICY_NAMES.RESULT_READ)
  list(@Query() query: ListResultsQueryDto) {
    return this.resultProcessingService.listResults(query);
  }

  @Get(":id")
  @RequirePolicy(RESULT_PROCESSING_POLICY_NAMES.RESULT_READ)
  getById(@Param() params: ResourceIdParamDto) {
    return this.resultProcessingService.getResult(params.id);
  }

  @Post(":id/verify")
  @RequirePolicy(RESULT_PROCESSING_POLICY_NAMES.RESULT_VERIFY)
  verify(@Param() params: ResourceIdParamDto) {
    return this.resultProcessingService.verifyResult(params.id);
  }

  @Post(":id/publish")
  @RequirePolicy(RESULT_PROCESSING_POLICY_NAMES.RESULT_PUBLISH)
  publish(@Param() params: ResourceIdParamDto) {
    return this.resultProcessingService.publishResult(params.id);
  }
}

