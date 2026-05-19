import { Injectable } from "@nestjs/common";
import {
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationEventStatus,
  NotificationRecordStatus,
  Prisma
} from "@prisma/client";

import { PrismaService } from "@/common/prisma/prisma.service";
import type {
  Notification,
  NotificationDelivery,
  NotificationEvent,
  NotificationPreference,
  NotificationTemplate,
  PushSubscription
} from "../../contracts/notification.contracts";
import type {
  EmitNotificationEventInput,
  NotificationListFilters,
  NotificationRepositoryPort,
  NotificationTemplateListFilters
} from "../../application/ports/notification.repository.port";

@Injectable()
export class PrismaNotificationRepository implements NotificationRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async emitNotificationEvent(input: EmitNotificationEventInput): Promise<NotificationEvent> {
    const existing = input.dedupeKey
      ? await this.findNotificationEventByDedupeKey(input.departmentId, input.dedupeKey)
      : null;

    if (existing) {
      return existing;
    }

    const channelTargets = input.channelTargets as NotificationChannel[];
    const createsInApp = channelTargets.includes(NotificationChannel.IN_APP);
    const primaryChannel = createsInApp ? NotificationChannel.IN_APP : channelTargets[0];

    try {
      return await this.prisma.$transaction(async (tx) => {
        const event = await tx.notificationEvent.create({
          data: {
            departmentId: input.departmentId,
            triggeredByUserId: input.triggeredByUserId,
            eventCode: input.eventCode,
            channelTargets,
            status: NotificationEventStatus.RECEIVED,
            recipientCount: input.recipientUserIds.length,
            payloadJson: toPrismaJson(input.payloadJson),
            contextJson: toPrismaJson(input.contextJson),
            dedupeKey: input.dedupeKey
          }
        });

        if (primaryChannel) {
          for (const recipientUserId of input.recipientUserIds) {
            const notification = await tx.notification.create({
              data: {
                departmentId: input.departmentId,
                notificationEventId: event.id,
                recipientUserId,
                createdByUserId: input.triggeredByUserId,
                primaryChannel,
                // READY means the in-app record is available to the recipient; external
                // EMAIL/PUSH delivery remains a PENDING placeholder in NotificationDelivery.
                status: createsInApp
                  ? NotificationRecordStatus.READY
                  : NotificationRecordStatus.PENDING,
                eventCode: input.eventCode,
                subject: input.subject,
                title: input.title,
                body: input.body,
                payloadJson: toPrismaJson(input.payloadJson),
                actionUrl: input.actionUrl,
                isCritical: input.isCritical ?? false
              }
            });

            for (const channel of channelTargets) {
              if (channel === NotificationChannel.IN_APP) {
                continue;
              }

              await tx.notificationDelivery.create({
                data: {
                  departmentId: input.departmentId,
                  notificationId: notification.id,
                  channel,
                  status: NotificationDeliveryStatus.PENDING,
                  metadataJson: {
                    placeholder: true,
                    reason: "External delivery is intentionally out of scope for the foundation"
                  }
                }
              });
            }
          }
        }

        return mapNotificationEvent(
          await tx.notificationEvent.update({
            where: { id: event.id },
            data: {
              status: NotificationEventStatus.PROCESSED,
              processedAt: new Date()
            }
          })
        );
      });
    } catch (error) {
      if (
        input.dedupeKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const deduped = await this.findNotificationEventByDedupeKey(
          input.departmentId,
          input.dedupeKey
        );

        if (deduped) {
          return deduped;
        }
      }

      throw error;
    }
  }

  async findNotificationEventById(id: string): Promise<NotificationEvent | null> {
    const event = await this.prisma.notificationEvent.findUnique({ where: { id } });
    return event ? mapNotificationEvent(event) : null;
  }

  async findNotificationEventByDedupeKey(
    departmentId: string | null,
    dedupeKey: string
  ): Promise<NotificationEvent | null> {
    const event = await this.prisma.notificationEvent.findFirst({
      where: { departmentId, dedupeKey }
    });
    return event ? mapNotificationEvent(event) : null;
  }

  async saveNotificationEvent(record: NotificationEvent): Promise<NotificationEvent> {
    const event = await this.prisma.notificationEvent.upsert({
      where: { id: record.id },
      create: {
        id: record.id,
        departmentId: record.departmentId,
        triggeredByUserId: record.triggeredByUserId,
        eventCode: record.eventCode,
        channelTargets: record.channelTargets as NotificationChannel[],
        status: record.status as NotificationEventStatus,
        recipientCount: record.recipientCount,
        payloadJson: toPrismaJson(record.payloadJson),
        contextJson: toPrismaJson(record.contextJson),
        dedupeKey: record.dedupeKey,
        occurredAt: record.occurredAt,
        processedAt: record.processedAt,
        failedAt: record.failedAt
      },
      update: {
        status: record.status as NotificationEventStatus,
        recipientCount: record.recipientCount,
        payloadJson: toPrismaJson(record.payloadJson),
        contextJson: toPrismaJson(record.contextJson),
        processedAt: record.processedAt,
        failedAt: record.failedAt
      }
    });

    return mapNotificationEvent(event);
  }

  async findNotifications(filters: NotificationListFilters): Promise<Notification[]> {
    const rows = await this.prisma.notification.findMany({
      where: {
        departmentId: filters.departmentId,
        recipientUserId: filters.recipientUserId,
        status: filters.status as NotificationRecordStatus | undefined,
        eventCode: filters.eventCode
      },
      orderBy: { createdAt: "desc" },
      take: filters.limit,
      skip: filters.offset
    });

    return rows.map(mapNotification);
  }

  async findNotificationById(
    departmentId: string | null,
    id: string,
    recipientUserId?: string
  ): Promise<Notification | null> {
    const row = await this.prisma.notification.findFirst({
      where: {
        id,
        departmentId,
        recipientUserId
      }
    });

    return row ? mapNotification(row) : null;
  }

  async saveNotification(record: Notification): Promise<Notification> {
    const row = await this.prisma.notification.upsert({
      where: { id: record.id },
      create: {
        id: record.id,
        departmentId: record.departmentId,
        notificationEventId: record.notificationEventId,
        recipientUserId: record.recipientUserId,
        templateId: record.templateId,
        createdByUserId: record.createdByUserId,
        primaryChannel: record.primaryChannel as NotificationChannel,
        status: record.status as NotificationRecordStatus,
        eventCode: record.eventCode,
        subject: record.subject,
        title: record.title,
        body: record.body,
        payloadJson: toPrismaJson(record.payloadJson),
        actionUrl: record.actionUrl,
        isCritical: record.isCritical,
        readAt: record.readAt,
        dismissedAt: record.dismissedAt,
        expiresAt: record.expiresAt
      },
      update: {
        status: record.status as NotificationRecordStatus,
        subject: record.subject,
        title: record.title,
        body: record.body,
        payloadJson: toPrismaJson(record.payloadJson),
        actionUrl: record.actionUrl,
        isCritical: record.isCritical,
        readAt: record.readAt,
        dismissedAt: record.dismissedAt,
        expiresAt: record.expiresAt
      }
    });

    return mapNotification(row);
  }

  markNotificationRead(
    departmentId: string | null,
    id: string,
    recipientUserId: string
  ): Promise<Notification | null> {
    return this.updateRecipientNotification(departmentId, id, recipientUserId, {
      status: NotificationRecordStatus.READ,
      readAt: new Date()
    });
  }

  dismissNotification(
    departmentId: string | null,
    id: string,
    recipientUserId: string
  ): Promise<Notification | null> {
    return this.updateRecipientNotification(departmentId, id, recipientUserId, {
      status: NotificationRecordStatus.DISMISSED,
      dismissedAt: new Date()
    });
  }

  async saveNotificationDelivery(record: NotificationDelivery): Promise<NotificationDelivery> {
    const row = await this.prisma.notificationDelivery.upsert({
      where: {
        notificationId_channel_attemptNumber: {
          notificationId: record.notificationId,
          channel: record.channel as NotificationChannel,
          attemptNumber: record.attemptNumber
        }
      },
      create: {
        id: record.id,
        departmentId: record.departmentId,
        notificationId: record.notificationId,
        processedByUserId: record.processedByUserId,
        channel: record.channel as NotificationChannel,
        status: record.status as NotificationDeliveryStatus,
        destination: record.destination,
        provider: record.provider,
        providerMessageId: record.providerMessageId,
        attemptNumber: record.attemptNumber,
        retryCount: record.retryCount,
        nextRetryAt: record.nextRetryAt,
        errorCode: record.errorCode,
        errorMessage: record.errorMessage,
        metadataJson: toPrismaJson(record.metadataJson),
        sentAt: record.sentAt,
        deliveredAt: record.deliveredAt,
        failedAt: record.failedAt
      },
      update: {
        status: record.status as NotificationDeliveryStatus,
        destination: record.destination,
        provider: record.provider,
        providerMessageId: record.providerMessageId,
        retryCount: record.retryCount,
        nextRetryAt: record.nextRetryAt,
        errorCode: record.errorCode,
        errorMessage: record.errorMessage,
        metadataJson: toPrismaJson(record.metadataJson),
        sentAt: record.sentAt,
        deliveredAt: record.deliveredAt,
        failedAt: record.failedAt
      }
    });

    return mapNotificationDelivery(row);
  }

  async findNotificationTemplates(
    filters: NotificationTemplateListFilters
  ): Promise<NotificationTemplate[]> {
    const rows = await this.prisma.notificationTemplate.findMany({
      where: {
        departmentId: filters.departmentId,
        eventCode: filters.eventCode,
        channel: filters.channel as NotificationChannel | undefined,
        status: filters.status as undefined,
        locale: filters.locale
      },
      orderBy: { createdAt: "desc" },
      take: filters.limit,
      skip: filters.offset
    });

    return rows.map(mapNotificationTemplate);
  }

  async findNotificationTemplateById(
    departmentId: string | null,
    id: string
  ): Promise<NotificationTemplate | null> {
    const row = await this.prisma.notificationTemplate.findFirst({
      where: { id, departmentId }
    });
    return row ? mapNotificationTemplate(row) : null;
  }

  async findNotificationTemplate(
    departmentId: string | null,
    code: string,
    channel: string,
    locale: string
  ): Promise<NotificationTemplate | null> {
    const row = await this.prisma.notificationTemplate.findFirst({
      where: {
        departmentId,
        code,
        channel: channel as NotificationChannel,
        locale
      }
    });

    return row ? mapNotificationTemplate(row) : null;
  }

  async saveNotificationTemplate(record: NotificationTemplate): Promise<NotificationTemplate> {
    const row = await this.prisma.notificationTemplate.create({
      data: {
        id: record.id,
        departmentId: record.departmentId,
        code: record.code,
        name: record.name,
        eventCode: record.eventCode,
        channel: record.channel as NotificationChannel,
        status: record.status as never,
        locale: record.locale,
        subjectTemplate: record.subjectTemplate,
        titleTemplate: record.titleTemplate,
        bodyTemplate: record.bodyTemplate,
        variablesJson: toPrismaJson(record.variablesJson),
        isCritical: record.isCritical,
        createdByUserId: record.createdByUserId,
        updatedByUserId: record.updatedByUserId
      }
    });

    return mapNotificationTemplate(row);
  }

  async updateNotificationTemplate(
    departmentId: string | null,
    id: string,
    input: NotificationTemplate
  ): Promise<NotificationTemplate | null> {
    const result = await this.prisma.notificationTemplate.updateMany({
      where: { id, departmentId },
      data: {
        code: input.code,
        name: input.name,
        eventCode: input.eventCode,
        channel: input.channel as NotificationChannel,
        status: input.status as never,
        locale: input.locale,
        subjectTemplate: input.subjectTemplate,
        titleTemplate: input.titleTemplate,
        bodyTemplate: input.bodyTemplate,
        variablesJson: toPrismaJson(input.variablesJson),
        isCritical: input.isCritical,
        updatedByUserId: input.updatedByUserId,
        archivedAt: input.status === "ARCHIVED" ? new Date() : null
      }
    });

    if (result.count === 0) {
      return null;
    }

    return this.findNotificationTemplateById(departmentId, id);
  }

  async findNotificationPreferences(
    departmentId: string | null,
    userId: string
  ): Promise<NotificationPreference[]> {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { departmentId, userId },
      orderBy: [{ eventCode: "asc" }, { channel: "asc" }]
    });

    return rows.map(mapNotificationPreference);
  }

  async saveNotificationPreference(record: NotificationPreference): Promise<NotificationPreference> {
    const row = await this.prisma.notificationPreference.upsert({
      where: {
        userId_eventCode_channel: {
          userId: record.userId,
          eventCode: record.eventCode,
          channel: record.channel as NotificationChannel
        }
      },
      create: {
        id: record.id,
        departmentId: record.departmentId,
        userId: record.userId,
        eventCode: record.eventCode,
        channel: record.channel as NotificationChannel,
        isEnabled: record.isEnabled,
        isCriticalLocked: record.isCriticalLocked,
        settingsJson: toPrismaJson(record.settingsJson)
      },
      update: {
        departmentId: record.departmentId,
        isEnabled: record.isEnabled,
        isCriticalLocked: record.isCriticalLocked,
        settingsJson: toPrismaJson(record.settingsJson)
      }
    });

    return mapNotificationPreference(row);
  }

  async findNotificationPreference(
    userId: string,
    eventCode: string,
    channel: string
  ): Promise<NotificationPreference | null> {
    const row = await this.prisma.notificationPreference.findUnique({
      where: {
        userId_eventCode_channel: {
          userId,
          eventCode,
          channel: channel as NotificationChannel
        }
      }
    });

    return row ? mapNotificationPreference(row) : null;
  }

  async savePushSubscription(record: PushSubscription): Promise<PushSubscription> {
    const row = await this.prisma.pushSubscription.upsert({
      where: { endpointHash: record.endpointHash },
      create: {
        id: record.id,
        departmentId: record.departmentId,
        userId: record.userId,
        endpoint: record.endpoint,
        endpointHash: record.endpointHash,
        p256dhKey: record.p256dhKey,
        authKey: record.authKey,
        userAgent: record.userAgent,
        isActive: record.isActive,
        lastUsedAt: record.lastUsedAt,
        revokedAt: record.revokedAt
      },
      update: {
        departmentId: record.departmentId,
        userId: record.userId,
        endpoint: record.endpoint,
        p256dhKey: record.p256dhKey,
        authKey: record.authKey,
        userAgent: record.userAgent,
        isActive: record.isActive,
        lastUsedAt: record.lastUsedAt,
        revokedAt: record.revokedAt
      }
    });

    return mapPushSubscription(row);
  }

  async findPushSubscriptionByEndpointHash(
    endpointHash: string
  ): Promise<PushSubscription | null> {
    const row = await this.prisma.pushSubscription.findUnique({
      where: { endpointHash }
    });

    return row ? mapPushSubscription(row) : null;
  }

  private async updateRecipientNotification(
    departmentId: string | null,
    id: string,
    recipientUserId: string,
    data: Prisma.NotificationUpdateManyMutationInput
  ) {
    const result = await this.prisma.notification.updateMany({
      where: { id, departmentId, recipientUserId },
      data
    });

    if (result.count === 0) {
      return null;
    }

    return this.findNotificationById(departmentId, id, recipientUserId);
  }
}

