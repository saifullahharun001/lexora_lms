import { Injectable } from "@nestjs/common";

import { PrismaService } from "@/common/prisma/prisma.service";
import type { Notice } from "../../contracts/notice.contracts";
import type {
  CreateNoticeInput,
  NoticeListFilters,
  NoticeRepositoryPort,
  UpdateNoticeInput
} from "../../application/ports/notice.repository.port";

@Injectable()
export class PrismaNoticeRepository implements NoticeRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  createNotice(input: CreateNoticeInput): Promise<Notice> {
    return this.prisma.notice.create({
      data: {
        departmentId: input.departmentId,
        academicProgramId: input.academicProgramId ?? null,
        academicTermId: input.academicTermId ?? null,
        courseOfferingId: input.courseOfferingId ?? null,
        createdByUserId: input.createdByUserId,
        title: input.title,
        body: input.body,
        audienceType: input.audienceType as never,
        priority: input.priority as never,
        publishNotification: input.publishNotification,
        expiresAt: input.expiresAt ?? null
      }
    }) as Promise<Notice>;
  }

  findNotices(filters: NoticeListFilters): Promise<Notice[]> {
    return this.prisma.notice.findMany({
      where: {
        departmentId: filters.departmentId,
        archivedAt: filters.status === "ARCHIVED" ? { not: null } : undefined,
        status: filters.onlyPublished ? "PUBLISHED" : filters.status as never,
        audienceType: filters.audienceType as never,
        courseOfferingId: filters.courseOfferingId,
        academicProgramId: filters.academicProgramId,
        academicTermId: filters.academicTermId
      },
      orderBy: [
        { priority: "desc" },
        { createdAt: "desc" }
      ],
      take: filters.limit,
      skip: filters.offset
    }) as Promise<Notice[]>;
  }

  findNoticeById(departmentId: string, id: string): Promise<Notice | null> {
    return this.prisma.notice.findFirst({
      where: {
        id,
        departmentId
      }
    }) as Promise<Notice | null>;
  }

  updateNotice(
    departmentId: string,
    id: string,
    input: UpdateNoticeInput
  ): Promise<Notice | null> {
    return this.prisma.notice.updateMany({
      where: {
        id,
        departmentId,
        status: "DRAFT"
      },
      data: {
        updatedByUserId: input.updatedByUserId,
        academicProgramId: input.academicProgramId,
        academicTermId: input.academicTermId,
        courseOfferingId: input.courseOfferingId,
        title: input.title,
        body: input.body,
        audienceType: input.audienceType as never,
        priority: input.priority as never,
        publishNotification: input.publishNotification,
        expiresAt: input.expiresAt
      }
    }).then(async (result) => {
      if (result.count === 0) {
        return null;
      }

      return this.findNoticeById(departmentId, id);
    });
  }

  publishNotice(
    departmentId: string,
    id: string,
    publishedByUserId: string,
    notificationEventId?: string | null
  ): Promise<Notice | null> {
    return this.prisma.notice.updateMany({
      where: {
        id,
        departmentId,
        status: "DRAFT"
      },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        publishedByUserId,
        notificationEventId: notificationEventId ?? null
      }
    }).then(async (result) => {
      if (result.count === 0) {
        return null;
      }

      return this.findNoticeById(departmentId, id);
    });
  }

  archiveNotice(
    departmentId: string,
    id: string,
    updatedByUserId: string
  ): Promise<Notice | null> {
    return this.prisma.notice.updateMany({
      where: {
        id,
        departmentId,
        archivedAt: null
      },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
        updatedByUserId
      }
    }).then(async (result) => {
      if (result.count === 0) {
        return null;
      }

      return this.findNoticeById(departmentId, id);
    });
  }
}
