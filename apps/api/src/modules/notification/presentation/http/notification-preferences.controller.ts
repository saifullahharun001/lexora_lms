import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";

import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { NotificationService } from "../../application/services/notification.service";
import { NOTIFICATION_POLICY_NAMES } from "../../domain/notification.policy-names";
import { UpdateNotificationPreferenceDto } from "../dto/update-notification-preference.dto";

@Controller({
  path: "notification-preferences",
  version: "1"
})
@UseGuards(AuthGuard, PolicyGuard)
export class NotificationPreferencesController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get("me")
  @RequirePolicy(NOTIFICATION_POLICY_NAMES.NOTIFICATION_SELF_READ)
  listMine() {
    return this.notificationService.listMyPreferences();
  }

  @Patch("me")
  @RequirePolicy(NOTIFICATION_POLICY_NAMES.NOTIFICATION_PREFERENCE_UPDATE)
  updateMine(@Body() body: UpdateNotificationPreferenceDto) {
    return this.notificationService.updatePreference(body);
  }
}
