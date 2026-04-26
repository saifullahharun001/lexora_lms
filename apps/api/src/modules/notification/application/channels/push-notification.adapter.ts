import type {
  Notification,
  NotificationDelivery,
  PushSubscription
} from "../../contracts/notification.contracts";

export interface PushNotificationChannelAdapter {
  send(
    notification: Notification,
    delivery: NotificationDelivery,
    subscription: PushSubscription
  ): Promise<void>;
}
