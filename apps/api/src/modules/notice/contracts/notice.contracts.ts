export interface Notice {
  id: string;
  departmentId: string;
  academicProgramId?: string | null;
  academicTermId?: string | null;
  courseOfferingId?: string | null;
  createdByUserId: string;
  updatedByUserId?: string | null;
  publishedByUserId?: string | null;
  notificationEventId?: string | null;
  title: string;
  body: string;
  audienceType: string;
  priority: string;
  status: string;
  publishNotification: boolean;
  publishedAt?: Date | null;
  expiresAt?: Date | null;
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
