import type { Notification, NotificationDelivery } from "../../contracts/notification.contracts";

export interface EmailNotificationChannelAdapter {
  send(
    notification: Notification,
    delivery: NotificationDelivery
  ): Promise<void>;
}
