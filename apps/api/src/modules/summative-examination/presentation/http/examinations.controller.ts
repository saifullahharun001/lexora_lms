import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { ExaminationSetupService } from "../../application/services/examination-setup.service";
import { SUMMATIVE_EXAMINATION_POLICY_NAMES } from "../../domain/summative-examination.policy-names";
import { CreateExaminationDto } from "./dto/create-examination.dto";
import { ResourceIdParamDto } from "./dto/resource-id-param.dto";

@Controller({ path: "summative-examinations", version: "1" })
@UseGuards(AuthGuard, PolicyGuard)
export class ExaminationsController {
  constructor(private readonly setupService: ExaminationSetupService) {}

  @Post()
  @RequirePolicy(SUMMATIVE_EXAMINATION_POLICY_NAMES.SETUP_MANAGE)
  async createExamination(@Body() body: CreateExaminationDto) {
    return this.setupService.createExamination(body);
  }

  @Get()
  @RequirePolicy(SUMMATIVE_EXAMINATION_POLICY_NAMES.SETUP_MANAGE)
  async listExaminations() {
    return this.setupService.listExaminations();
  }

  @Get(":id")
  @RequirePolicy(SUMMATIVE_EXAMINATION_POLICY_NAMES.SETUP_MANAGE)
  async getExamination(@Param() params: ResourceIdParamDto) {
    return this.setupService.getExamination(params.id);
  }
}
