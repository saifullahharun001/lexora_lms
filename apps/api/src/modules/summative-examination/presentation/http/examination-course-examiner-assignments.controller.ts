import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";

import { ExaminationCourseExaminerAssignmentService } from "../../application/services/examination-course-examiner-assignment.service";
import { SUMMATIVE_EXAMINATION_POLICY_NAMES } from "../../domain/summative-examination.policy-names";
import {
  AssignExaminationCourseExaminerDto,
  ReactivateExaminerAssignmentDto,
  UpdateExaminerAssignmentExpiryDto,
} from "./dto/examiner-assignments.dto";
import {
  ExaminationCourseIdParamDto,
  ExaminerAssignmentIdParamDto,
} from "./dto/resource-id-param.dto";

@Controller({
  path: "summative-examination-examiner-assignments",
  version: "1",
})
@UseGuards(AuthGuard, PolicyGuard)
export class ExaminationCourseExaminerAssignmentsController {
  constructor(
    private readonly assignmentService: ExaminationCourseExaminerAssignmentService,
  ) {}

  @Post("examination-course/:examinationCourseId")
  @RequirePolicy(
    SUMMATIVE_EXAMINATION_POLICY_NAMES.EXAMINER_ASSIGNMENT_MANAGE,
  )
  assign(
    @Param() params: ExaminationCourseIdParamDto,
    @Body() body: AssignExaminationCourseExaminerDto,
  ) {
    return this.assignmentService.assign(params.examinationCourseId, body);
  }

  @Get("examination-course/:examinationCourseId")
  @RequirePolicy(
    SUMMATIVE_EXAMINATION_POLICY_NAMES.EXAMINER_ASSIGNMENT_MANAGE,
  )
  listHistory(@Param() params: ExaminationCourseIdParamDto) {
    return this.assignmentService.listHistory(params.examinationCourseId);
  }

  @Get(":assignmentId")
  @RequirePolicy(
    SUMMATIVE_EXAMINATION_POLICY_NAMES.EXAMINER_ASSIGNMENT_MANAGE,
  )
  getById(@Param() params: ExaminerAssignmentIdParamDto) {
    return this.assignmentService.getById(params.assignmentId);
  }

  @Post(":assignmentId/unassign")
  @RequirePolicy(
    SUMMATIVE_EXAMINATION_POLICY_NAMES.EXAMINER_ASSIGNMENT_MANAGE,
  )
  unassign(@Param() params: ExaminerAssignmentIdParamDto) {
    return this.assignmentService.unassign(params.assignmentId);
  }

  @Post(":assignmentId/reactivate")
  @RequirePolicy(
    SUMMATIVE_EXAMINATION_POLICY_NAMES.EXAMINER_ASSIGNMENT_MANAGE,
  )
  reactivate(
    @Param() params: ExaminerAssignmentIdParamDto,
    @Body() body: ReactivateExaminerAssignmentDto,
  ) {
    return this.assignmentService.reactivate(params.assignmentId, body);
  }

  @Patch(":assignmentId/expiry")
  @RequirePolicy(
    SUMMATIVE_EXAMINATION_POLICY_NAMES.EXAMINER_ASSIGNMENT_MANAGE,
  )
  updateExpiry(
    @Param() params: ExaminerAssignmentIdParamDto,
    @Body() body: UpdateExaminerAssignmentExpiryDto,
  ) {
    return this.assignmentService.updateExpiry(
      params.assignmentId,
      body.expiresAt,
    );
  }

  @Post(":assignmentId/archive")
  @RequirePolicy(
    SUMMATIVE_EXAMINATION_POLICY_NAMES.EXAMINER_ASSIGNMENT_MANAGE,
  )
  archive(@Param() params: ExaminerAssignmentIdParamDto) {
    return this.assignmentService.archive(params.assignmentId);
  }
}
