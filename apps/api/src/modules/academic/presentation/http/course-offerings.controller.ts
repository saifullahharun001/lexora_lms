import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { AcademicService } from "../../application/services/academic.service";
import { ACADEMIC_POLICY_NAMES } from "../../domain/academic.policy-names";
import { CreateCourseOfferingDto } from "../dto/create-course-offering.dto";
import { ListCourseOfferingsQueryDto } from "../dto/list-course-offerings-query.dto";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";
import { UpdateCourseOfferingDto } from "../dto/update-course-offering.dto";

@Controller({
  path: "course-offerings",
  version: "1"
})
@UseGuards(AuthGuard, PolicyGuard)
export class CourseOfferingsController {
  constructor(private readonly academicService: AcademicService) {}

  @Post()
  @RequirePolicy(ACADEMIC_POLICY_NAMES.OFFERING_MANAGE)
  create(@Body() body: CreateCourseOfferingDto) {
    return this.academicService.createCourseOffering(body);
  }

  @Get()
  @RequirePolicy(ACADEMIC_POLICY_NAMES.OFFERING_READ)
  list(@Query() query: ListCourseOfferingsQueryDto) {
    return this.academicService.listCourseOfferings(query);
  }

  @Get(":id")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.OFFERING_READ)
  getById(@Param() params: ResourceIdParamDto) {
    return this.academicService.getCourseOffering(params.id);
  }

  @Patch(":id")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.OFFERING_MANAGE)
  update(@Param() params: ResourceIdParamDto, @Body() body: UpdateCourseOfferingDto) {
    return this.academicService.updateCourseOffering(params.id, body);
  }
}
