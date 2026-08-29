import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";

import { SummativeQuestionConfigurationService } from "../../application/services/summative-question-configuration.service";
import {
  AddQuestionConfigurationItemDto,
  UpdateQuestionConfigurationItemDto,
} from "./dto/question-configuration.dto";

@Controller("summative/examination-courses/:examinationCourseId/question-configurations")
@UseGuards(AuthGuard, PolicyGuard)
@RequirePolicy("summative-examination.setup.manage")
export class SummativeQuestionConfigurationsController {
  constructor(
    private readonly service: SummativeQuestionConfigurationService,
  ) {}

  @Post()
  async createDraftConfiguration(
    @Param("examinationCourseId") examinationCourseId: string,
  ) {
    return this.service.createDraftConfiguration(examinationCourseId);
  }

  @Get()
  async getConfigurations(
    @Param("examinationCourseId") examinationCourseId: string,
  ) {
    return this.service.getConfigurations(examinationCourseId);
  }

  @Get(":configurationId")
  async getConfiguration(
    @Param("examinationCourseId") examinationCourseId: string,
    @Param("configurationId") configurationId: string,
  ) {
    return this.service.getConfiguration(examinationCourseId, configurationId);
  }

  @Post(":configurationId/items")
  async addItem(
    @Param("examinationCourseId") examinationCourseId: string,
    @Param("configurationId") configurationId: string,
    @Body() itemData: AddQuestionConfigurationItemDto,
  ) {
    return this.service.addItem(examinationCourseId, configurationId, itemData);
  }

  @Patch(":configurationId/items/:itemId")
  async updateItem(
    @Param("examinationCourseId") examinationCourseId: string,
    @Param("configurationId") configurationId: string,
    @Param("itemId") itemId: string,
    @Body() itemData: UpdateQuestionConfigurationItemDto,
  ) {
    return this.service.updateItem(examinationCourseId, configurationId, itemId, itemData);
  }

  @Post(":configurationId/lock")
  async lockConfiguration(
    @Param("examinationCourseId") examinationCourseId: string,
    @Param("configurationId") configurationId: string,
  ) {
    return this.service.lockConfiguration(examinationCourseId, configurationId);
  }

  @Post(":configurationId/archive")
  async archiveConfiguration(
    @Param("examinationCourseId") examinationCourseId: string,
    @Param("configurationId") configurationId: string,
  ) {
    return this.service.archiveConfiguration(examinationCourseId, configurationId);
  }
}
