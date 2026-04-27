import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { ResultProcessingService } from "../../application/services/result-processing.service";
import { RESULT_PROCESSING_POLICY_NAMES } from "../../domain/result-processing.policy-names";
import { CreatePublicationDto } from "../dto/create-publication.dto";
import { ListPublicationsQueryDto } from "../dto/list-publications-query.dto";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";

@Controller({ path: "result-publications", version: "1" })
@UseGuards(AuthGuard, PolicyGuard)
export class ResultPublicationsController {
  constructor(private readonly resultProcessingService: ResultProcessingService) {}

  @Post()
  @RequirePolicy(RESULT_PROCESSING_POLICY_NAMES.PUBLICATION_MANAGE)
  create(@Body() body: CreatePublicationDto) {
    return this.resultProcessingService.createPublicationBatch(body);
  }

  @Get()
  @RequirePolicy(RESULT_PROCESSING_POLICY_NAMES.PUBLICATION_MANAGE)
  list(@Query() query: ListPublicationsQueryDto) {
    return this.resultProcessingService.listPublicationBatches(query);
  }

  @Get(":id")
  @RequirePolicy(RESULT_PROCESSING_POLICY_NAMES.PUBLICATION_MANAGE)
  getById(@Param() params: ResourceIdParamDto) {
    return this.resultProcessingService.getPublicationBatch(params.id);
  }
}

