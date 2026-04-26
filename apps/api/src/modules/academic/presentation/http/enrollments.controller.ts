import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { AcademicService } from "../../application/services/academic.service";
import { ACADEMIC_POLICY_NAMES } from "../../domain/academic.policy-names";
import { CreateEnrollmentDto } from "../dto/create-enrollment.dto";
import { ListEnrollmentsQueryDto } from "../dto/list-enrollments-query.dto";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";
import { UpdateEnrollmentDto } from "../dto/update-enrollment.dto";

@Controller({
  path: "enrollments",
  version: "1"
})
@UseGuards(AuthGuard, PolicyGuard)
export class EnrollmentsController {
  constructor(private readonly academicService: AcademicService) {}

  @Post()
  @RequirePolicy(ACADEMIC_POLICY_NAMES.ENROLLMENT_CREATE)
  create(@Body() body: CreateEnrollmentDto) {
    return this.academicService.createEnrollment({
      academicTermId: body.academicTermId,
      courseOfferingId: body.courseOfferingId,
      studentUserId: body.studentUserId,
      sourceType: body.sourceType,
      status: body.status,
      eligibilityStatus: body.eligibilityStatus,
      eligibilitySnapshotJson: body.eligibilitySnapshotJson as Prisma.InputJsonValue | undefined
    });
  }

  @Get()
  @RequirePolicy(ACADEMIC_POLICY_NAMES.ENROLLMENT_READ)
  list(@Query() query: ListEnrollmentsQueryDto) {
    return this.academicService.listEnrollments(query);
  }

  @Get(":id")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.ENROLLMENT_READ)
  getById(@Param() params: ResourceIdParamDto) {
    return this.academicService.getEnrollment(params.id);
  }

  @Patch(":id")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.ENROLLMENT_UPDATE)
  update(@Param() params: ResourceIdParamDto, @Body() body: UpdateEnrollmentDto) {
    return this.academicService.updateEnrollment(params.id, {
      sourceType: body.sourceType,
      status: body.status,
      eligibilityStatus: body.eligibilityStatus,
      eligibilitySnapshotJson:
        body.eligibilitySnapshotJson === null
          ? Prisma.DbNull
          : (body.eligibilitySnapshotJson as Prisma.InputJsonValue | undefined),
      enrolledAt: body.enrolledAt,
      droppedAt: body.droppedAt
    });
  }
}
