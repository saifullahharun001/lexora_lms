import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { NotificationChannel, Prisma } from "@prisma/client";

import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";
import { NotificationService } from "@/modules/notification/application/services/notification.service";
import type { PlatformRole } from "@lexora/types";
import type { Notice } from "../../contracts/notice.contracts";
import { NOTICE_AUDIT_EVENTS } from "../../domain/notice.audit-events";
import { NOTICE_REPOSITORY } from "../../domain/notice.constants";
import type {
  CreateNoticeInput,
  NoticeListFilters,
  NoticeRepositoryPort,
  UpdateNoticeInput
} from "../ports/notice.repository.port";

interface AuditMetadata {
  [key: string]: unknown;
}

export interface CreateNoticeServiceInput {
  academicProgramId?: string | null;
  academicTermId?: string | null;
  courseOfferingId?: string | null;
  title: string;
  body: string;
  audienceType?: string;
  priority?: string;
  publishNotification?: boolean;
  expiresAt?: Date | null;
}

export interface UpdateNoticeServiceInput {
  academicProgramId?: string | null;
  academicTermId?: string | null;
  courseOfferingId?: string | null;
  title?: string;
  body?: string;
  audienceType?: string;
  priority?: string;
  publishNotification?: boolean;
  expiresAt?: Date | null;
}

export interface ListNoticeServiceInput {
  status?: string;
  audienceType?: string;
  courseOfferingId?: string;
  academicProgramId?: string;
  academicTermId?: string;
  limit: number;
  offset: number;
}

@Injectable()
export class NoticeService {
  constructor(
    @Inject(NOTICE_REPOSITORY)
    private readonly repository: NoticeRepositoryPort,
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
    private readonly notificationService: NotificationService
  ) {}

  async create(input: CreateNoticeServiceInput): Promise<Notice> {
    this.assertCanManageNotice();
    this.assertNoticeScope(input);

    const title = input.title.trim();
    const body = input.body.trim();

    if (!title) {
      throw new BadRequestException("Notice title is required");
    }

    if (!body) {
      throw new BadRequestException("Notice body is required");
    }

    await this.assertScopeResourcesExist(input);

    const payload: CreateNoticeInput = {
      departmentId: this.getDepartmentId(),
      academicProgramId: input.academicProgramId ?? null,
      academicTermId: input.academicTermId ?? null,
      courseOfferingId: input.courseOfferingId ?? null,
      createdByUserId: this.getActorId(),
      title,
      body,
      audienceType: input.audienceType ?? "DEPARTMENT",
      priority: input.priority ?? "NORMAL",
      publishNotification: input.publishNotification ?? false,
      expiresAt: input.expiresAt ?? null
    };

    const notice = await this.repository.createNotice(payload);

    await this.writeAudit(NOTICE_AUDIT_EVENTS.NOTICE_CREATED, notice, {
      audienceType: notice.audienceType,
      priority: notice.priority,
      status: notice.status,
      courseOfferingId: notice.courseOfferingId ?? null
    });

    return notice;
  }

  list(input: ListNoticeServiceInput): Promise<Notice[]> {
    const filters: NoticeListFilters = {
      departmentId: this.getDepartmentId(),
      status: input.status,
      audienceType: input.audienceType,
      courseOfferingId: input.courseOfferingId,
      academicProgramId: input.academicProgramId,
      academicTermId: input.academicTermId,
      limit: input.limit,
      offset: input.offset
    };

    if (this.shouldUseSelfVisibility()) {
      filters.onlyPublished = true;
    }

    return this.repository.findNotices(filters);
  }

  listMyNotices(input: ListNoticeServiceInput): Promise<Notice[]> {
    return this.repository.findNotices({
      departmentId: this.getDepartmentId(),
      status: input.status,
      audienceType: input.audienceType,
      courseOfferingId: input.courseOfferingId,
      academicProgramId: input.academicProgramId,
      academicTermId: input.academicTermId,
      onlyPublished: true,
      limit: input.limit,
      offset: input.offset
    });
  }

