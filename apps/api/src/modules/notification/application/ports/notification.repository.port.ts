import type {
  Notification,
  NotificationDelivery,
  NotificationEvent,
  NotificationPreference,
  NotificationTemplate,
  PushSubscription
} from "../../contracts/notification.contracts";

export interface NotificationRepositoryPort {
  findNotificationEventById(id: string): Promise<NotificationEvent | null>;
  findNotificationEventByDedupeKey(
    departmentId: string | null,
    dedupeKey: string
  ): Promise<NotificationEvent | null>;
  saveNotificationEvent(record: NotificationEvent): Promise<NotificationEvent>;
  saveNotification(record: Notification): Promise<Notification>;
  saveNotificationDelivery(
    record: NotificationDelivery
  ): Promise<NotificationDelivery>;
  findNotificationTemplate(
    departmentId: string | null,
    code: string,
    channel: string,
    locale: string
  ): Promise<NotificationTemplate | null>;
  saveNotificationTemplate(
    record: NotificationTemplate
  ): Promise<NotificationTemplate>;
  saveNotificationPreference(
    record: NotificationPreference
  ): Promise<NotificationPreference>;
  findNotificationPreference(
    userId: string,
    eventCode: string,
    channel: string
  ): Promise<NotificationPreference | null>;
  savePushSubscription(record: PushSubscription): Promise<PushSubscription>;
  findPushSubscriptionByEndpointHash(
    endpointHash: string
  ): Promise<PushSubscription | null>;
}
