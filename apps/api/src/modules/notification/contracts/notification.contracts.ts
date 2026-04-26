export interface NotificationEvent {
  id: string;
  departmentId?: string | null;
  triggeredByUserId?: string | null;
  eventCode: string;
  channelTargets: string[];
  status: string;
  recipientCount: number;
  payloadJson?: Record<string, unknown> | null;
  contextJson?: Record<string, unknown> | null;
  dedupeKey?: string | null;
  occurredAt: Date;
  processedAt?: Date | null;
  failedAt?: Date | null;
}

export interface Notification {
  id: string;
  departmentId?: string | null;
  notificationEventId?: string | null;
  recipientUserId: string;
  templateId?: string | null;
  createdByUserId?: string | null;
  primaryChannel: string;
  status: string;
  eventCode: string;
  subject?: string | null;
  title?: string | null;
  body?: string | null;
  payloadJson?: Record<string, unknown> | null;
  actionUrl?: string | null;
  isCritical: boolean;
  readAt?: Date | null;
  dismissedAt?: Date | null;
  expiresAt?: Date | null;
}

export interface NotificationDelivery {
  id: string;
  departmentId?: string | null;
  notificationId: string;
  processedByUserId?: string | null;
  channel: string;
  status: string;
  destination?: string | null;
  provider?: string | null;
  providerMessageId?: string | null;
  attemptNumber: number;
  retryCount: number;
  nextRetryAt?: Date | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadataJson?: Record<string, unknown> | null;
  sentAt?: Date | null;
  deliveredAt?: Date | null;
  failedAt?: Date | null;
}

export interface NotificationTemplate {
  id: string;
  departmentId?: string | null;
  code: string;
  name: string;
  eventCode: string;
  channel: string;
  status: string;
  locale: string;
  subjectTemplate?: string | null;
  titleTemplate?: string | null;
  bodyTemplate: string;
  variablesJson?: Record<string, unknown> | null;
  isCritical: boolean;
  createdByUserId?: string | null;
  updatedByUserId?: string | null;
}

export interface NotificationPreference {
  id: string;
  departmentId?: string | null;
  userId: string;
  eventCode: string;
  channel: string;
  isEnabled: boolean;
  isCriticalLocked: boolean;
  settingsJson?: Record<string, unknown> | null;
}

export interface PushSubscription {
  id: string;
  departmentId?: string | null;
  userId: string;
  endpoint: string;
  endpointHash: string;
  p256dhKey?: string | null;
  authKey?: string | null;
  userAgent?: string | null;
  isActive: boolean;
  lastUsedAt?: Date | null;
  revokedAt?: Date | null;
}