  async getById(id: string): Promise<Notice> {
    const notice = await this.repository.findNoticeById(this.getDepartmentId(), id);

    if (!notice || (this.shouldUseSelfVisibility() && notice.status !== "PUBLISHED")) {
      throw new NotFoundException("Notice not found");
    }

    return notice;
  }

  async getMyNotice(id: string): Promise<Notice> {
    const notice = await this.repository.findNoticeById(this.getDepartmentId(), id);

    if (!notice || notice.status !== "PUBLISHED") {
      throw new NotFoundException("Notice not found");
    }

    return notice;
  }

  async update(id: string, input: UpdateNoticeServiceInput): Promise<Notice> {
    this.assertCanManageNotice();

    const existing = await this.repository.findNoticeById(this.getDepartmentId(), id);

    if (!existing) {
      throw new NotFoundException("Notice not found");
    }

    if (existing.status !== "DRAFT") {
      throw new BadRequestException("Only draft notices can be updated");
    }

    const scopeInput = {
      academicProgramId: input.academicProgramId ?? existing.academicProgramId,
      academicTermId: input.academicTermId ?? existing.academicTermId,
      courseOfferingId: input.courseOfferingId ?? existing.courseOfferingId,
      audienceType: input.audienceType ?? existing.audienceType
    };

    this.assertNoticeScope(scopeInput);
    await this.assertScopeResourcesExist(scopeInput);

    const updated = await this.repository.updateNotice(this.getDepartmentId(), id, {
      updatedByUserId: this.getActorId(),
      academicProgramId: input.academicProgramId,
      academicTermId: input.academicTermId,
      courseOfferingId: input.courseOfferingId,
      title: input.title?.trim(),
      body: input.body?.trim(),
      audienceType: input.audienceType,
      priority: input.priority,
      publishNotification: input.publishNotification,
      expiresAt: input.expiresAt
    });

    if (!updated) {
      throw new NotFoundException("Notice not found");
    }

    await this.writeAudit(NOTICE_AUDIT_EVENTS.NOTICE_UPDATED, updated, {
      updatedFields: Object.keys(input)
    });

    return updated;
  }

  async publish(id: string): Promise<Notice> {
    this.assertCanPublishNotice();

    const existing = await this.repository.findNoticeById(this.getDepartmentId(), id);

    if (!existing) {
      throw new NotFoundException("Notice not found");
    }

    if (existing.status !== "DRAFT") {
      throw new BadRequestException("Only draft notices can be published");
    }

    let notificationEventId: string | null = null;

    if (existing.publishNotification) {
      const recipients = await this.resolvePublishedNoticeRecipients(existing);

      if (recipients.length > 0) {
        const event = await this.notificationService.emitNotificationEvent({
          eventCode: "notice.published",
          channelTargets: [NotificationChannel.IN_APP],
          recipientUserIds: recipients,
          title: existing.title,
          body: existing.body,
          actionUrl: `/notices/${existing.id}`,
          isCritical: existing.priority === "URGENT",
          payloadJson: {
            noticeId: existing.id,
            audienceType: existing.audienceType,
            priority: existing.priority
          },
          dedupeKey: `notice.published.${existing.id}`
        });

        notificationEventId = event.id;
      }
    }

    const notice = await this.repository.publishNotice(
      this.getDepartmentId(),
      id,
      this.getActorId(),
      notificationEventId
    );

    if (!notice) {
      throw new NotFoundException("Notice not found");
    }

    await this.writeAudit(NOTICE_AUDIT_EVENTS.NOTICE_PUBLISHED, notice, {
      previousStatus: existing.status,
      status: notice.status,
      notificationEventId
    });

    return notice;
  }

  async archive(id: string): Promise<Notice> {
    this.assertCanManageNotice();

    const notice = await this.repository.archiveNotice(
      this.getDepartmentId(),
      id,
      this.getActorId()
    );

    if (!notice) {
      throw new NotFoundException("Notice not found");
    }

    await this.writeAudit(NOTICE_AUDIT_EVENTS.NOTICE_ARCHIVED, notice, {
      status: notice.status
    });

    return notice;
  }

