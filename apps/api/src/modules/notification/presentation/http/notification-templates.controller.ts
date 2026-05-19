import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { NotificationService } from "../../application/services/notification.service";
import { NOTIFICATION_POLICY_NAMES } from "../../domain/notification.policy-names";
import { CreateNotificationTemplateDto } from "../dto/create-notification-template.dto";
import { ListNotificationTemplatesQueryDto } from "../dto/list-notification-templates-query.dto";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";
import { UpdateNotificationTemplateDto } from "../dto/update-notification-template.dto";

@Controller({
  path: "notification-templates",
  version: "1"
})
@UseGuards(AuthGuard, PolicyGuard)
export class NotificationTemplatesController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post()
  @RequirePolicy(NOTIFICATION_POLICY_NAMES.NOTIFICATION_TEMPLATE_MANAGE)
  createTemplate(@Body() body: CreateNotificationTemplateDto) {
    return this.notificationService.createNotificationTemplate(body);
  }

  @Get()
  @RequirePolicy(NOTIFICATION_POLICY_NAMES.NOTIFICATION_TEMPLATE_MANAGE)
  listTemplates(@Query() query: ListNotificationTemplatesQueryDto) {
    return this.notificationService.listNotificationTemplates(query);
  }

  @Patch(":id")
  @RequirePolicy(NOTIFICATION_POLICY_NAMES.NOTIFICATION_TEMPLATE_MANAGE)
  updateTemplate(
    @Param() params: ResourceIdParamDto,
    @Body() body: UpdateNotificationTemplateDto
  ) {
    return this.notificationService.updateNotificationTemplate(params.id, body);
  }
}
