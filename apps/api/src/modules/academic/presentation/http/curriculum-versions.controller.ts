import { Body, Controller, Param, Put, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";

import { AcademicService } from "../../application/services/academic.service";
import { ACADEMIC_POLICY_NAMES } from "../../domain/academic.policy-names";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";
import { TransitionCurriculumVersionDto } from "../dto/transition-curriculum-version.dto";

@Controller({
  path: "curriculum-versions",
  version: "1",
})
@UseGuards(AuthGuard, PolicyGuard)
export class CurriculumVersionsController {
  constructor(private readonly academicService: AcademicService) {}

  @Put(":id/approve")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.CURRICULUM_VERSION_LIFECYCLE_MANAGE)
  approve(
    @Param() params: ResourceIdParamDto,
    @Body() body: TransitionCurriculumVersionDto,
  ) {
    return this.academicService.approveCurriculumVersion(params.id, body);
  }

  @Put(":id/activate")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.CURRICULUM_VERSION_LIFECYCLE_MANAGE)
  activate(
    @Param() params: ResourceIdParamDto,
    @Body() body: TransitionCurriculumVersionDto,
  ) {
    return this.academicService.activateCurriculumVersion(params.id, body);
  }

  @Put(":id/retire")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.CURRICULUM_VERSION_LIFECYCLE_MANAGE)
  retire(
    @Param() params: ResourceIdParamDto,
    @Body() body: TransitionCurriculumVersionDto,
  ) {
    return this.academicService.retireCurriculumVersion(params.id, body);
  }

  @Put(":id/archive")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.CURRICULUM_VERSION_LIFECYCLE_MANAGE)
  archive(
    @Param() params: ResourceIdParamDto,
    @Body() body: TransitionCurriculumVersionDto,
  ) {
    return this.academicService.archiveCurriculumVersion(params.id, body);
  }
}
