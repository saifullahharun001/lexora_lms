import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  NotificationChannel,
  NotificationRecordStatus,
  NotificationTemplateStatus,
  Prisma
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";
import type { PlatformRole } from "@lexora/types";
import type {
  Notification,
  NotificationDelivery,
  NotificationEvent,
  NotificationPreference,
  NotificationTemplate,
  PushSubscription
} from "../../contracts/notification.contracts";
import { NOTIFICATION_AUDIT_EVENTS } from "../../domain/notification.audit-events";
import { NOTIFICATION_REPOSITORY } from "../../domain/notification.constants";
import type {
  EmitNotificationEventInput,
  NotificationListFilters,
  NotificationRepositoryPort,
  NotificationTemplateListFilters
} from "../ports/notification.repository.port";

interface AuditMetadata {
  [key: string]: unknown;
}

export interface EmitNotificationEventServiceInput {
  eventCode: string;
  channelTargets: NotificationChannel[];
  recipientUserIds: string[];
  payloadJson?: Record<string, unknown>;
  contextJson?: Record<string, unknown>;
  dedupeKey?: string;
  title?: string;
  body?: string;
  subject?: string;
  actionUrl?: string;
  isCritical?: boolean;
}

export interface ListNotificationsServiceInput {
  status?: NotificationRecordStatus;
  eventCode?: string;
  recipientUserId?: string;
  limit: number;
  offset: number;
}

export interface CreateNotificationTemplateServiceInput {
  code: string;
  name: string;
  eventCode: string;
  channel: NotificationChannel;
  status: NotificationTemplateStatus;
  locale: string;
  subjectTemplate?: string;
  titleTemplate?: string;
  bodyTemplate: string;
  variablesJson?: Record<string, unknown>;
  isCritical?: boolean;
}

export interface UpdateNotificationTemplateServiceInput {
  code?: string;
  name?: string;
  eventCode?: string;
  channel?: NotificationChannel;
  status?: NotificationTemplateStatus;
  locale?: string;
  subjectTemplate?: string | null;
  titleTemplate?: string | null;
  bodyTemplate?: string;
  variablesJson?: Record<string, unknown> | null;
  isCritical?: boolean;
}

export interface UpdatePreferenceServiceInput {
  eventCode: string;
  channel: NotificationChannel;
  isEnabled: boolean;
  isCriticalLocked?: boolean;
  settingsJson?: Record<string, unknown>;
}

