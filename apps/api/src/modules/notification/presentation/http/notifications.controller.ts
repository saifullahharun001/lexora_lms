import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { NotificationService } from "../../application/services/notification.service";
import { NOTIFICATION_POLICY_NAMES } from "../../domain/notification.policy-names";
import { EmitNotificationEventDto } from "../dto/emit-notification-event.dto";
import { ListNotificationsQueryDto } from "../dto/list-notifications-query.dto";
import { ResourceIdParamDto } from "../dto/resource-id-param.dto";

@Controller({
  path: "notifications",
  version: "1"
})
@UseGuards(AuthGuard, PolicyGuard)
export class NotificationsController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post("events")
  @RequirePolicy(NOTIFICATION_POLICY_NAMES.NOTIFICATION_EVENT_TRIGGER)
  emitEvent(@Body() body: EmitNotificationEventDto) {
    return this.notificationService.emitNotificationEvent(body);
  }

  @Get()
  @RequirePolicy(NOTIFICATION_POLICY_NAMES.NOTIFICATION_SELF_READ)
  listNotifications(@Query() query: ListNotificationsQueryDto) {
    return this.notificationService.listNotifications(query);
  }

  @Get(":id")
  @RequirePolicy(NOTIFICATION_POLICY_NAMES.NOTIFICATION_SELF_READ)
  getNotification(@Param() params: ResourceIdParamDto) {
    return this.notificationService.getNotification(params.id);
  }

  @Patch(":id/read")
  @RequirePolicy(NOTIFICATION_POLICY_NAMES.NOTIFICATION_SELF_READ)
  markRead(@Param() params: ResourceIdParamDto) {
    return this.notificationService.markNotificationRead(params.id);
  }

  @Patch(":id/dismiss")
  @RequirePolicy(NOTIFICATION_POLICY_NAMES.NOTIFICATION_SELF_READ)
  dismiss(@Param() params: ResourceIdParamDto) {
    return this.notificationService.dismissOwnNotification(params.id);
  }
}
