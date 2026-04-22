export const PERMISSION_GROUPS = {
  IDENTITY_ACCESS: "identity-access",
  USER_MANAGEMENT: "user-management",
  DEPARTMENT_CONFIG: "department-config",
  COURSE_MANAGEMENT: "course-management",
  ENROLLMENT: "enrollment",
  ATTENDANCE: "attendance",
  ASSIGNMENT: "assignment",
  QUIZ: "quiz",
  RESULT_PROCESSING: "result-processing",
  TRANSCRIPT_VERIFICATION: "transcript-verification",
  DISCUSSION: "discussion",
  NOTIFICATION: "notification",
  FILE_STORAGE: "file-storage",
  AUDIT_COMPLIANCE: "audit-compliance",
  REPORTING_DASHBOARD: "reporting-dashboard",
  SYSTEM_CONFIGURATION: "system-configuration"
} as const;

export type PermissionGroup =
  (typeof PERMISSION_GROUPS)[keyof typeof PERMISSION_GROUPS];