function toPrismaJson(value: Record<string, unknown> | null | undefined) {
  return value as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined;
}

function mapJson(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function mapNotificationEvent(row: {
  id: string;
  departmentId: string | null;
  triggeredByUserId: string | null;
  eventCode: string;
  channelTargets: NotificationChannel[];
  status: string;
  recipientCount: number;
  payloadJson: Prisma.JsonValue | null;
  contextJson: Prisma.JsonValue | null;
  dedupeKey: string | null;
  occurredAt: Date;
  processedAt: Date | null;
  failedAt: Date | null;
}): NotificationEvent {
  return {
    id: row.id,
    departmentId: row.departmentId,
    triggeredByUserId: row.triggeredByUserId,
    eventCode: row.eventCode,
    channelTargets: row.channelTargets,
    status: row.status,
    recipientCount: row.recipientCount,
    payloadJson: mapJson(row.payloadJson),
    contextJson: mapJson(row.contextJson),
    dedupeKey: row.dedupeKey,
    occurredAt: row.occurredAt,
    processedAt: row.processedAt,
    failedAt: row.failedAt
  };
}

function mapNotification(row: {
  id: string;
  departmentId: string | null;
  notificationEventId: string | null;
  recipientUserId: string;
  templateId: string | null;
  createdByUserId: string | null;
  primaryChannel: NotificationChannel;
  status: string;
  eventCode: string;
  subject: string | null;
  title: string | null;
  body: string | null;
  payloadJson: Prisma.JsonValue | null;
  actionUrl: string | null;
  isCritical: boolean;
  readAt: Date | null;
  dismissedAt: Date | null;
  expiresAt: Date | null;
}): Notification {
  return {
    id: row.id,
    departmentId: row.departmentId,
    notificationEventId: row.notificationEventId,
    recipientUserId: row.recipientUserId,
    templateId: row.templateId,
    createdByUserId: row.createdByUserId,
    primaryChannel: row.primaryChannel,
    status: row.status,
    eventCode: row.eventCode,
    subject: row.subject,
    title: row.title,
    body: row.body,
    payloadJson: mapJson(row.payloadJson),
    actionUrl: row.actionUrl,
    isCritical: row.isCritical,
    readAt: row.readAt,
    dismissedAt: row.dismissedAt,
    expiresAt: row.expiresAt
  };
}

function mapNotificationDelivery(row: {
  id: string;
  departmentId: string | null;
  notificationId: string;
  processedByUserId: string | null;
  channel: NotificationChannel;
  status: string;
  destination: string | null;
  provider: string | null;
  providerMessageId: string | null;
  attemptNumber: number;
  retryCount: number;
  nextRetryAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  metadataJson: Prisma.JsonValue | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  failedAt: Date | null;
}): NotificationDelivery {
  return {
    id: row.id,
    departmentId: row.departmentId,
    notificationId: row.notificationId,
    processedByUserId: row.processedByUserId,
    channel: row.channel,
    status: row.status,
    destination: row.destination,
    provider: row.provider,
    providerMessageId: row.providerMessageId,
    attemptNumber: row.attemptNumber,
    retryCount: row.retryCount,
    nextRetryAt: row.nextRetryAt,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    metadataJson: mapJson(row.metadataJson),
    sentAt: row.sentAt,
    deliveredAt: row.deliveredAt,
    failedAt: row.failedAt
  };
}

function mapNotificationTemplate(row: {
  id: string;
  departmentId: string | null;
  code: string;
  name: string;
  eventCode: string;
  channel: NotificationChannel;
  status: string;
  locale: string;
  subjectTemplate: string | null;
  titleTemplate: string | null;
  bodyTemplate: string;
  variablesJson: Prisma.JsonValue | null;
  isCritical: boolean;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}): NotificationTemplate {
  return {
    id: row.id,
    departmentId: row.departmentId,
    code: row.code,
    name: row.name,
    eventCode: row.eventCode,
    channel: row.channel,
    status: row.status,
    locale: row.locale,
    subjectTemplate: row.subjectTemplate,
    titleTemplate: row.titleTemplate,
    bodyTemplate: row.bodyTemplate,
    variablesJson: mapJson(row.variablesJson),
    isCritical: row.isCritical,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId
  };
}

function mapNotificationPreference(row: {
  id: string;
  departmentId: string | null;
  userId: string;
  eventCode: string;
  channel: NotificationChannel;
  isEnabled: boolean;
  isCriticalLocked: boolean;
  settingsJson: Prisma.JsonValue | null;
}): NotificationPreference {
  return {
    id: row.id,
    departmentId: row.departmentId,
    userId: row.userId,
    eventCode: row.eventCode,
    channel: row.channel,
    isEnabled: row.isEnabled,
    isCriticalLocked: row.isCriticalLocked,
    settingsJson: mapJson(row.settingsJson)
  };
}

function mapPushSubscription(row: {
  id: string;
  departmentId: string | null;
  userId: string;
  endpoint: string;
  endpointHash: string;
  p256dhKey: string | null;
  authKey: string | null;
  userAgent: string | null;
  isActive: boolean;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}): PushSubscription {
  return {
    id: row.id,
    departmentId: row.departmentId,
    userId: row.userId,
    endpoint: row.endpoint,
    endpointHash: row.endpointHash,
    p256dhKey: row.p256dhKey,
    authKey: row.authKey,
    userAgent: row.userAgent,
    isActive: row.isActive,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt
  };
}
