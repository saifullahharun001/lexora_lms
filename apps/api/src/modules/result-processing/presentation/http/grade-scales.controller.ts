import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { ResultProcessingService } from "../../application/services/result-processing.service";
import { RESULT_PROCESSING_POLICY_NAMES } from "../../domain/result-processing.policy-names";
import { CreateGradeScaleDto } from "../dto/create-grade-scale.dto";
import { ListGradeScalesQueryDto } from "../dto/list-grade-scales-query.dto";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";
import { UpdateGradeScaleDto } from "../dto/update-grade-scale.dto";

@Controller({ path: "grade-scales", version: "1" })
@UseGuards(AuthGuard, PolicyGuard)
export class GradeScalesController {
  constructor(private readonly resultProcessingService: ResultProcessingService) {}

  @Post()
  @RequirePolicy(RESULT_PROCESSING_POLICY_NAMES.GRADE_SCALE_MANAGE)
  create(@Body() body: CreateGradeScaleDto) {
    return this.resultProcessingService.createGradeScale(body);
  }

  @Get()
  @RequirePolicy(RESULT_PROCESSING_POLICY_NAMES.GRADE_SCALE_READ)
  list(@Query() query: ListGradeScalesQueryDto) {
    return this.resultProcessingService.listGradeScales(query);
  }

  @Get(":id")
  @RequirePolicy(RESULT_PROCESSING_POLICY_NAMES.GRADE_SCALE_READ)
  getById(@Param() params: ResourceIdParamDto) {
    return this.resultProcessingService.getGradeScale(params.id);
  }

  @Patch(":id")
  @RequirePolicy(RESULT_PROCESSING_POLICY_NAMES.GRADE_SCALE_MANAGE)
  update(@Param() params: ResourceIdParamDto, @Body() body: UpdateGradeScaleDto) {
    return this.resultProcessingService.updateGradeScale(params.id, body);
  }
}

