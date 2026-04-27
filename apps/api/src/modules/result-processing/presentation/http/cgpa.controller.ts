import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { ResultProcessingService } from "../../application/services/result-processing.service";
import { RESULT_PROCESSING_POLICY_NAMES } from "../../domain/result-processing.policy-names";
import { ListCgpaQueryDto } from "../dto/list-cgpa-query.dto";

@Controller({ path: "cgpa", version: "1" })
@UseGuards(AuthGuard, PolicyGuard)
export class CgpaController {
  constructor(private readonly resultProcessingService: ResultProcessingService) {}

  @Get()
  @RequirePolicy(RESULT_PROCESSING_POLICY_NAMES.GPA_READ)
  list(@Query() query: ListCgpaQueryDto) {
    return this.resultProcessingService.listCgpa(query);
  }
}

