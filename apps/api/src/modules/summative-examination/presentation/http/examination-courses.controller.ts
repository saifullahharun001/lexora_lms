import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { ExaminationSetupService } from "../../application/services/examination-setup.service";
import { SummativeCandidateRosterService } from "../../application/services/summative-candidate-roster.service";
import { SUMMATIVE_EXAMINATION_POLICY_NAMES } from "../../domain/summative-examination.policy-names";
import { CreateExaminationCourseDto } from "./dto/create-examination-course.dto";
import { RegisterSummativeCandidateDto } from "./dto/examiner-marks.dto";
import {
  ExaminerMarkingCourseIdParamDto,
  ExaminationIdParamDto,
  ResourceIdParamDto,
} from "./dto/resource-id-param.dto";

@Controller({ path: "summative-examination-courses", version: "1" })
@UseGuards(AuthGuard, PolicyGuard)
export class ExaminationCoursesController {
  constructor(
    private readonly setupService: ExaminationSetupService,
    private readonly candidateRosterService: SummativeCandidateRosterService,
  ) {}

  @Post()
  @RequirePolicy(SUMMATIVE_EXAMINATION_POLICY_NAMES.SETUP_MANAGE)
  async createExaminationCourse(@Body() body: CreateExaminationCourseDto) {
    return this.setupService.createExaminationCourse(body);
  }

  @Get("examination/:examinationId")
  @RequirePolicy(SUMMATIVE_EXAMINATION_POLICY_NAMES.SETUP_MANAGE)
  async listExaminationCourses(@Param() params: ExaminationIdParamDto) {
    return this.setupService.listExaminationCourses(params.examinationId);
  }

  @Post(":examinationCourseId/candidates")
  @RequirePolicy(SUMMATIVE_EXAMINATION_POLICY_NAMES.SETUP_MANAGE)
  async registerCandidate(
    @Param() params: ExaminerMarkingCourseIdParamDto,
    @Body() body: RegisterSummativeCandidateDto,
  ) {
    return this.candidateRosterService.registerCandidate(
      params.examinationCourseId,
      body.enrollmentId,
    );
  }

  @Get(":id")
  @RequirePolicy(SUMMATIVE_EXAMINATION_POLICY_NAMES.SETUP_MANAGE)
  async getExaminationCourse(@Param() params: ResourceIdParamDto) {
    return this.setupService.getExaminationCourse(params.id);
  }
}
