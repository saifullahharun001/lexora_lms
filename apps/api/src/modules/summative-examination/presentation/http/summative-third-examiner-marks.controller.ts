import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";

import { SummativeThirdExaminerMarksService } from "../../application/services/summative-third-examiner-marks.service";
import { SUMMATIVE_EXAMINATION_POLICY_NAMES } from "../../domain/summative-examination.policy-names";
import { SaveExaminerQuestionMarkDto } from "./dto/examiner-marks.dto";
import {
  ExaminerMarkingCandidateIdParamDto,
  ExaminerMarkingCourseIdParamDto,
  ExaminerQuestionMarkIdParamDto,
} from "./dto/resource-id-param.dto";

@Controller({
  path: "summative/examination-courses/:examinationCourseId/third-marking-workspace",
  version: "1",
})
@UseGuards(AuthGuard, PolicyGuard)
@RequirePolicy(SUMMATIVE_EXAMINATION_POLICY_NAMES.EXAMINER_MARKS_ENTER)
export class SummativeThirdExaminerMarksController {
  constructor(private readonly service: SummativeThirdExaminerMarksService) {}

  @Get()
  getWorkspace(@Param() params: ExaminerMarkingCourseIdParamDto) {
    return this.service.getWorkspace(params.examinationCourseId);
  }

  @Get("candidates/:candidateId/submission")
  getOwnSubmission(@Param() params: ExaminerMarkingCandidateIdParamDto) {
    return this.service.getOwnSubmission(
      params.examinationCourseId,
      params.candidateId,
    );
  }

  @Patch("candidates/:candidateId/questions/:questionItemId/mark")
  saveQuestionMark(
    @Param() params: ExaminerQuestionMarkIdParamDto,
    @Body() body: SaveExaminerQuestionMarkDto,
  ) {
    return this.service.saveQuestionMark(
      params.examinationCourseId,
      params.candidateId,
      params.questionItemId,
      body,
    );
  }

  @Post("candidates/:candidateId/submit")
  finalizeSubmission(
    @Param() params: ExaminerMarkingCandidateIdParamDto,
  ) {
    return this.service.finalizeSubmission(
      params.examinationCourseId,
      params.candidateId,
    );
  }
}