@Injectable()
export class NotificationService {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly repository: NotificationRepositoryPort,
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService
  ) {}

  async emitNotificationEvent(
    input: EmitNotificationEventServiceInput
  ): Promise<NotificationEvent> {
    const eventCode = input.eventCode.trim();

    if (!eventCode) {
      throw new BadRequestException("eventCode is required");
    }

    const channelTargets = Array.from(new Set(input.channelTargets));

    if (channelTargets.length === 0) {
      throw new BadRequestException("At least one notification channel is required");
    }

    const recipientUserIds = Array.from(new Set(input.recipientUserIds.map((id) => id.trim())));

    if (recipientUserIds.length === 0 || recipientUserIds.some((id) => !id)) {
      throw new BadRequestException("recipientUserIds must contain at least one user id");
    }

    await this.assertRecipientsInDepartment(recipientUserIds);

    const event = await this.repository.emitNotificationEvent({
      departmentId: this.getDepartmentId(),
      triggeredByUserId: this.getActorId(),
      eventCode,
      channelTargets,
      recipientUserIds,
      payloadJson: input.payloadJson,
      contextJson: input.contextJson,
      dedupeKey: input.dedupeKey?.trim() || null,
      title: input.title,
      body: input.body,
      subject: input.subject,
      actionUrl: input.actionUrl,
      isCritical: input.isCritical
    });

    await this.writeAudit(NOTIFICATION_AUDIT_EVENTS.EVENT_EMITTED, "notification_event", event.id, {
      eventCode,
      channelTargets,
      recipientCount: recipientUserIds.length,
      dedupeKey: input.dedupeKey ?? null
    });

    if (channelTargets.includes(NotificationChannel.IN_APP)) {
      await this.writeAudit(
        NOTIFICATION_AUDIT_EVENTS.NOTIFICATION_CREATED,
        "notification_event",
        event.id,
        {
          eventCode,
          recipientCount: recipientUserIds.length
        }
      );
    }

    return event;
  }

  listNotifications(input: ListNotificationsServiceInput): Promise<Notification[]> {
    const filters: NotificationListFilters = {
      departmentId: this.getDepartmentId(),
      status: input.status,
      eventCode: input.eventCode,
      limit: input.limit,
      offset: input.offset
    };

    if (this.hasRole("department_admin")) {
      filters.recipientUserId = input.recipientUserId;
    } else {
      filters.recipientUserId = this.getActorId();
    }

    return this.repository.findNotifications(filters);
  }

  async getNotification(id: string): Promise<Notification> {
    const notification = await this.repository.findNotificationById(
      this.getDepartmentId(),
      id,
      this.hasRole("department_admin") ? undefined : this.getActorId()
    );

    if (!notification) {
      throw new NotFoundException("Notification not found");
    }

    return notification;
  }

  async markNotificationRead(id: string): Promise<Notification> {
    const notification = await this.repository.markNotificationRead(
      this.getDepartmentId(),
      id,
      this.getActorId()
    );

    if (!notification) {
      throw new NotFoundException("Notification not found");
    }

    return notification;
  }

  async dismissOwnNotification(id: string, recipientUserId?: string): Promise<Notification> {
    if (recipientUserId && recipientUserId !== this.getActorId()) {
      throw new ForbiddenException("Users can only dismiss their own notifications");
    }

    const notification = await this.repository.dismissNotification(
      this.getDepartmentId(),
      id,
      this.getActorId()
    );

    if (!notification) {
      throw new NotFoundException("Notification not found");
    }

    await this.writeAudit(
      NOTIFICATION_AUDIT_EVENTS.NOTIFICATION_DISMISSED,
      "notification",
      notification.id,
      {
        eventCode: notification.eventCode,
        recipientUserId: notification.recipientUserId
      }
    );

    return notification;
  }

  async createNotificationTemplate(
    input: CreateNotificationTemplateServiceInput
  ): Promise<NotificationTemplate> {
    this.assertAdmin();
    const departmentId = this.getDepartmentId();

    const existing = await this.repository.findNotificationTemplate(
      departmentId,
      input.code,
      input.channel,
      input.locale
    );

    if (existing) {
      throw new BadRequestException("Notification template already exists for code/channel/locale");
    }

    const template = await this.repository.saveNotificationTemplate({
      id: randomUUID(),
      departmentId,
      code: input.code.trim(),
      name: input.name.trim(),
      eventCode: input.eventCode.trim(),
      channel: input.channel,
      status: input.status,
      locale: input.locale.trim() || "en",
      subjectTemplate: input.subjectTemplate,
      titleTemplate: input.titleTemplate,
      bodyTemplate: input.bodyTemplate,
      variablesJson: input.variablesJson,
      isCritical: input.isCritical ?? false,
      createdByUserId: this.getActorId(),
      updatedByUserId: this.getActorId()
    });

    await this.writeAudit(NOTIFICATION_AUDIT_EVENTS.TEMPLATE_CREATED, "notification_template", template.id, {
      code: template.code,
      eventCode: template.eventCode,
      channel: template.channel,
      status: template.status
    });

    return template;
  }

  listNotificationTemplates(
    filters: Omit<NotificationTemplateListFilters, "departmentId">
  ): Promise<NotificationTemplate[]> {
    this.assertAdmin();

    return this.repository.findNotificationTemplates({
      departmentId: this.getDepartmentId(),
      ...filters
    });
  }

  async updateNotificationTemplate(
    id: string,
    input: UpdateNotificationTemplateServiceInput
  ): Promise<NotificationTemplate> {
    this.assertAdmin();
    const departmentId = this.getDepartmentId();
    const existing = await this.repository.findNotificationTemplateById(departmentId, id);

    if (!existing) {
      throw new NotFoundException("Notification template not found");
    }

    const template = await this.repository.updateNotificationTemplate(departmentId, id, {
      ...existing,
      code: input.code?.trim() ?? existing.code,
      name: input.name?.trim() ?? existing.name,
      eventCode: input.eventCode?.trim() ?? existing.eventCode,
      channel: input.channel ?? existing.channel,
      status: input.status ?? existing.status,
      locale: input.locale?.trim() ?? existing.locale,
      subjectTemplate: input.subjectTemplate ?? existing.subjectTemplate,
      titleTemplate: input.titleTemplate ?? existing.titleTemplate,
      bodyTemplate: input.bodyTemplate ?? existing.bodyTemplate,
      variablesJson: input.variablesJson ?? existing.variablesJson,
      isCritical: input.isCritical ?? existing.isCritical,
      updatedByUserId: this.getActorId()
    });

    if (!template) {
      throw new NotFoundException("Notification template not found");
    }

    await this.writeAudit(NOTIFICATION_AUDIT_EVENTS.TEMPLATE_UPDATED, "notification_template", template.id, {
      code: template.code,
      eventCode: template.eventCode,
      channel: template.channel,
      status: template.status
    });

    return template;
  }

  listMyPreferences(): Promise<NotificationPreference[]> {
    return this.repository.findNotificationPreferences(this.getDepartmentId(), this.getActorId());
  }

  async updatePreference(input: UpdatePreferenceServiceInput): Promise<NotificationPreference> {
    const existing = await this.repository.findNotificationPreference(
      this.getActorId(),
      input.eventCode,
      input.channel
    );

    const isCriticalLocked = input.isCriticalLocked ?? existing?.isCriticalLocked ?? false;

    if ((existing?.isCriticalLocked || isCriticalLocked) && !input.isEnabled) {
      throw new BadRequestException("Critical notification preferences cannot be disabled");
    }

    const preference = await this.repository.saveNotificationPreference({
      id: existing?.id ?? randomUUID(),
      departmentId: this.getDepartmentId(),
      userId: this.getActorId(),
      eventCode: input.eventCode.trim(),
      channel: input.channel,
      isEnabled: input.isEnabled,
      isCriticalLocked,
      settingsJson: input.settingsJson
    });

    await this.writeAudit(NOTIFICATION_AUDIT_EVENTS.PREFERENCE_UPDATED, "notification_preference", preference.id, {
      eventCode: preference.eventCode,
      channel: preference.channel,
      isEnabled: preference.isEnabled,
      isCriticalLocked: preference.isCriticalLocked
    });

    return preference;
  }

  createInAppNotification(input: Notification): Promise<Notification> {
    return this.repository.saveNotification({
      ...input,
      departmentId: input.departmentId ?? this.getDepartmentId(),
      createdByUserId: input.createdByUserId ?? this.getActorId(),
      primaryChannel: NotificationChannel.IN_APP,
      status: input.status || NotificationRecordStatus.READY
    });
  }

  trackDeliveryAttempt(input: NotificationDelivery): Promise<NotificationDelivery> {
    return this.repository.saveNotificationDelivery(input);
  }

  registerPushSubscription(input: PushSubscription): Promise<PushSubscription> {
    return this.repository.savePushSubscription({
      ...input,
      departmentId: input.departmentId ?? this.getDepartmentId(),
      userId: input.userId || this.getActorId()
    });
  }

  private async assertRecipientsInDepartment(recipientUserIds: string[]) {
    const departmentId = this.getDepartmentId();
    const count = await this.prisma.user.count({
      where: {
        id: { in: recipientUserIds },
        departmentId,
        archivedAt: null
      }
    });

    if (count !== recipientUserIds.length) {
      throw new NotFoundException("One or more notification recipients were not found");
    }
  }

  private assertAdmin() {
    if (!this.hasRole("department_admin")) {
      throw new ForbiddenException("Department admin access is required");
    }
  }

  private getDepartmentId() {
    const principal = this.requestContextService.get()?.principal;

    if (!principal?.activeDepartmentId) {
      throw new BadRequestException("Active department context is required");
    }

    return principal.activeDepartmentId;
  }

  private getActorId() {
    const principal = this.requestContextService.get()?.principal;

    if (!principal?.actorId) {
      throw new BadRequestException("Authenticated actor is required");
    }

    return principal.actorId;
  }

  private hasRole(role: PlatformRole) {
    const principal = this.requestContextService.get()?.principal;
    const departmentId = principal?.activeDepartmentId;

    return Boolean(
      departmentId &&
        principal?.roleAssignments.some(
          (assignment) => assignment.departmentId === departmentId && assignment.role === role
        )
    );
  }

  private async writeAudit(
    action: string,
    targetType: string,
    targetId: string,
    metadata?: AuditMetadata
  ) {
    const requestContext = this.requestContextService.get();

    await this.prisma.auditLog.create({
      data: {
        requestId: requestContext?.requestId,
        actorUserId: this.getActorId(),
        actorType: "USER",
        departmentId: this.getDepartmentId(),
        action,
        targetType,
        targetId,
        outcome: "SUCCESS",
        ipAddress: requestContext?.audit.ipAddress,
        userAgent: requestContext?.audit.userAgent,
        contextJson: metadata as Prisma.InputJsonValue | undefined
      }
    });
  }
}
