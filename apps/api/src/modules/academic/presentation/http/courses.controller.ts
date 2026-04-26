import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { AcademicService } from "../../application/services/academic.service";
import { ACADEMIC_POLICY_NAMES } from "../../domain/academic.policy-names";
import { CreateCourseDto } from "../dto/create-course.dto";
import { ListCoursesQueryDto } from "../dto/list-courses-query.dto";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";
import { UpdateCourseDto } from "../dto/update-course.dto";

@Controller({
  path: "courses",
  version: "1"
})
@UseGuards(AuthGuard, PolicyGuard)
export class CoursesController {
  constructor(private readonly academicService: AcademicService) {}

  @Post()
  @RequirePolicy(ACADEMIC_POLICY_NAMES.COURSE_MANAGE)
  create(@Body() body: CreateCourseDto) {
    return this.academicService.createCourse({
      academicProgramId: body.academicProgramId,
      code: body.code,
      title: body.title,
      description: body.description,
      creditHours: new Prisma.Decimal(body.creditHours),
      lectureHours: body.lectureHours ? new Prisma.Decimal(body.lectureHours) : undefined,
      labHours: body.labHours ? new Prisma.Decimal(body.labHours) : undefined,
      status: body.status
    });
  }

  @Get()
  @RequirePolicy(ACADEMIC_POLICY_NAMES.COURSE_READ)
  list(@Query() query: ListCoursesQueryDto) {
    return this.academicService.listCourses(query);
  }

  @Get(":id")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.COURSE_READ)
  getById(@Param() params: ResourceIdParamDto) {
    return this.academicService.getCourse(params.id);
  }

  @Patch(":id")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.COURSE_MANAGE)
  update(@Param() params: ResourceIdParamDto, @Body() body: UpdateCourseDto) {
    return this.academicService.updateCourse(params.id, {
      academicProgramId: body.academicProgramId,
      code: body.code,
      title: body.title,
      description: body.description,
      creditHours: body.creditHours ? new Prisma.Decimal(body.creditHours) : undefined,
      lectureHours: body.lectureHours ? new Prisma.Decimal(body.lectureHours) : undefined,
      labHours: body.labHours ? new Prisma.Decimal(body.labHours) : undefined,
      status: body.status
    });
  }
}
