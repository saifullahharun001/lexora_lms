import type {
  Notification,
  NotificationDelivery,
  NotificationEvent,
  NotificationPreference,
  NotificationTemplate,
  PushSubscription
} from "../../contracts/notification.contracts";

export interface NotificationService {
  emitNotificationEvent(input: NotificationEvent): Promise<NotificationEvent>;
  createNotificationTemplate(
    input: NotificationTemplate
  ): Promise<NotificationTemplate>;
  updateNotificationTemplate(
    input: NotificationTemplate
  ): Promise<NotificationTemplate>;
  createNotification(input: Notification): Promise<Notification>;
  trackDeliveryAttempt(
    input: NotificationDelivery
  ): Promise<NotificationDelivery>;
  dismissOwnNotification(
    notificationId: string,
    recipientUserId: string
  ): Promise<Notification | null>;
  updatePreference(
    input: NotificationPreference
  ): Promise<NotificationPreference>;
  registerPushSubscription(
    input: PushSubscription
  ): Promise<PushSubscription>;
}
