import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { AcademicService } from "../../application/services/academic.service";
import { ACADEMIC_POLICY_NAMES } from "../../domain/academic.policy-names";
import { CreateProgramDto } from "../dto/create-program.dto";
import { ListProgramsQueryDto } from "../dto/list-programs-query.dto";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";
import { UpdateProgramDto } from "../dto/update-program.dto";

@Controller({
  path: "programs",
  version: "1"
})
@UseGuards(AuthGuard, PolicyGuard)
export class ProgramsController {
  constructor(private readonly academicService: AcademicService) {}

  @Post()
  @RequirePolicy(ACADEMIC_POLICY_NAMES.PROGRAM_MANAGE)
  create(@Body() body: CreateProgramDto) {
    return this.academicService.createProgram(body);
  }

  @Get()
  @RequirePolicy(ACADEMIC_POLICY_NAMES.PROGRAM_READ)
  list(@Query() query: ListProgramsQueryDto) {
    return this.academicService.listPrograms(query);
  }

  @Get(":id")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.PROGRAM_READ)
  getById(@Param() params: ResourceIdParamDto) {
    return this.academicService.getProgram(params.id);
  }

  @Patch(":id")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.PROGRAM_MANAGE)
  update(@Param() params: ResourceIdParamDto, @Body() body: UpdateProgramDto) {
    return this.academicService.updateProgram(params.id, body);
  }
}
