import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";

import { AcademicService } from "../../application/services/academic.service";
import { ACADEMIC_POLICY_NAMES } from "../../domain/academic.policy-names";
import { CreateSyllabusVersionDto } from "../dto/create-syllabus-version.dto";
import { ListSyllabusVersionsQueryDto } from "../dto/list-syllabus-versions-query.dto";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";

@Controller({ path: "syllabus-versions", version: "1" })
@UseGuards(AuthGuard, PolicyGuard)
export class SyllabusVersionsController {
  constructor(private readonly academicService: AcademicService) {}

  @Post()
  @RequirePolicy(ACADEMIC_POLICY_NAMES.SYLLABUS_VERSION_MANAGE)
  create(@Body() body: CreateSyllabusVersionDto) {
    return this.academicService.createSyllabusVersion(body);
  }

  @Get()
  @RequirePolicy(ACADEMIC_POLICY_NAMES.SYLLABUS_VERSION_MANAGE)
  list(@Query() query: ListSyllabusVersionsQueryDto) {
    return this.academicService.listSyllabusVersions(query);
  }

  @Get(":id")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.SYLLABUS_VERSION_MANAGE)
  getById(@Param() params: ResourceIdParamDto) {
    return this.academicService.getSyllabusVersion(params.id);
  }
}
