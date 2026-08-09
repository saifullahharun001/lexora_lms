import { Body, Controller, Param, Put, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";

import { AcademicService } from "../../application/services/academic.service";
import { ACADEMIC_POLICY_NAMES } from "../../domain/academic.policy-names";
import { CreateStudentCurriculumAssignmentDto } from "../dto/create-student-curriculum-assignment.dto";
import { StudentCurriculumAssignmentParamDto } from "../dto/student-curriculum-assignment-param.dto";

@Controller({ path: "students", version: "1" })
@UseGuards(AuthGuard, PolicyGuard)
export class StudentCurriculumAssignmentsController {
  constructor(private readonly academicService: AcademicService) {}

  @Put(":studentUserId/curriculum-assignments/:academicProgramId")
  @RequirePolicy(
    ACADEMIC_POLICY_NAMES.STUDENT_CURRICULUM_ASSIGNMENT_MANAGE,
  )
  createInitialAssignment(
    @Param() params: StudentCurriculumAssignmentParamDto,
    @Body() body: CreateStudentCurriculumAssignmentDto,
  ) {
    return this.academicService.createStudentCurriculumAssignment(
      params.studentUserId,
      params.academicProgramId,
      body.curriculumVersionId,
    );
  }
}
