export const PLATFORM_ROLES = {
  DEPARTMENT_ADMIN: "department_admin",
  TEACHER: "teacher",
  STUDENT: "student",
  AUDITOR: "auditor",
  SUPPORT: "support"
} as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[keyof typeof PLATFORM_ROLES];

export const PRIVILEGED_PLATFORM_ROLES = [
  PLATFORM_ROLES.DEPARTMENT_ADMIN,
  PLATFORM_ROLES.TEACHER,
  PLATFORM_ROLES.AUDITOR,
  PLATFORM_ROLES.SUPPORT
] as const;