  private assertCanManageNotice() {
    if (this.hasRole("department_admin")) {
      return;
    }

    if (this.hasRole("teacher")) {
      return;
    }

    throw new ForbiddenException("Notice management access is required");
  }

  private assertCanPublishNotice() {
    if (!this.hasRole("department_admin")) {
      throw new ForbiddenException("Only department admins can publish notices");
    }
  }

  private assertNoticeScope(input: {
    audienceType?: string;
    academicProgramId?: string | null;
    academicTermId?: string | null;
    courseOfferingId?: string | null;
  }) {
    const audienceType = input.audienceType ?? "DEPARTMENT";

    if (audienceType === "PROGRAM" && !input.academicProgramId) {
      throw new BadRequestException("academicProgramId is required for program notices");
    }

    if (audienceType === "ACADEMIC_TERM" && !input.academicTermId) {
      throw new BadRequestException("academicTermId is required for academic term notices");
    }

    if (audienceType === "COURSE_OFFERING" && !input.courseOfferingId) {
      throw new BadRequestException("courseOfferingId is required for course offering notices");
    }
  }

  private async assertScopeResourcesExist(input: {
    academicProgramId?: string | null;
    academicTermId?: string | null;
    courseOfferingId?: string | null;
  }) {
    const departmentId = this.getDepartmentId();

    if (input.academicProgramId) {
      const exists = await this.prisma.academicProgram.count({
        where: {
          id: input.academicProgramId,
          departmentId,
          archivedAt: null
        }
      });

      if (!exists) {
        throw new NotFoundException("Academic program not found");
      }
    }

    if (input.academicTermId) {
      const exists = await this.prisma.academicTerm.count({
        where: {
          id: input.academicTermId,
          departmentId,
          archivedAt: null
        }
      });

      if (!exists) {
        throw new NotFoundException("Academic term not found");
      }
    }

    if (input.courseOfferingId) {
      const exists = await this.prisma.courseOffering.count({
        where: {
          id: input.courseOfferingId,
          departmentId,
          archivedAt: null
        }
      });

      if (!exists) {
        throw new NotFoundException("Course offering not found");
      }

      if (this.hasRole("teacher") && !this.hasRole("department_admin")) {
        const assignment = await this.prisma.teacherCourseAssignment.count({
          where: {
            departmentId,
            courseOfferingId: input.courseOfferingId,
            teacherUserId: this.getActorId(),
            status: "ACTIVE",
            unassignedAt: null,
            archivedAt: null
          }
        });

        if (!assignment) {
          throw new ForbiddenException("Teacher is not assigned to this course offering");
        }
      }
    }
  }

  private shouldUseSelfVisibility() {
    return !this.hasRole("department_admin") && !this.hasRole("teacher");
  }

  private async resolvePublishedNoticeRecipients(notice: Notice): Promise<string[]> {
    const departmentId = this.getDepartmentId();

    if (notice.audienceType === "COURSE_OFFERING" && notice.courseOfferingId) {
      const enrollments = await this.prisma.enrollment.findMany({
        where: {
          departmentId,
          courseOfferingId: notice.courseOfferingId,
          archivedAt: null
        },
        select: {
          studentUserId: true
        }
      });

      return enrollments.map((enrollment) => enrollment.studentUserId);
    }

    const users = await this.prisma.user.findMany({
      where: {
        departmentId,
        archivedAt: null,
        status: "ACTIVE"
      },
      select: {
        id: true
      }
    });

    return users.map((user) => user.id);
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
    target: Notice,
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
        targetType: "notice",
        targetId: target.id,
        outcome: "SUCCESS",
        ipAddress: requestContext?.audit.ipAddress,
        userAgent: requestContext?.audit.userAgent,
        contextJson: metadata as Prisma.InputJsonValue | undefined
      }
    });
  }
}
