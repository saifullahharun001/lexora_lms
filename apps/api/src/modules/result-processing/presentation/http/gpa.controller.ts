import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { ResultProcessingService } from "../../application/services/result-processing.service";
import { RESULT_PROCESSING_POLICY_NAMES } from "../../domain/result-processing.policy-names";
import { ComputeTermGpaDto } from "../dto/compute-term-gpa.dto";
import { ListGpaQueryDto } from "../dto/list-gpa-query.dto";

@Controller({ path: "gpa", version: "1" })
@UseGuards(AuthGuard, PolicyGuard)
export class GpaController {
  constructor(private readonly resultProcessingService: ResultProcessingService) {}

  @Post("compute-term")
  @RequirePolicy(RESULT_PROCESSING_POLICY_NAMES.GPA_COMPUTE)
  computeTerm(@Body() body: ComputeTermGpaDto) {
    return this.resultProcessingService.computeTermGpa(body);
  }

  @Get()
  @RequirePolicy(RESULT_PROCESSING_POLICY_NAMES.GPA_READ)
  list(@Query() query: ListGpaQueryDto) {
    return this.resultProcessingService.listGpa(query);
  }
}

