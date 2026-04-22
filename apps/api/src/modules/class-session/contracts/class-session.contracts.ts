export interface ClassSessionRecord {
  id: string;
  departmentId: string;
  courseOfferingId: string;
  teacherAssignmentId?: string | null;
  sessionCode?: string | null;
  title?: string | null;
  status: string;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
}

