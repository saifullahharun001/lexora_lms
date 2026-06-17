import { Controller, Param, Post, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { AcademicService } from "../../application/services/academic.service";
import { ACADEMIC_POLICY_NAMES } from "../../domain/academic.policy-names";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";

@Controller({
  path: "teacher-assignments",
  version: "1",
})
@UseGuards(AuthGuard, PolicyGuard)
export class TeacherAssignmentsController {
  constructor(private readonly academicService: AcademicService) {}

  @Post(":id/unassign")
  @RequirePolicy(ACADEMIC_POLICY_NAMES.TEACHER_ASSIGNMENT_MANAGE)
  unassign(@Param() params: ResourceIdParamDto) {
    return this.academicService.unassignTeacherAssignment(params.id);
  }
}
