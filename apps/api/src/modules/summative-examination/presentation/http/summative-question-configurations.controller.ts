import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";

import { SummativeQuestionConfigurationService } from "../../application/services/summative-question-configuration.service";
import { SUMMATIVE_EXAMINATION_POLICY_NAMES } from "../../domain/summative-examination.policy-names";
import {
  AddQuestionConfigurationItemDto,
  UpdateQuestionConfigurationItemDto,
} from "./dto/question-configuration.dto";
import {
  QuestionConfigurationCourseIdParamDto,
  QuestionConfigurationIdParamDto,
  QuestionConfigurationItemIdParamDto,
} from "./dto/resource-id-param.dto";

@Controller({
  path: "summative/examination-courses/:examinationCourseId/question-configurations",
  version: "1",
})
@UseGuards(AuthGuard, PolicyGuard)
@RequirePolicy(SUMMATIVE_EXAMINATION_POLICY_NAMES.SETUP_MANAGE)
export class SummativeQuestionConfigurationsController {
  constructor(
    private readonly service: SummativeQuestionConfigurationService,
  ) {}

  @Post()
  async createDraftConfiguration(
    @Param() params: QuestionConfigurationCourseIdParamDto,
  ) {
    return this.service.createDraftConfiguration(params.examinationCourseId);
  }

  @Get()
  async getConfigurations(
    @Param() params: QuestionConfigurationCourseIdParamDto,
  ) {
    return this.service.getConfigurations(params.examinationCourseId);
  }

  @Get(":configurationId")
  async getConfiguration(
    @Param() params: QuestionConfigurationIdParamDto,
  ) {
    return this.service.getConfiguration(
      params.examinationCourseId,
      params.configurationId,
    );
  }

  @Post(":configurationId/items")
  async addItem(
    @Param() params: QuestionConfigurationIdParamDto,
    @Body() itemData: AddQuestionConfigurationItemDto,
  ) {
    return this.service.addItem(
      params.examinationCourseId,
      params.configurationId,
      itemData,
    );
  }

  @Patch(":configurationId/items/:itemId")
  async updateItem(
    @Param() params: QuestionConfigurationItemIdParamDto,
    @Body() itemData: UpdateQuestionConfigurationItemDto,
  ) {
    return this.service.updateItem(
      params.examinationCourseId,
      params.configurationId,
      params.itemId,
      itemData,
    );
  }

  @Post(":configurationId/lock")
  async lockConfiguration(
    @Param() params: QuestionConfigurationIdParamDto,
  ) {
    return this.service.lockConfiguration(
      params.examinationCourseId,
      params.configurationId,
    );
  }

  @Post(":configurationId/archive")
  async archiveConfiguration(
    @Param() params: QuestionConfigurationIdParamDto,
  ) {
    return this.service.archiveConfiguration(
      params.examinationCourseId,
      params.configurationId,
    );
  }
}
