import type {
  Notification,
  NotificationDelivery,
  NotificationEvent,
  NotificationPreference,
  NotificationTemplate,
  PushSubscription
} from "../../contracts/notification.contracts";

export interface EmitNotificationEventInput {
  departmentId: string | null;
  triggeredByUserId: string | null;
  eventCode: string;
  channelTargets: string[];
  recipientUserIds: string[];
  payloadJson?: Record<string, unknown> | null;
  contextJson?: Record<string, unknown> | null;
  dedupeKey?: string | null;
  title?: string | null;
  body?: string | null;
  subject?: string | null;
  actionUrl?: string | null;
  isCritical?: boolean;
}

export interface NotificationListFilters {
  departmentId: string | null;
  recipientUserId?: string;
  status?: string;
  eventCode?: string;
  limit: number;
  offset: number;
}

export interface NotificationTemplateListFilters {
  departmentId: string | null;
  eventCode?: string;
  channel?: string;
  status?: string;
  locale?: string;
  limit: number;
  offset: number;
}

export interface NotificationRepositoryPort {
  findNotificationEventById(id: string): Promise<NotificationEvent | null>;
  findNotificationEventByDedupeKey(
    departmentId: string | null,
    dedupeKey: string
  ): Promise<NotificationEvent | null>;
  emitNotificationEvent(input: EmitNotificationEventInput): Promise<NotificationEvent>;
  saveNotificationEvent(record: NotificationEvent): Promise<NotificationEvent>;
  findNotifications(filters: NotificationListFilters): Promise<Notification[]>;
  findNotificationById(
    departmentId: string | null,
    id: string,
    recipientUserId?: string
  ): Promise<Notification | null>;
  saveNotification(record: Notification): Promise<Notification>;
  markNotificationRead(
    departmentId: string | null,
    id: string,
    recipientUserId: string
  ): Promise<Notification | null>;
  dismissNotification(
    departmentId: string | null,
    id: string,
    recipientUserId: string
  ): Promise<Notification | null>;
  saveNotificationDelivery(
    record: NotificationDelivery
  ): Promise<NotificationDelivery>;
  findNotificationTemplates(
    filters: NotificationTemplateListFilters
  ): Promise<NotificationTemplate[]>;
  findNotificationTemplateById(
    departmentId: string | null,
    id: string
  ): Promise<NotificationTemplate | null>;
  findNotificationTemplate(
    departmentId: string | null,
    code: string,
    channel: string,
    locale: string
  ): Promise<NotificationTemplate | null>;
  saveNotificationTemplate(
    record: NotificationTemplate
  ): Promise<NotificationTemplate>;
  updateNotificationTemplate(
    departmentId: string | null,
    id: string,
    input: NotificationTemplate
  ): Promise<NotificationTemplate | null>;
  findNotificationPreferences(
    departmentId: string | null,
    userId: string
  ): Promise<NotificationPreference[]>;
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
