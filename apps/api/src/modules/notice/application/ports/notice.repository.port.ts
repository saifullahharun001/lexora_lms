import type { Notice } from "../../contracts/notice.contracts";

export interface CreateNoticeInput {
  departmentId: string;
  academicProgramId?: string | null;
  academicTermId?: string | null;
  courseOfferingId?: string | null;
  createdByUserId: string;
  title: string;
  body: string;
  audienceType: string;
  priority: string;
  publishNotification: boolean;
  expiresAt?: Date | null;
}

export interface UpdateNoticeInput {
  updatedByUserId: string;
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

export interface NoticeListFilters {
  departmentId: string;
  status?: string;
  audienceType?: string;
  courseOfferingId?: string;
  academicProgramId?: string;
  academicTermId?: string;
  onlyPublished?: boolean;
  limit: number;
  offset: number;
}

export interface NoticeRepositoryPort {
  createNotice(input: CreateNoticeInput): Promise<Notice>;
  findNotices(filters: NoticeListFilters): Promise<Notice[]>;
  findNoticeById(departmentId: string, id: string): Promise<Notice | null>;
  updateNotice(
    departmentId: string,
    id: string,
    input: UpdateNoticeInput
  ): Promise<Notice | null>;
  publishNotice(
    departmentId: string,
    id: string,
    publishedByUserId: string,
    notificationEventId?: string | null
  ): Promise<Notice | null>;
  archiveNotice(
    departmentId: string,
    id: string,
    updatedByUserId: string
  ): Promise<Notice | null>;
}
